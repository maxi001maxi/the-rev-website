/**
 * THE REV. Daily Editorial Autonomy v0.6.9
 * ONE-PASTE INSTALL BUNDLE
 *
 * Generated from:
 * - DailyEditorialGate_v0.6.9.gs
 * - DailyEditorialCreator_v0.6.9.gs
 * - DailyEditorialTopicApproval_v0.7.0.gs
 * - DailyEditorialSupervisorRecovery_v0.7.1.gs
 *
 * Paste this entire file into ONE file in the bound Apps Script project,
 * then run installDailyEditorialAutonomyV069() once.
 * Keep the existing v0.6.5.2 Supervisor in the same project.
 * v0.7.1 wraps its generation step with bounded QC crash self-recovery.
 */

/**
 * THE REV. Editorial AI v0.6.9
 * Daily Editorial Gate + Publish Reconciliation + Missed-Creation Watchdog
 *
 * Source of truth: GitHub maxi001maxi/the-rev-website
 *   editorial/gas/DailyEditorialGate_v0.6.9.gs
 * Decision engine: lib/dailyEditorialStateMachine.mjs (via the Vercel Bridge)
 *
 * Install: add this file to the bound Apps Script project next to v0.6.5.2,
 * then run installDailyEditorialGateV069() once. v0.6.5.2 Supervisor stays.
 *
 * What it does
 *  Editorial runs every day (shop closed days included). Each run prepares
 *  the article whose target_date = run_date + lead days (default: tomorrow).
 *  Whether a target day gets an article is the cadence setting
 *  (daily_editorial_cadence = BUSINESS_DAYS | DAILY), decided by the Bridge.
 *
 *  - 04:xx JST gate (before the 05:00 creator):
 *      START log -> POST Queue rows to editorial-status daily_plan ->
 *      apply evidence-backed PUBLISHED patches (Queue / Bridge / GBP URL) ->
 *      persist today's decision (CREATE_NEW / NO_ACTION + reason) -> END log.
 *  - 08:xx JST watchdog:
 *      if today was planned CREATE_NEW and 26_DAILY_EDITORIAL_QUEUE still has
 *      no row for today, log ERROR_BLOCKED and send LINE. Never silent.
 *
 * Invariants
 *  - REVIEW_READY counts toward the active cap but never blocks creation.
 *  - PUBLISHED is written only with Supabase verified publication evidence.
 *  - Notification failure is logged; it never changes Queue state.
 *  - Auto Publish stays OFF. Human Review & Publish remains mandatory.
 */

var V069_STATUS_ORIGIN = 'https://the-rev-website.vercel.app';
var V069_STATUS_URL = V069_STATUS_ORIGIN + '/api/integrations/editorial-status/';
var V069_GATE_HOUR = 4;
var V069_WATCHDOG_HOUR = 8;
var V069_GATE_JOB = 'DAILY_EDITORIAL_GATE';
var V069_WATCHDOG_JOB = 'DAILY_EDITORIAL_WATCHDOG';
var V069_PLAN_FIELDS = ['queue_id', 'run_date', 'target_date', 'content_id', 'queue_status', 'web_bridge_status', 'created_at', 'updated_at'];

function v069TodayKey_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// Each run prepares the article for today + lead days (default 1 = tomorrow).
// Must match daily_editorial_lead_days handling in lib/dailyEditorialStateMachine.mjs.
function v069LeadDays_() {
  var raw = v069Settings_().daily_editorial_lead_days;
  var n = Number(raw);
  return raw !== '' && raw !== null && raw !== undefined && n >= 0 && n <= 7 && n === Math.floor(n) ? n : 1;
}

// JST content day being prepared (26_DAILY_EDITORIAL_QUEUE.target_date).
function v069TargetKey_() {
  return Utilities.formatDate(new Date(new Date().getTime() + v069LeadDays_() * 86400000), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// JST YYYY-MM-DD for Date, 'YYYY/MM/DD', ISO or Sheets serial values.
// Unparseable values return '' (never "today").
function v069DateKey_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v || '').trim())) {
    var serial = Math.floor(Number(v));
    if (!(serial > 0)) return '';
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  var m = String(v || '').trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}

// The content day a Queue row is for. Rows without target_date are legacy
// same-day rows whose run_date is their target.
function v069RowTargetKey_(r) {
  return v069DateKey_(r.target_date) || v069DateKey_(r.run_date);
}

function v069Secret_() {
  var p = PropertiesService.getScriptProperties();
  return String(p.getProperty('THE_REV_WEB_BRIDGE_SECRET') || p.getProperty('EDITORIAL_BRIDGE_SECRET') || '').trim();
}

function v069Serialize_(v) {
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? '' : v;
}

function v069QueueRows_() {
  var qsh = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
  if (!qsh) throw new Error('v0.6.9: 26_DAILY_EDITORIAL_QUEUE is missing.');
  return { sheet: qsh, rows: getObjectsWithRow_(qsh) };
}

function v069Settings_() {
  var st = typeof getSettings_ === 'function' ? (getSettings_() || {}) : {};
  var out = {};
  Object.keys(st).forEach(function (k) {
    if (/^daily_editorial_/.test(k)) out[k] = v069Serialize_(st[k]);
  });
  return out;
}

function v069PostJson_(url, payload) {
  var current = url;
  for (var i = 0; i < 4; i++) {
    var res = UrlFetchApp.fetch(current, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + v069Secret_() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      followRedirects: false
    });
    var code = res.getResponseCode();
    if ([301, 302, 307, 308].indexOf(code) >= 0) {
      var h = res.getAllHeaders();
      var loc = String(h.Location || h.location || '').trim();
      if (!loc) break;
      current = /^https?:\/\//i.test(loc) ? loc : current.match(/^(https?:\/\/[^/]+)/i)[1] + (loc.charAt(0) === '/' ? loc : '/' + loc);
      continue;
    }
    var body = res.getContentText();
    var json = null;
    try { json = JSON.parse(body); } catch (_e) {}
    return { code: code, body: body, json: json };
  }
  return { code: 599, body: 'Too many redirects', json: null };
}

function v069FetchPlan_(rows) {
  if (!v069Secret_()) throw new Error('v0.6.9: EDITORIAL_BRIDGE_SECRET is not configured.');
  var slim = rows.map(function (r) {
    var o = {};
    V069_PLAN_FIELDS.forEach(function (k) { o[k] = v069Serialize_(r[k]); });
    return o;
  });
  var r = v069PostJson_(V069_STATUS_URL, {
    action: 'daily_plan',
    now: new Date().toISOString(),
    rows: slim,
    settings: v069Settings_()
  });
  if (r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true || !r.json.plan) {
    throw new Error('Daily plan failed: HTTP ' + r.code + ' / ' + String((r.json && r.json.message) || r.body || '').slice(0, 800));
  }
  return r.json.plan;
}

function v069AppendNote_(prev, note) {
  var p = String(prev || '');
  return p.indexOf(note) >= 0 ? p : (p ? p + ' | ' : '') + note;
}

function v069ApplyPublishPatches_(plan, queue) {
  var applied = [];
  var patches = (plan.reconciliation && plan.reconciliation.patches) || [];
  if (!patches.length) return applied;
  var bsh = ss_().getSheetByName('25_WEB_PUBLISH_BRIDGE');
  var gsh = ss_().getSheetByName('22_GBP_POST');
  var bridgeRows = bsh ? getObjectsWithRow_(bsh) : [];
  var gbpRows = gsh ? getObjectsWithRow_(gsh) : [];

  patches.forEach(function (p) {
    var q = queue.rows.filter(function (r) { return String(r.content_id || '').trim() === p.content_id; })[0];
    if (!q || ['PUBLISHED', 'SKIPPED'].indexOf(String(q.queue_status || '').toUpperCase()) >= 0) return;
    var note = 'v0.6.9 publish reconciled ' + p.publish_verified_at + ' ' + p.published_url;
    setObjectRow_(queue.sheet, q.__row, {
      queue_status: 'PUBLISHED',
      web_bridge_status: 'PUBLISHED',
      last_successful_stage: 'PUBLISHED',
      next_stage: '',
      human_action_required: 'NONE',
      last_error: '',
      notes: v069AppendNote_(q.notes, note),
      updated_at: new Date()
    });
    q.queue_status = 'PUBLISHED';

    var b = bridgeRows.filter(function (r) { return String(r.content_id || '').trim() === p.content_id; })[0];
    if (b) {
      setObjectRow_(bsh, b.__row, {
        bridge_status: 'PUBLISHED',
        published_url: p.published_url,
        action: 'published_verified',
        synced_at: new Date(),
        notes: v069AppendNote_(b.notes, note)
      });
    }

    gbpRows.filter(function (r) { return String(r.parent_blog_id || '').trim() === p.content_id; }).forEach(function (g) {
      var patch = {};
      if (String(g.blog_url_placeholder || '').trim() === '[BLOG_URL]') patch.blog_url_placeholder = p.published_url;
      if (String(g.body_copy_paste || '').indexOf('[BLOG_URL]') >= 0) patch.body_copy_paste = String(g.body_copy_paste).split('[BLOG_URL]').join(p.published_url);
      if (String(g.post_ready || '').toUpperCase() === 'BLOCKED_URL') patch.post_ready = 'READY';
      if (Object.keys(patch).length) {
        patch.notes = v069AppendNote_(g.notes, 'v0.6.9 parent Blog URL verified');
        setObjectRow_(gsh, g.__row, patch);
      }
    });
    applied.push(p.content_id);
  });
  return applied;
}

function v069LinePush_(text) {
  var props = PropertiesService.getScriptProperties();
  var tokenValue = String(props.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN') || '').trim();
  var userId = String(props.getProperty('THE_REV_LINE_USER_ID') || '').trim();
  if (!tokenValue || !userId) return { status: 'SKIPPED', reason: 'LINE_CONFIG_MISSING' };
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + tokenValue },
      payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: String(text || '').slice(0, 4900) }] }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    return code >= 200 && code < 300 ? { status: 'SENT', http_status: code } : { status: 'ERROR', http_status: code };
  } catch (e) {
    return { status: 'ERROR', error: String(e && e.message || e) };
  }
}

function v069StartLog_(job) {
  return typeof startAutomationLog_ === 'function' ? startAutomationLog_(job, 'TIME_TRIGGER') : '';
}

function v069FinishLog_(runId, status, count, summary, error) {
  if (runId && typeof finishAutomationLog_ === 'function') finishAutomationLog_(runId, status, count, summary, error || '');
}

function scheduledDailyEditorialGateV069Unlocked_() {
  var runId = v069StartLog_(V069_GATE_JOB);
  try {
    var queue = v069QueueRows_();
    var plan = v069FetchPlan_(queue.rows);
    var applied = v069ApplyPublishPatches_(plan, queue);
    PropertiesService.getScriptProperties().setProperty(
      'THE_REV_DAILY_GATE_' + plan.target_date,
      JSON.stringify({ action: plan.decision.action, reason: plan.decision.reason, active: plan.active.count, cap: plan.active.cap })
    );
    var summary = 'run_date=' + plan.run_date + ' target_date=' + plan.target_date + ' ' + plan.weekday +
      ' cadence=' + plan.cadence +
      ' decision=' + plan.decision.action + '/' + plan.decision.reason +
      ' active=' + plan.active.count + '/' + plan.active.cap +
      ' published_reconciled=' + (applied.join(',') || 'none') +
      ' review_ready_blocks_creation=false';
    v069FinishLog_(runId, plan.decision.action === 'CREATE_NEW' ? 'CREATE_NEW' : 'NO_ACTION', applied.length, summary, '');
    return { status: plan.decision.action, plan: plan, applied: applied };
  } catch (e) {
    var msg = typeof errorText_ === 'function' ? errorText_(e) : String(e && e.stack || e);
    v069FinishLog_(runId, 'ERROR_BLOCKED', 0, 'Daily Editorial gate failed', msg);
    var sent = v069LinePush_('THE REV. Editorial AI｜Daily Editorial Gateが停止しました\n\n' + String(msg).slice(0, 1200));
    return { status: 'ERROR_BLOCKED', error: msg, notification: sent };
  }
}

function scheduledDailyEditorialWatchdogV069Unlocked_() {
  if (String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE') {
    if (typeof v070TopicTick_ !== 'function') throw new Error('TOPIC_APPROVAL_SOURCE_NOT_INSTALLED');
    return v070TopicTick_(false);
  }
  // `today` is the target article day the Gate planned during this run.
  var today = v069TargetKey_();
  var raw = PropertiesService.getScriptProperties().getProperty('THE_REV_DAILY_GATE_' + today);
  var gate = null;
  try { gate = raw ? JSON.parse(raw) : null; } catch (_e) {}
  if (!gate || gate.action !== 'CREATE_NEW') return { status: 'NO_WATCH', gate: gate };

  var queue = v069QueueRows_();
  var created = queue.rows.some(function (r) {
    return v069RowTargetKey_(r) === today && String(r.queue_status || '').toUpperCase() !== 'SKIPPED';
  });
  if (created) return { status: 'CREATED' };

  var alertKey = 'THE_REV_DAILY_MISSED_ALERT_' + today;
  var props = PropertiesService.getScriptProperties();
  var runId = v069StartLog_(V069_WATCHDOG_JOB);
  var sent = props.getProperty(alertKey) === 'SENT'
    ? { status: 'ALREADY_SENT' }
    : v069LinePush_('THE REV. Editorial AI｜Daily Editorialの準備が開始されていません\n\n' +
      '対象日: ' + today + '\nGate判定: CREATE_NEW (active ' + gate.active + '/' + gate.cap + ')\n' +
      '26_DAILY_EDITORIAL_QUEUEに対象日の行がありません。Daily Creatorを確認してください。');
  if (sent.status === 'SENT') props.setProperty(alertKey, 'SENT');
  v069FinishLog_(runId, 'ERROR_BLOCKED', 0,
    'DAILY_CREATION_NOT_STARTED target_date=' + today + ' notification=' + sent.status,
    sent.status === 'SENT' || sent.status === 'ALREADY_SENT' ? '' : 'LINE notification unverified: ' + JSON.stringify(sent));
  return { status: 'ERROR_BLOCKED', notification: sent };
}

function v069WithLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { status: 'BUSY' };
  try { return fn(); } finally { try { lock.releaseLock(); } catch (_e) {} }
}

function scheduledDailyEditorialGateV069() {
  return v069WithLock_(scheduledDailyEditorialGateV069Unlocked_);
}

function scheduledDailyEditorialWatchdogV069() {
  return v069WithLock_(scheduledDailyEditorialWatchdogV069Unlocked_);
}

function installDailyEditorialGateV069() {
  if (!v069Secret_()) throw new Error('v0.6.9 BLOCKED. EDITORIAL_BRIDGE_SECRET is missing.');
  // v0.6.8 Asset Ledger may still be installed in the bound script. Its old
  // preview-alias fallback is protected by Vercel Authentication and can return
  // dashboard HTML with HTTP 200. Pin all status polling to the stable production
  // alias so GBP/image ledger sync sees JSON from editorial-status.
  PropertiesService.getScriptProperties().setProperty('EDITORIAL_STATUS_BASE_URL', V069_STATUS_ORIGIN);
  var handlers = ['scheduledDailyEditorialGateV069', 'scheduledDailyEditorialWatchdogV069'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scheduledDailyEditorialGateV069').timeBased().atHour(V069_GATE_HOUR).everyDays(1).inTimezone('Asia/Tokyo').create();
  ScriptApp.newTrigger('scheduledDailyEditorialWatchdogV069').timeBased().atHour(V069_WATCHDOG_HOUR).everyDays(1).inTimezone('Asia/Tokyo').create();
  return {
    status: 'INSTALLED',
    version: 'v0.6.9',
    gate_hour_jst: V069_GATE_HOUR,
    watchdog_hour_jst: V069_WATCHDOG_HOUR,
    review_ready_blocks_creation: false,
    editorial_status_base_url: V069_STATUS_ORIGIN,
    status_base_repaired: true,
    auto_publish: false,
    human_approval: true
  };
}

function runDailyEditorialGateV069Once() {
  return scheduledDailyEditorialGateV069();
}


/**
 * THE REV. Editorial AI v0.6.9
 * Daily Creator: connects the Gate's CREATE_NEW decision to real work.
 *
 * Source of truth: GitHub maxi001maxi/the-rev-website
 *   editorial/gas/DailyEditorialCreator_v0.6.9.gs
 * Selection logic (no LLM): lib/dailyEditorialCreator.mjs via the Vercel Bridge
 *   POST /api/integrations/editorial-status {action:'daily_create'}
 *
 * Requires (same Apps Script project):
 *   - DailyEditorialGate_v0.6.9.gs  (shared v069* helpers)
 *   - v0.6.5.2 Unified Direct Bridge Supervisor, 1-minute trigger
 *
 * Editorial runs every day, shop closed days included. Each run prepares the
 * article whose target_date = run_date + lead days (default: tomorrow), when
 * the cadence (BUSINESS_DAYS | DAILY) schedules that target day.
 *
 * What it does, every hour from 05:00 to 11:59 JST:
 *   1. Fail closed unless the v0.6.5.2 Supervisor is installed and triggered.
 *   2. Ask the Bridge for the Gate decision + deterministic topic selection.
 *   3. Reconcile verified publications (Queue / Bridge / GBP URL).
 *   4. CREATE_NEW -> append today's 26_DAILY_EDITORIAL_QUEUE row
 *        (DRAFTING / SUFFICIENT / NOT_REQUIRED / NOT_STARTED),
 *      read it back, mark the shortlist candidate SELECTED, log CREATED.
 *      The Supervisor then runs Draft/QC -> GBP -> Bridge -> Images ->
 *      REVIEW_READY -> LINE with no human step.
 *   5. A REVIEW_READY article the Supervisor did not announce (it only
 *      announces rows whose run_date is today) is announced here, once.
 *   6. No eligible candidate / only Interview-needing candidates / stuck rows
 *      -> ERROR_BLOCKED + LINE (once). Never silent.
 *
 * Idempotent per run_date. Hourly retries make a missed 05:00 self-healing.
 * REVIEW_READY never blocks creation. Auto Publish stays OFF; Final Publish
 * and GBP posting remain human-approved.
 */

var V069C_JOB = 'DAILY_EDITORIAL_CREATE';
var V069C_END_HOUR = 12;
var V069C_START_HOUR_DEFAULT = 5;
var V069C_SUPERVISOR_HANDLER = 'scheduledDailyEditorialSupervisorV065';
// The 1-minute Supervisor trigger is renamed by later patches (v0.6.7 installs
// scheduledDailyEditorialSupervisorV067, which wraps V065). Any version counts.
var V069C_SUPERVISOR_TRIGGER_PATTERN = /^scheduledDailyEditorialSupervisorV0\d+$/;
var V069C_SUPERVISOR_FUNCTIONS = [
  'v065ResumeNoInterviewSelf_', 'v065PollImage_', 'v065NotifyReviewReady_',
  'generateWebBlogDraft_', 'finalizeWebBlog_', 'generateGBPFromBlog_', 'v065SyncBridgeDirect_'
];
var V069C_SHORTLIST_FIELDS = [
  'candidate_id', 'week_start', 'generated_at', 'rank', 'status', 'decision', 'route_lane', 'topic',
  'title_candidate', 'primary_query', 'audience_question', 'why_now', 'local_angle', 'unique_angle', 'main_claim',
  'selection_reason', 'article_type', 'total_score', 'source_refs', 'notes', 'comparison_doc_url',
  'content_pillar', 'pillar_recent12_count', 'pillar_diversity_adjustment', 'pillar_adjusted_score',
  'pillar_policy_version', 'content_cluster', 'cluster_recent4_count', 'cluster_priority_adjustment',
  'cluster_policy_version', 'editorial_lane', 'portfolio_recent12_count', 'portfolio_soft_target',
  'portfolio_adjustment', 'portfolio_final_score'
];
var V069C_PLAN_FIELDS = [
  'queue_id', 'run_date', 'target_date', 'content_id', 'topic_candidate_id', 'primary_query', 'queue_status',
  'draft_status', 'web_bridge_status', 'created_at', 'updated_at', 'topic', 'title', 'article_type',
  'audience_question', 'unique_angle', 'main_claim', 'content_cluster', 'content_pillar',
  'topic_gate_json', 'knowledge_context_json'
];

function v069cJstHour_() {
  return Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'));
}

function v069cFnExists_(name) {
  try { return typeof eval(name) === 'function'; } catch (_e) { return false; }
}

// The Creator only writes the Queue row. Without the Supervisor nothing would
// draft it, so refuse to create and say why.
function v069cSupervisorWired_() {
  var missing = V069C_SUPERVISOR_FUNCTIONS.filter(function (n) { return !v069cFnExists_(n); });
  var handlers = ScriptApp.getProjectTriggers()
    .map(function (t) { return String(t.getHandlerFunction() || ''); })
    .filter(function (h) { return V069C_SUPERVISOR_TRIGGER_PATTERN.test(h); });
  if (!handlers.length) missing.push('trigger:scheduledDailyEditorialSupervisorV0xx');
  return { ok: missing.length === 0, missing: missing, supervisor_triggers: handlers };
}

function v069cSlim_(obj, fields) {
  var o = {};
  fields.forEach(function (k) { o[k] = v069Serialize_(obj[k]); });
  return o;
}

function v069cShortlist_() {
  var sh = ss_().getSheetByName('23_BLOG_TOPIC_SHORTLIST');
  if (!sh) throw new Error('v0.6.9: 23_BLOG_TOPIC_SHORTLIST is missing.');
  return { sheet: sh, rows: getObjectsWithRow_(sh) };
}

function v069cRequest_(queue, shortlist) {
  if (!v069Secret_()) throw new Error('v0.6.9: EDITORIAL_BRIDGE_SECRET is not configured.');
  var r = v069PostJson_(V069_STATUS_URL, {
    action: 'daily_create',
    now: new Date().toISOString(),
    rows: queue.rows.map(function (x) { return v069cSlim_(x, V069C_PLAN_FIELDS); }),
    shortlist: shortlist.rows.map(function (x) { return v069cSlim_(x, V069C_SHORTLIST_FIELDS); }),
    outputRows: getObjectsWithRow_(ss_().getSheetByName('21_WEB_BLOG_OUTPUT')).map(function(x) {
      var row = v069cSlim_(x, ['content_id','title','slug_suggestion','target_keyword','search_intent','meta_description','article_type']);
      row.body_summary = String(x.body_markdown || '').replace(/\s+/g, ' ').slice(0,1800);
      return row;
    }),
    settings: v069Settings_()
  });
  if (r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true || !r.json.plan || !r.json.creation) {
    throw new Error('daily_create failed: HTTP ' + r.code + ' / ' + String((r.json && r.json.message) || r.body || '').slice(0, 800));
  }
  (r.json.creation.considered || []).forEach(function(e) {
    if (!e.duplicate || !e.duplicate.overlap) return;
    var hit = shortlist.rows.filter(function(x) { return String(x.candidate_id) === e.candidate_id; })[0];
    if (hit && ['SELECTED','PUBLISHED','USED','PREVIEW_PUBLISHED'].indexOf(String(hit.status).toUpperCase()) < 0) setObjectRow_(shortlist.sheet, hit.__row, {status:'SKIPPED_OVERLAP',notes:v069AppendNote_(hit.notes, JSON.stringify(e.duplicate.matches))});
  });
  return r.json;
}

// One LINE per (key). A failed push is logged by the caller as unverified and
// is retried on the next tick; it never changes Queue state.
function v069cNotifyOnce_(key, text) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(key) === 'SENT') return { status: 'ALREADY_SENT' };
  var sent = v069LinePush_(text);
  if (sent.status === 'SENT') props.setProperty(key, 'SENT');
  return sent;
}

function v069cBlock_(today, kind, summary, human, extra) {
  var runId = v069StartLog_(V069C_JOB);
  var sent = v069cNotifyOnce_(
    'THE_REV_DAILY_MISSED_ALERT_' + today,
    'THE REV. Editorial AI｜Daily Editorialの準備を開始できません\n\n' +
    '対象日: ' + today + '\n状態: ' + kind + '\n' + summary + '\n' +
    (human ? '必要な対応: ' + human + '\n' : '') + (extra || '')
  );
  var delivered = sent.status === 'SENT' || sent.status === 'ALREADY_SENT';
  v069FinishLog_(runId, 'ERROR_BLOCKED', 0, kind + ' target_date=' + today + ' ' + summary + ' notification=' + sent.status,
    delivered ? '' : 'LINE notification unverified: ' + JSON.stringify(sent));
  return { status: 'ERROR_BLOCKED', kind: kind, notification: sent };
}

// appendObjectRow_ silently drops keys that are not in the header row, so the
// target_date column must exist before the row is written.
function v069cEnsureColumn_(sh, name) {
  var last = sh.getLastColumn();
  var header = sh.getRange(1, 1, 1, last).getValues()[0].map(String);
  if (header.indexOf(name) >= 0) return false;
  if (sh.getMaxColumns() < last + 1) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
  sh.getRange(1, last + 1).setValue(name);
  return true;
}

function v069cAppendQueueRow_(queue, row) {
  v069cEnsureColumn_(queue.sheet, 'target_date');
  var obj = {};
  Object.keys(row).forEach(function (k) { obj[k] = row[k]; });
  obj.created_at = new Date(row.created_at);
  obj.updated_at = new Date(row.updated_at);
  appendObjectRow_(queue.sheet, obj);
}

function v069cMarkShortlistSelected_(shortlist, candidateId, contentId) {
  var hit = shortlist.rows.filter(function (r) { return String(r.candidate_id || '').trim() === candidateId; })[0];
  if (!hit) return false;
  setObjectRow_(shortlist.sheet, hit.__row, {
    status: 'SELECTED',
    notes: v069AppendNote_(hit.notes, 'v0.6.9 Daily Creator selected -> ' + contentId)
  });
  return true;
}

function v069cLengthRetryCount_(notes) {
  var m = String(notes || '').match(/\[AUTO_LENGTH_RETRY:(\d+)\]/g) || [];
  if (!m.length) return 0;
  var last = m[m.length - 1].match(/(\d+)/);
  return last ? Number(last[1]) : 0;
}

// A short STANDARD draft is an automation-owned quality miss, not a human
// editorial decision. Requeue a bounded number of times so the existing
// Supervisor can regenerate it. Fact/QC failures remain REVIEW_REQUIRED.
function v069cRecoverLengthReviewRequired_() {
  var queue = v069QueueRows_();
  var st = v069Settings_();
  var min = Math.max(1200, Number(st.blog_standard_min_chars || 1600));
  var maxDeficit = Math.max(200, Math.round(min * 0.15));
  var maxRetries = 2;
  var rows = queue.rows
    .filter(function (r) {
      return String(r.queue_status || '').toUpperCase() === 'REVIEW_REQUIRED' &&
        String(r.draft_status || '').toUpperCase() === 'REVIEW_REQUIRED' &&
        /^STANDARD length gate failed:\s*\d+\s*chars$/i.test(String(r.last_error || '').trim());
    })
    .sort(function (a, b) { return new Date(a.updated_at || 0) - new Date(b.updated_at || 0); });

  if (!rows.length) return { status: 'NO_LENGTH_RECOVERY' };
  var q = rows[0];
  var m = String(q.last_error || '').match(/(\d+)/);
  var count = m ? Number(m[1]) : 0;
  var deficit = min - count;
  var attempts = v069cLengthRetryCount_(q.notes);

  if (!(deficit > 0) || deficit > maxDeficit || attempts >= maxRetries) {
    var notice = v069cNotifyOnce_(
      'THE_REV_DAILY_LENGTH_REVIEW_' + String(q.content_id || ''),
      'THE REV. Editorial AI｜記事の文字数QCで人間確認が必要です\n\n' +
      'Content ID: ' + String(q.content_id || '') + '\n' +
      '現在: ' + count + '字 / 下限: ' + min + '字\n' +
      '自動再生成回数: ' + attempts
    );
    return {
      status: 'HUMAN_REVIEW_REQUIRED',
      content_id: String(q.content_id || ''),
      count: count,
      min: min,
      deficit: deficit,
      attempts: attempts,
      notification: notice.status
    };
  }

  var nextAttempt = attempts + 1;
  var note = String(q.notes || '').trim();
  note += (note ? ' | ' : '') + '[AUTO_LENGTH_RETRY:' + nextAttempt + '] previous=' + count + ' min=' + min;
  setObjectRow_(queue.sheet, q.__row, {
    queue_status: 'PATCHING',
    draft_status: 'NOT_STARTED',
    last_error: '',
    failed_stage: '',
    next_stage: 'BLOG_DRAFT',
    human_action_required: 'NONE',
    notes: note,
    updated_at: new Date()
  });
  var runId = v069StartLog_('DAILY_EDITORIAL_LENGTH_RECOVERY');
  v069FinishLog_(
    runId,
    'REQUEUED',
    1,
    'content_id=' + String(q.content_id || '') + ' previous=' + count + ' min=' + min + ' attempt=' + nextAttempt,
    ''
  );
  return {
    status: 'REQUEUED',
    content_id: String(q.content_id || ''),
    count: count,
    min: min,
    deficit: deficit,
    attempt: nextAttempt
  };
}

function v069cStuckAlerts_(stuck, today) {
  var out = [];
  (stuck || []).forEach(function (s) {
    var sent = v069cNotifyOnce_(
      'THE_REV_DAILY_STUCK_' + today + '_' + s.content_id + '_' + s.reason,
      'THE REV. Editorial AI｜記事の進行が止まっています\n\n' +
      'Content ID: ' + s.content_id + '\n状態: ' + s.queue_status + '\n原因: ' + s.reason +
      (s.age_minutes != null ? '\n停止: ' + s.age_minutes + '分' : '')
    );
    out.push({ content_id: s.content_id, reason: s.reason, notification: sent.status });
  });
  return out;
}

// v0.6.5.2 announces REVIEW_READY only while run_date is today. An article
// that becomes ready after its run day ended (for example images finishing
// overnight) would never be announced. Announce upcoming articles here, with
// the same de-dupe key so nothing is announced twice.
function v069cNotifyPreparedReady_() {
  var today = v069TodayKey_();
  var props = PropertiesService.getScriptProperties();
  var out = [];
  v069QueueRows_().rows.forEach(function (q) {
    var contentId = String(q.content_id || '').trim();
    if (!contentId || String(q.queue_status || '').toUpperCase() !== 'REVIEW_READY') return;
    var runKey = v069RowTargetKey_(q);
    if (!runKey || runKey < today || v069DateKey_(q.run_date) === today) return;
    var key = 'THE_REV_DAILY_FINAL_LINE_NOTIFIED_' + contentId;
    if (props.getProperty(key) === 'TRUE') return;
    var sent = v069LinePush_([
      'THE REV. Editorial AI｜' + runKey + ' 分の記事が出来上がりました', '',
      String(q.topic || ''), '',
      q.review_url ? '公開前確認：\n' + String(q.review_url) : 'Review Readyになりました。', '',
      '※まだWebサイトには公開していません。'
    ].join('\n'));
    if (sent.status === 'SENT') props.setProperty(key, 'TRUE');
    out.push({ content_id: contentId, run_date: runKey, notification: sent.status });
  });
  return out;
}

function scheduledDailyEditorialCreatorV069Unlocked_(force) {
  if (String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE') {
    if (typeof v070TopicTick_ !== 'function') throw new Error('TOPIC_APPROVAL_SOURCE_NOT_INSTALLED');
    return v070TopicTick_(force);
  }
  var lengthRecovery = { status: 'NO_LENGTH_RECOVERY' };
  try { lengthRecovery = v069cRecoverLengthReviewRequired_(); } catch (_lr) {}
  var readyNotices = [];
  try { readyNotices = v069cNotifyPreparedReady_(); } catch (_n) {}
  var startHour = Number(v069Settings_().daily_editorial_hour);
  if (!(startHour >= 0)) startHour = V069C_START_HOUR_DEFAULT;
  var hour = v069cJstHour_();
  if (force !== true && (hour < startHour || hour >= V069C_END_HOUR)) return { status: 'OUTSIDE_WINDOW', hour: hour, length_recovery: lengthRecovery, review_ready_notices: readyNotices };

  // `today` is the target content day (run day + lead days), the Queue target_date.
  var today = v069TargetKey_();
  var wired = v069cSupervisorWired_();
  if (!wired.ok) {
    return v069cBlock_(today, 'SUPERVISOR_NOT_WIRED', '記事を進行させるv0.6.5.2 Supervisorが未導入または未起動です: ' + wired.missing.join(', '),
      'installEditorialV065() を実行して1分Triggerを有効化');
  }

  var queue, shortlist, res;
  try {
    queue = v069QueueRows_();
    shortlist = v069cShortlist_();
    res = v069cRequest_(queue, shortlist);
  } catch (e) {
    var msg = typeof errorText_ === 'function' ? errorText_(e) : String(e && e.stack || e);
    var blocked = v069cBlock_(today, 'CREATOR_PLAN_FAILED', String(msg).slice(0, 600), 'Vercel Bridge / Supabase / Sheets を確認');
    return blocked;
  }

  var plan = res.plan;
  var applied = v069ApplyPublishPatches_(plan, queue);
  var stuckNotices = v069cStuckAlerts_(res.stuck, today);
  var creation = res.creation;

  if (creation.status === 'NOT_REQUIRED') {
    return { status: 'NO_ACTION', reason: creation.reason, published_reconciled: applied, length_recovery: lengthRecovery, stuck: stuckNotices };
  }

  if (creation.status !== 'READY_TO_CREATE') {
    var human = creation.human_action_required || '';
    var candidates = (creation.interview_candidates || []).join(', ');
    return v069cBlock_(today, creation.status,
      'reason=' + creation.reason + (candidates ? ' interview_candidates=' + candidates : ''), human);
  }

  var row = creation.queue_row;
  var runId = v069StartLog_(V069C_JOB);
  try {
    // Idempotency under the script lock: never create a second row for the target day.
    var fresh = v069QueueRows_();
    var already = fresh.rows.filter(function (r) {
      return v069RowTargetKey_(r) === today && String(r.queue_status || '').toUpperCase() !== 'SKIPPED';
    })[0];
    if (already) {
      v069FinishLog_(runId, 'NO_ACTION', 0, 'ALREADY_SCHEDULED_TODAY content_id=' + already.content_id, '');
      return { status: 'ALREADY_CREATED', content_id: already.content_id, length_recovery: lengthRecovery };
    }

    v069cAppendQueueRow_(fresh, row);

    // CREATED counts only after the row is read back from the Queue sheet.
    var verify = v069QueueRows_().rows.filter(function (r) { return String(r.content_id || '').trim() === row.content_id; })[0];
    if (!verify || String(verify.queue_status || '').toUpperCase() !== 'DRAFTING' || v069RowTargetKey_(verify) !== today) {
      throw new Error('Queue row read-back failed for ' + row.content_id);
    }
    v069cMarkShortlistSelected_(shortlist, creation.candidate_id, row.content_id);
    PropertiesService.getScriptProperties().setProperty('THE_REV_DAILY_CREATED_' + today, row.content_id);

    var lowPool = '';
    if (creation.low_pool) {
      var sent = v069cNotifyOnce_('THE_REV_DAILY_LOWPOOL_' + today,
        'THE REV. Editorial AI｜記事候補の残りが少なくなっています\n\n残り(Interview不要): ' + creation.pool_remaining +
        '本\n23_BLOG_TOPIC_SHORTLISTの更新を検討してください。');
      lowPool = ' low_pool_notice=' + sent.status;
    }

    v069FinishLog_(runId, 'CREATED', 1,
      'content_id=' + row.content_id + ' run_date=' + plan.run_date + ' target_date=' + plan.target_date +
      ' candidate=' + creation.candidate_id + ' queue=DRAFTING verified=true' +
      ' active_before=' + plan.active.count + '/' + plan.active.cap + ' pool_remaining=' + creation.pool_remaining + lowPool +
      ' next=v0.6.5.2 Supervisor (Draft/QC -> GBP -> Image -> Review Ready)', '');
    return {
      status: 'CREATED',
      content_id: row.content_id,
      candidate_id: creation.candidate_id,
      published_reconciled: applied,
      length_recovery: lengthRecovery,
      stuck: stuckNotices
    };
  } catch (e2) {
    var msg2 = typeof errorText_ === 'function' ? errorText_(e2) : String(e2 && e2.stack || e2);
    v069FinishLog_(runId, 'ERROR_BLOCKED', 0, 'Daily Creator write failed', msg2);
    var sent2 = v069cNotifyOnce_('THE_REV_DAILY_MISSED_ALERT_' + today,
      'THE REV. Editorial AI｜Daily Creatorの書込みに失敗しました\n\n' + String(msg2).slice(0, 1200));
    return { status: 'ERROR_BLOCKED', error: msg2, notification: sent2, length_recovery: lengthRecovery };
  }
}

function scheduledDailyEditorialCreatorV069() {
  return v069WithLock_(scheduledDailyEditorialCreatorV069Unlocked_);
}

function installDailyEditorialCreatorV069() {
  var wired = v069cSupervisorWired_();
  if (!wired.ok) {
    throw new Error('v0.6.9 Creator BLOCKED. Supervisor is not wired: ' + wired.missing.join(', '));
  }
  if (!v069Secret_()) throw new Error('v0.6.9 Creator BLOCKED. EDITORIAL_BRIDGE_SECRET is missing.');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledDailyEditorialCreatorV069') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scheduledDailyEditorialCreatorV069').timeBased().everyHours(1).create();
  return {
    status: 'INSTALLED',
    version: 'v0.6.9',
    handler: 'scheduledDailyEditorialCreatorV069',
    window_jst: V069C_START_HOUR_DEFAULT + ':00-' + (V069C_END_HOUR - 1) + ':59 hourly',
    supervisor_wired: true,
    review_ready_blocks_creation: false,
    auto_publish: false,
    human_approval: true
  };
}

// One call to wire the whole 0->10 chain: Gate (04:xx), Creator (hourly 05-11),
// Watchdog (08:xx). Fails closed when the Supervisor is missing.
function installDailyEditorialAutonomyV069() {
  var gate = installDailyEditorialGateV069();
  var creator = installDailyEditorialCreatorV069();
  return { status: 'INSTALLED', gate: gate, creator: creator, supervisor_triggers: v069cSupervisorWired_().supervisor_triggers };
}

// Manual run: ignores the 05:00-11:59 window (every other rule still applies),
// so the target day can be prepared right after install or after an outage.
// One call after pasting the bundle: install the triggers, then prepare the
// target day right away (no need to wait for the next hourly tick).
function startDailyEditorialAutonomyV069() {
  var installed = installDailyEditorialAutonomyV069();
  var first = runDailyEditorialCreatorV069Once();
  var result = { status: 'STARTED', installed: installed, first_run: first };
  console.log(JSON.stringify(result));
  return result;
}

function runDailyEditorialCreatorV069Once() {
  return v069WithLock_(function () { return scheduledDailyEditorialCreatorV069Unlocked_(true); });
}

// Runtime adapters for the installed v0.6.5.x Supervisor. These wrap its
// authenticated status response BEFORE it promotes the Queue or notifies.
// No trigger, cadence, approval or publication changes.
function v069cReviewContract_(q, blog, gbp, a, reviewUrl) {
  var qa = a.image_qa || {}, gqa = a.gbp_image_qa || {};
  var length = v069cLengthGate_(blog && blog.article_type, blog && blog.body_markdown);
  var checks = {
    blog_ready: !!blog && blog.status === 'READY' && length.pass,
    gbp_row_exists: !!gbp,
    gbp_parent_matches: !!gbp && gbp.parent_blog_id === q.content_id,
    gbp_ready: !!gbp && gbp.status === 'READY',
    gbp_image_ready: !!gbp && gbp.image_status === 'READY',
    gbp_image_path: !!gbp && !!gbp.gbp_image_path,
    gbp_ratio: gqa.pass === true && gqa.ratio === '4:3' && Number(gqa.width) === 1200 && Number(gqa.height) === 900,
    visual_qa: qa.pass === true && qa.manual_visual_rejection !== true,
    scene_plausibility: ['location_behavior_plausible','service_misrepresentation_absent','unsupported_equipment_absent','scene_plausible_at_the_rev'].every(function(k) {
      return qa.scene_plausibility_version === 'the-rev-scene-plausibility-v1' ? qa[k] === true : qa[k] !== false;
    }),
    xserver_verified: qa.xserver_live_verify_passed === true && qa.gbp_xserver_live_verify_passed === true,
    bridge_ready: a.image_status === 'READY' && a.image_asset_ready === true,
    review_url: !!reviewUrl
  };
  var missing = Object.keys(checks).filter(function(k) { return !checks[k]; });
  return {ok: !missing.length, checks: checks, missing: missing};
}
function v069cLengthGate_(type, body) {
  var st = getSettings_(), t = String(type || 'STANDARD').toUpperCase();
  var min = t === 'EXPERT_DEEP_DIVE' ? Math.max(1400, Number(st.blog_expert_min_chars || 1400))
    : t === 'STANDARD' ? Math.max(1200, Number(st.blog_standard_min_chars || 1600)) : 0;
  var count = String(body || '').replace(/\s/g, '').length;
  return {pass: count >= min, count: count, min: min, type: t};
}
function v069cApplyResponseContract_(json) {
  if (!json || !json.article || !json.readiness) return json;
  var a = json.article, id = String(a.editorial_content_id || json.content_id || '');
  if (!id) { json.readiness.ready = false; json.readiness.reason = 'GBP_PARENT_ID_MISSING'; return json; }
  // A rejection can arrive AFTER an older invocation marked REVIEW_READY.
  // Reconcile that hold even when the server already reports ready=false.
  if (a.image_qa && a.image_qa.manual_visual_rejection === true && String(a.publish_status || '').toUpperCase() !== 'PUBLISHED') {
    var heldQueueSheet = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
    var heldQueue = getObjectsWithRow_(heldQueueSheet).filter(function(r) { return r.content_id === id; })[0];
    if (heldQueue && String(heldQueue.queue_status).toUpperCase() === 'PUBLISHED') return json;
    var reason = 'HUMAN_VISUAL_REJECT: ' + String(a.image_qa.reason || a.image_last_error || 'Human image review required');
    if (heldQueue) setObjectRow_(heldQueueSheet,heldQueue.__row,{queue_status:'REVIEW_REQUIRED',image_status:'ERROR',
      web_bridge_status:'IMAGE_PREPARING',last_error:reason,failed_stage:'IMAGE_QA',next_stage:'HUMAN_REVIEW',
      human_action_required:'REVIEW_IMAGE',updated_at:new Date()});
    var heldBridgeSheet = ss_().getSheetByName('25_WEB_PUBLISH_BRIDGE');
    getObjectsWithRow_(heldBridgeSheet).filter(function(r) { return r.content_id === id && r.bridge_status !== 'PUBLISHED'; }).forEach(function(r) {
      setObjectRow_(heldBridgeSheet,r.__row,{bridge_status:'IMAGE_PREPARING',image_status:'ERROR',
        image_qa:JSON.stringify(a.image_qa),last_error:reason,synced_at:new Date()});
    });
    var heldGbpSheet = ss_().getSheetByName('22_GBP_POST');
    getObjectsWithRow_(heldGbpSheet).filter(function(r) { return r.parent_blog_id === id; }).forEach(function(r) {
      setObjectRow_(heldGbpSheet,r.__row,{image_status:'ERROR',image_notes:'4:3 / ' + reason});
    });
    json.readiness.ready = false;
    json.readiness.reason = 'manual_visual_rejection';
    return json;
  }
  if (json.readiness.ready !== true) return json;
  var qsh = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
  var bsh = ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
  var gsh = ss_().getSheetByName('22_GBP_POST');
  var q = getObjectsWithRow_(qsh).filter(function(r) { return r.content_id === id; })[0];
  var blog = getObjectsWithRow_(bsh).filter(function(r) { return r.content_id === id; })[0];
  var gbp = getObjectsWithRow_(gsh).filter(function(r) { return r.parent_blog_id === id; })[0];
  if (!q) { json.readiness.ready = false; json.readiness.reason = 'QUEUE_ROW_MISSING'; return json; }
  if (!gbp && blog && blog.status === 'READY' && v069cLengthGate_(blog.article_type, blog.body_markdown).pass) {
    var ctx = buildM6Context_(v065WeekDate_(q.week_start || q.run_date));
    var made = generateGBPFromBlog_(blog, ctx);
    if (made && made.body_copy_paste) {
      appendObjectRow_(gsh, {generated_at:new Date(),week_start:q.week_start,
        content_id:'GBP-' + id, parent_blog_id:id, title:made.title || blog.title,
        body_copy_paste:made.body_copy_paste,cta_text:made.cta_text || '',local_context:made.local_context || '',
        blog_url_placeholder:'[BLOG_URL]',status:'READY',post_ready:'BLOCKED_URL',notes:'Recovered from FINAL_WEB_BLOG_ONLY by consistency-v1; human posting required.'});
      gbp = getObjectsWithRow_(gsh).filter(function(r) { return r.parent_blog_id === id; })[0];
    }
  }
  var qa = a.image_qa || {}, gqa = a.gbp_image_qa || {};
  if (gbp && a.gbp_image_status === 'READY' && a.gbp_image && gqa.pass === true &&
      qa.xserver_live_verify_passed === true && qa.gbp_xserver_live_verify_passed === true) {
    setObjectRow_(gsh, gbp.__row, {image_status:'READY',gbp_image_path:a.gbp_image,
      image_asset_version:a.gbp_image_asset_version,image_notes:JSON.stringify(gqa) + ' / 4:3 / Xserver verified'});
    gbp = getObjectsWithRow_(gsh).filter(function(r) { return r.parent_blog_id === id; })[0];
  }
  var verdict = v069cReviewContract_(q, blog, gbp, a, json.review_url);
  if (!verdict.ok) {
    json.readiness.ready = false;
    json.readiness.reason = 'REVIEW_CONTRACT_BLOCKED:' + verdict.missing.join(',');
    setObjectRow_(qsh,q.__row,{last_error:json.readiness.reason,failed_stage:'REVIEW_CONTRACT',next_stage:'REPAIR_GBP_OR_QC',updated_at:new Date()});
  }
  return json;
}
// Global initialization also runs on a Supervisor-only invocation. Merely
// calling this from Creator would leave the 1-minute Supervisor unprotected.
var V069C_CONSISTENCY_RUNTIME = (function() {
  if (typeof v065LengthGate_ === 'function') v065LengthGate_ = v069cLengthGate_;
  if (typeof v065FetchJson_ !== 'function') return 'SUPERVISOR_NOT_INSTALLED';
  var original = v065FetchJson_;
  v065FetchJson_ = function(url, options) {
    var result = original(url, options);
    if (/\/api\/integrations\/editorial-status(?:\/|\?|$)/.test(String(url))) v069cApplyResponseContract_(result.json);
    return result;
  };
  if (typeof v065CheckImageDirect_ === 'function') {
    var originalCheck = v065CheckImageDirect_;
    v065CheckImageDirect_ = function(q) {
      var result = originalCheck(q);
      if (result.ready) {
        var bridge = getObjectsWithRow_(ss_().getSheetByName('25_WEB_PUBLISH_BRIDGE'))
          .filter(function(r) { return r.content_id === q.content_id; })[0];
        if (!bridge || bridge.bridge_status !== 'PREVIEW_READY' || !bridge.review_url) {
          result.ready = false;
          result.reason = 'REVIEW_CONTRACT_BLOCKED:bridge_ready,review_url';
        }
      }
      return result;
    };
  }
  if (typeof v065SyncBridgeDirect_ === 'function') {
    var originalSync = v065SyncBridgeDirect_;
    v065SyncBridgeDirect_ = function(q, blog) {
      var result = originalSync(q, blog);
      if (result.bridge_status === 'PREVIEW_READY') {
        var checked = v065CheckImageDirect_(q);
        if (!checked.ready) {
          result.bridge_status = 'IMAGE_PREPARING';
          result.status = 'IMAGE_PREPARING';
          result.reason = checked.reason;
        }
      }
      return result;
    };
  }
  return 'consistency-v1';
})();


/** THE REV. daily topic choice. Requires the existing Gate + Creator + Supervisor.
 * 05:00 JST: three reasoned candidates -> LINE -> owner choice -> optional
 * first-party interview -> DRAFTING -> existing image / human Publish gates.
 * A one-minute poll resumes approved topics of every date, outside the morning
 * creation window too. Waiting for the owner is an intentional state.
 */
var V070_TOPIC_URL = V069_STATUS_URL;

// The legacy editor's "shorter is better" prompt predates Standard v2.
// Apply the actual body-only range to both writer and editor; never weaken QC.
var V070_LENGTH_ADAPTER = (function () {
  if (typeof openAIRequest_ !== 'function' || typeof finalizeWebBlog_ !== 'function') return 'EDITOR_NOT_PRESENT';
  var request = openAIRequest_, finalize = finalizeWebBlog_;
  openAIRequest_ = function (endpoint, payload) {
    var format = payload && payload.text && payload.text.format;
    if (format && ['web_blog_draft_v1','web_blog_final_editor_v1'].indexOf(format.name) >= 0) {
      var input = JSON.parse(payload.input[1].content[0].text);
      var gate = input.topic_gate || {}, article = input.article || {};
      if (String(gate.article_type || article.article_type).toUpperCase() === 'STANDARD') {
        var settings = getSettings_();
        var min = Number(settings.blog_standard_min_chars || 1600), max = Number(settings.blog_standard_max_chars || 2400);
        payload.input[0].content.push({type:'input_text',text:'Blog Style Standard v2: body_markdown alone must contain '+min+'–'+max+' Japanese characters excluding whitespace. Lead, CTA and source lists do not count. Respect this range while keeping concise paragraphs. If below the minimum, explain supported distinctions, practical examples or questions more concretely. Never pad, repeat, invent store procedures, claims or customer stories. Do not compress a useful explanation below the minimum. If evidence cannot support it, require review rather than invent.'});
      }
    }
    return request.apply(this,arguments);
  };
  finalizeWebBlog_ = function (draft, ctx) {
    var result = finalize(draft, ctx);
    if (String(draft.article_type).toUpperCase() === 'STANDARD' && result._editor_decision === 'READY' && result._fact_check_status === 'PASS' && !v065LengthGate_('STANDARD',result.body_markdown).pass) {
      // One bounded additional editing cycle; Supervisor still checks length,
      // fact safety and scores on the final result before accepting it.
      result = finalize(result, ctx);
    }
    return result;
  };
  return 'standard-body-length-v2';
})();

function repairApprovedStandardDraftV070() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('LENGTH_REPAIR_LOCKED');
  try {
    var queue = v069QueueRows_();
    var row = queue.rows.filter(function(q) {
      var knowledge = v065Json_(q.knowledge_context_json,{});
      return q.queue_status === 'REVIEW_REQUIRED' && q.draft_status === 'REVIEW_REQUIRED' && /^STANDARD length gate failed:\s*\d+\s*chars$/.test(String(q.last_error || '')) && knowledge.topic_approval && knowledge.topic_approval.approved_at && String(q.notes || '').indexOf('[V070_LENGTH_REPAIR]') < 0;
    })[0];
    if (!row) {Logger.log('NO_APPROVED_LENGTH_REPAIR');return;}
    setObjectRow_(queue.sheet,row.__row,{queue_status:'PATCHING',draft_status:'NOT_STARTED',last_error:'',failed_stage:'',next_stage:'BLOG_DRAFT',human_action_required:'NONE',notes:v069AppendNote_(row.notes,'[V070_LENGTH_REPAIR] Recreate with Standard v2 body-only range; existing draft retained.'),updated_at:new Date()});
    Logger.log(JSON.stringify({status:'REQUEUED',content_id:row.content_id,adapter:V070_LENGTH_ADAPTER}));
  } finally {lock.releaseLock();}
}

// The installed v0.6.5.2 Supervisor passes knowledge_context to the writer,
// but its final editor reads ctx.first_party_interview. Preserve the owner's
// exact answers in both stages rather than losing them during final editing.
var V070_WRITER_ADAPTER = (function () {
  if (typeof generateWebBlogDraft_ !== 'function') return 'WRITER_NOT_PRESENT';
  var original = generateWebBlogDraft_;
  generateWebBlogDraft_ = function (ctx, gate) {
    var knowledge = gate && gate.knowledge_context;
    var interview = knowledge && knowledge.interview;
    if (Array.isArray(interview) && interview.length) {
      if (!knowledge.topic_approval || !knowledge.topic_approval.approved_at || interview.some(function(x) { return !String(x.answer || '').trim(); })) throw new Error('APPROVED_INTERVIEW_REQUIRED');
      var raw = interview.map(function(x, i) { return (i + 1) + '. ' + x.question + '\n' + x.answer; }).join('\n\n');
      ctx.first_party_interview = {topic_candidate_id:gate.candidate_id,raw_answer:raw,main_claim:String(knowledge.main_claim || raw),extracted_insights:[],usable_quotes:[],source_id:knowledge.topic_approval.proposal_id};
      gate.first_party_interview = ctx.first_party_interview;
    }
    return original(ctx, gate);
  };
  return 'topic-interview-v1';
})();

// Weekly legacy runs may keep preparing research, but must not select and
// write a separate unapproved blog after the daily approval flow is enabled.
var V070_WEEKLY_ADAPTER = (function () {
  if (typeof runM6BlogGBP !== 'function') return 'WEEKLY_NOT_PRESENT';
  var original = runM6BlogGBP;
  runM6BlogGBP = function () {
    if (String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE') return {should_publish:false,status:'TOPIC_SELECTION_WAITING',reason:'OWNER_TOPIC_APPROVAL_REQUIRED'};
    return original.apply(this,arguments);
  };
  return 'topic-weekly-gate-v1';
})();

function v070RefreshTopicPool_() {
  var today = v069TodayKey_(), props = PropertiesService.getScriptProperties();
  var key = 'THE_REV_TOPIC_POOL_GENERATED_' + today;
  if (props.getProperty(key) === 'TRUE') return {status:'ALREADY_GENERATED'};
  var sheet = ss_().getSheetByName('23_BLOG_TOPIC_SHORTLIST');
  var prefix = 'BT-' + today.replace(/-/g,'') + '-DAILY-';
  // Read-back also recovers a lost acknowledgement without generating again.
  var existing = getObjectsWithRow_(sheet).filter(function(r) {return String(r.candidate_id || '').indexOf(prefix) === 0;});
  if (existing.length === 5) {props.setProperty(key,'TRUE');return {status:'ALREADY_GENERATED'};}
  var week = getTargetWeekStart_(), ctx = buildM6Context_(week);
  ctx.weekly_editorial_brief = {brief:ctx.weekly_editorial_brief,
    direction:'毎日の候補だけを5件提案。記事本文はまだ作らない。一般的な運動の検索ニーズ、ボクシング、酸素ルーム、DENBAの商品説明を散りばめる。同じ悩みの言い換えを避ける。未確認の店内運用・顧客実績・効果を作らない。',
    blog_history:getObjectsWithRow_(ss_().getSheetByName('21_WEB_BLOG_OUTPUT')).slice(-100).map(function(r) {return {title:r.title,query:r.target_keyword,status:r.status};})};
  var candidates = generateBlogTopicCandidates_(ctx,5);
  if (!Array.isArray(candidates) || candidates.length !== 5 || candidates.some(function(c) {return !String(c.title_candidate || '').trim() || !String(c.why_now || '').trim();})) throw new Error('TOPIC_POOL_RESPONSE_INVALID');
  candidates.forEach(function(c,i) {
    var scores = c.score_breakdown || {};
    var row = Object.assign({},c,scores,{candidate_id:prefix+(i+1),generated_at:new Date(),week_start:new Date(),rank:i+1,status:'CANDIDATE',total_score:Object.keys(scores).reduce(function(n,k) {return n+Number(scores[k] || 0);},0)});
    if (!existing.some(function(r) {return r.candidate_id === row.candidate_id;})) appendObjectRow_(sheet,row);
  });
  if (getObjectsWithRow_(sheet).filter(function(r) {return String(r.candidate_id || '').indexOf(prefix) === 0;}).length !== 5) throw new Error('TOPIC_POOL_READBACK_FAILED');
  props.setProperty(key,'TRUE');
  return {status:'GENERATED',count:5};
}

function refreshDailyEditorialTopicPoolV070() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('TOPIC_POOL_LOCKED');
  try {var result=v070RefreshTopicPool_();Logger.log(JSON.stringify(result));return result;}
  finally {lock.releaseLock();}
}

function inspectDailyEditorialTopicApprovalV070() {
  var properties = PropertiesService.getScriptProperties();
  var probe = v070TopicRequest_('poll', {});
  var result = {version:'v0.7.0',writer_adapter:V070_WRITER_ADAPTER,weekly_adapter:V070_WEEKLY_ADAPTER,reply_mode:properties.getProperty('THE_REV_TOPIC_REPLY_MODE'),supervisor:v069cSupervisorWired_(),
    line_sender_configured:Boolean(properties.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN') && properties.getProperty('THE_REV_LINE_USER_ID')),
    line_property_names:Object.keys(properties.getProperties()).filter(function(k) {return /LINE/.test(k);}),
    line_receiver_configured:Boolean(probe.capabilities && probe.capabilities.line_receiver_configured),
    settings:{cadence:v069Settings_().daily_editorial_cadence,approval_required:v069Settings_().daily_editorial_topic_approval_required},
    proposals:(probe.proposals || []).map(function(p) {return {id:p.id,status:p.status};})};
  Logger.log(JSON.stringify(result));
  return result;
}

function sendPendingTopicNotificationsGPTV070() {
  // Send through the already-configured official account. This does not select
  // a topic, create an article, or claim that LINE inbound replies are wired.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('TOPIC_NOTIFICATION_LOCKED');
  try {
    var probe = v070TopicRequest_('poll', {});
    var sent = (probe.notifications || []).map(function(n) {
      n.gpt_reply_required = true;
      return v070Notify_(n);
    });
    Logger.log(JSON.stringify({status:'NOTIFICATION_CHECKED',notifications:sent,article_created:false}));
    return sent;
  } finally { lock.releaseLock(); }
}

function v070TopicRequest_(action, extra) {
  var queue = v069QueueRows_();
  var body = {
    action: 'topic_' + action,
    rows: queue.rows.map(function(x) {
      var row = v069cSlim_(x, V069C_PLAN_FIELDS);
      row.target_date = v069RowTargetKey_(x);
      row.failed_stage = x.failed_stage || '';
      return row;
    }),
    outputRows: getObjectsWithRow_(ss_().getSheetByName('21_WEB_BLOG_OUTPUT')).map(function(x) {
      var row = v069cSlim_(x, ['content_id','title','slug_suggestion','target_keyword','search_intent','meta_description','article_type']);
      row.body_summary = String(x.body_markdown || '').replace(/\s+/g, ' ').slice(0,1800);
      return row;
    }),
    settings: v069Settings_()
  };
  if (action === 'prepare') body.shortlist = v069cShortlist_().rows.slice().sort(function(a,b) {return new Date(b.generated_at || 0)-new Date(a.generated_at || 0);}).slice(0,200).map(function(x) { return v069cSlim_(x, V069C_SHORTLIST_FIELDS); });
  Object.keys(extra || {}).forEach(function(k) { body[k] = extra[k]; });
  var r = v069PostJson_(V070_TOPIC_URL, body);
  if (r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true) throw new Error('TOPIC_API_FAILED HTTP ' + r.code + ' ' + String((r.json && r.json.error) || r.body).slice(0,400));
  return r.json;
}

function v070TopicView_(proposals) {
  var props = PropertiesService.getScriptProperties();
  var digest = JSON.stringify(proposals || []);
  if (props.getProperty('THE_REV_TOPIC_VIEW_HASH') === v070Hash_(digest)) return;
  var sh = ss_().getSheetByName('記事候補');
  if (!sh) sh = ss_().insertSheet('記事候補');
  var labels = {TOPIC_SELECTION_WAITING:'候補選択待ち',INTERVIEW_WAITING:'インタビュー回答待ち',APPROVED:'制作待ち',QUEUE_CREATED:'制作開始済み',REVIEW_REQUIRED:'要確認'};
  var values = [['対象日','候補ID','状態','番号','記事案','選定理由','既存記事との違い','確認質問']];
  (proposals || []).forEach(function(p) {
    p.options.forEach(function(o) { values.push([p.target_date,p.id,labels[p.status] || p.status,o.number,o.title,o.reason,o.difference,o.interview_required ? '選択後に質問' : '登録資料で制作可能']); });
  });
  if (sh.getMaxRows() < values.length) sh.insertRowsAfter(sh.getMaxRows(), values.length - sh.getMaxRows());
  // This sheet belongs to this view; no unrelated Master tabs are changed.
  if (sh.getLastRow() > values.length) sh.getRange(values.length + 1,1,sh.getLastRow()-values.length,8).clearContent();
  sh.getRange(1,1,values.length,8).setValues(values).setWrap(true).setVerticalAlignment('top');
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#d9e5dd');
  sh.setColumnWidths(1,4,130); sh.setColumnWidths(5,3,350); sh.setColumnWidth(8,180);
  // Store a digest rather than the entire proposal (Script property size limit).
  props.setProperty('THE_REV_TOPIC_VIEW_HASH', v070Hash_(digest));
}

function v070Hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text).map(function(b) {return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}

function v070Notify_(n) {
  // Stable request key prevents a lost acknowledgement from pushing twice.
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, n.proposal_id + ':' + n.kind);
  var hex = bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  var key = hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);
  var props = PropertiesService.getScriptProperties();
  var message = n.text;
  if (n.gpt_reply_required || props.getProperty('THE_REV_TOPIC_REPLY_MODE') === 'GPT') message = '返信先：候補選択・回答はChatGPTのこの会話へ送ってください。\nLINE返信の自動受付は準備中です。\n\n' + message;
  var stateKey = 'THE_REV_TOPIC_PUSH_' + n.proposal_id + '_' + n.kind;
  var saved = JSON.parse(props.getProperty(stateKey) || '{}');
  if (saved.status === 'SENT') {
    v070TopicRequest_('notification_ack',{proposal_id:n.proposal_id,kind:n.kind,status:'SENT'});
    return {proposal_id:n.proposal_id,status:'SENT'};
  }
  var now = Date.now();
  if (saved.next_at && now < saved.next_at) return {status:'RETRY_BACKOFF'};
  if (saved.first_at && now - saved.first_at >= 23 * 60 * 60 * 1000) return {status:'DELIVERY_UNVERIFIED',error:'Retry window elapsed; reconcile before resending.'};
  var token = props.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN'), owner = props.getProperty('THE_REV_LINE_USER_ID');
  var status = 'ERROR', error = 'LINE_CONFIG_MISSING';
  if (token && owner) {
    var r = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      headers:{Authorization:'Bearer '+token,'X-Line-Retry-Key':key},
      payload:JSON.stringify({to:owner,messages:[{type:'text',text:message}]})
    });
    var code = r.getResponseCode();
    var acceptedRetry = code === 409 && String((r.getAllHeaders() || {})['x-line-accepted-request-id'] || (r.getAllHeaders() || {})['X-Line-Accepted-Request-Id'] || '') !== '';
    if ((code >= 200 && code < 300) || acceptedRetry) { status = 'SENT'; error = ''; }
    else error = 'LINE_HTTP_' + code;
  }
  var attempts = Number(saved.attempts || 0) + 1;
  props.setProperty(stateKey, JSON.stringify({status:status,first_at:saved.first_at || now,attempts:attempts,next_at:now + Math.min(30,Math.pow(2,attempts-1)) * 60000}));
  v070TopicRequest_('notification_ack', {proposal_id:n.proposal_id,kind:n.kind,status:status,error:error});
  return {proposal_id:n.proposal_id,status:status,error:error};
}

function v070TopicTick_(force) {
  // Always poll approved topics, even when the current date already has a row.
  var st = v069Settings_(), hour = v069cJstHour_(), today = v069TodayKey_();
  if (String(st.daily_editorial_enabled).toUpperCase() === 'FALSE') return {status:'DISABLED'};
  var props = PropertiesService.getScriptProperties();
  var hourKey = today + ':' + hour;
  if (props.getProperty('THE_REV_TOPIC_MAINTENANCE_HOUR') !== hourKey) {
    try { v069cRecoverLengthReviewRequired_(); } catch (_length) {}
    try { v069cNotifyPreparedReady_(); } catch (_ready) {}
    props.setProperty('THE_REV_TOPIC_MAINTENANCE_HOUR',hourKey);
  }
  var due = force === true || (hour >= Number(st.daily_editorial_hour || 5) && props.getProperty('THE_REV_TOPICS_PREPARED_' + today) !== 'TRUE' && props.getProperty('THE_REV_TOPIC_PREPARE_ATTEMPT') !== hourKey);
  if (due) props.setProperty('THE_REV_TOPIC_PREPARE_ATTEMPT',hourKey);
  if (due && props.getProperty('THE_REV_TOPICS_PREPARED_' + today) !== 'TRUE') {
    var snapshot = v070TopicRequest_('poll', {});
    if (!(snapshot.proposals || []).some(function(p) {return p.target_date === v069TargetKey_();})) {
      try { v070RefreshTopicPool_(); }
      catch(poolError) {
        var poolLog = v069StartLog_('DAILY_TOPIC_POOL');
        v069FinishLog_(poolLog,'ERROR_BLOCKED',0,'Fresh topic ideas unavailable; checking existing verified candidate pool.',String(poolError).slice(0,600));
      }
    }
  }
  var res = v070TopicRequest_(due ? 'prepare' : 'poll', {});
  if (due && res.preparation && ['TOPIC_SELECTION_WAITING','NOT_REQUIRED'].indexOf(res.preparation.status) >= 0) props.setProperty('THE_REV_TOPICS_PREPARED_' + today, 'TRUE');
  v070TopicView_(res.proposals);
  var notifications = [];
  // Notification failure does not stop an already approved article.
  (res.notifications || []).forEach(function(n) {
    try { notifications.push(v070Notify_(n)); } catch (e) { notifications.push({status:'ERROR',error:String(e).slice(0,300)}); }
  });
  var wired = v069cSupervisorWired_();
  if (!wired.ok) throw new Error('SUPERVISOR_NOT_WIRED ' + wired.missing.join(','));
  var created = [];
  (res.ready || []).forEach(function(next) {
    var queue = v069QueueRows_();
    if (next.queue_row) {
      var row = next.queue_row;
      var existing = queue.rows.filter(function(x) { return String(x.content_id) === row.content_id; })[0];
      if (!existing) v069cAppendQueueRow_(queue, row);
      var verify = v069QueueRows_().rows.filter(function(x) { return String(x.content_id) === row.content_id; })[0];
      if (!verify || v069RowTargetKey_(verify) !== row.target_date.replace(/\//g,'-')) throw new Error('APPROVED_QUEUE_READBACK_FAILED');
      (next.replaces_content_ids || []).forEach(function(id) {
        var old = queue.rows.filter(function(x) { return String(x.content_id) === id; })[0];
        if (old && old.queue_status === 'REVIEW_REQUIRED' && old.failed_stage === 'ARTICLE_OVERLAP') setObjectRow_(queue.sheet,old.__row,{queue_status:'SKIPPED',next_stage:'NONE',human_action_required:'NONE',updated_at:new Date(),notes:v069AppendNote_(old.notes,'Replaced after owner topic choice '+next.proposal_id+'; draft and QC history retained.')});
      });
      v069cMarkShortlistSelected_(v069cShortlist_(),row.topic_candidate_id,row.content_id);
      next.content_id = row.content_id;
    }
    v070TopicRequest_('queue_ack',{proposal_id:next.proposal_id,content_id:next.content_id});
    created.push(next.content_id);
  });
  if (res.preparation && res.preparation.status === 'POOL_REFRESH_REQUIRED') {
    v069cNotifyOnce_('THE_REV_TOPIC_POOL_' + today,'THE REV.｜理由付きの3候補が不足しています。候補を補充するまで未選択の記事は制作しません。記事候補シートをご確認ください。');
  }
  var status = created.length ? 'CREATED' : (res.proposals || []).some(function(p) {return p.status === 'APPROVED';}) ? 'APPROVAL_QUEUED' : (res.proposals || []).some(function(p) {return p.status === 'INTERVIEW_WAITING';}) ? 'INTERVIEW_WAITING' : (res.proposals || []).some(function(p) {return p.status === 'TOPIC_SELECTION_WAITING';}) ? 'TOPIC_SELECTION_WAITING' : 'NO_ACTION';
  var logKey = today + ':' + status + ':' + created.join(',');
  if (props.getProperty('THE_REV_TOPIC_LAST_LOG') !== logKey || created.length) {
    var log = v069StartLog_('DAILY_TOPIC_APPROVAL');
    v069FinishLog_(log,status,created.length,'target_date='+v069TargetKey_()+' created='+created.join(',')+' owner_topic_choice_required=true publish=human',notifications.some(function(n) {return n.status === 'ERROR';}) ? 'LINE notification unverified' : '');
    props.setProperty('THE_REV_TOPIC_LAST_LOG',logKey);
  }
  return {status:status,created:created,notifications:notifications};
}

function scheduledDailyEditorialTopicApprovalV070() {
  if (String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() !== 'TRUE') return {status:'DISABLED'};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'LOCKED'};
  try { return v070TopicTick_(false); }
  catch(e) {
    var run = v069StartLog_('DAILY_TOPIC_APPROVAL');
    v069FinishLog_(run,'ERROR_BLOCKED',0,'Topic poll failed',String(e).slice(0,1000));
    v069cNotifyOnce_('THE_REV_TOPIC_ERROR_'+v069TodayKey_(),'THE REV.｜候補確認の自動処理でエラー\n'+String(e).slice(0,600));
    return {status:'ERROR_BLOCKED',error:String(e)};
  } finally { lock.releaseLock(); }
}

function installDailyEditorialTopicApprovalV070() {
  return v070InstallTopicApproval_('LINE');
}

function installDailyEditorialTopicApprovalGPTV070() {
  // Existing LINE notifications + explicit GPT choice is a complete supported
  // approval route. It does not imply a LINE webhook has been configured.
  return v070InstallTopicApproval_('GPT');
}

function v070InstallTopicApproval_(replyMode) {
  // Install only after the new API, private table, LINE receiver and existing
  // Supervisor have been checked. Do not silently overwrite other triggers.
  var probe = v070TopicRequest_('poll', {});
  var properties = PropertiesService.getScriptProperties();
  var recipient = properties.getProperty('THE_REV_LINE_USER_ID');
  if (!recipient || !properties.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN')) throw new Error('LINE_OWNER_OR_TOKEN_NOT_CONFIGURED');
  if (replyMode === 'LINE' && (!probe.capabilities || !probe.capabilities.line_receiver_configured)) throw new Error('LINE_RECEIVER_NOT_CONFIGURED');
  if (replyMode === 'LINE' && v070Hash_(recipient) !== probe.capabilities.line_owner_fingerprint) throw new Error('LINE_OWNER_MISMATCH');
  if (V070_WRITER_ADAPTER !== 'topic-interview-v1') throw new Error('INTERVIEW_WRITER_NOT_WIRED');
  if (!v069cSupervisorWired_().ok) throw new Error('SUPERVISOR_NOT_WIRED');
  var settings = ss_().getSheetByName('08_SETTINGS');
  var rows = getObjectsWithRow_(settings);
  ['daily_editorial_topic_approval_required','daily_editorial_cadence'].forEach(function(key) {
    var found = rows.filter(function(x) { return String(x.key || x.setting_key) === key; })[0];
    var value = key === 'daily_editorial_cadence' ? 'DAILY' : 'TRUE';
    if (found) setObjectRow_(settings,found.__row,{value:value});
    else appendObjectRow_(settings,{key:key,value:value,type:'text',description:'Owner topic choice before drafting. Final Publish remains human.',active:'TRUE'});
  });
  if (String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() !== 'TRUE' || String(v069Settings_().daily_editorial_cadence) !== 'DAILY') throw new Error('TOPIC_SETTINGS_READBACK_FAILED');
  properties.setProperty('THE_REV_TOPIC_REPLY_MODE',replyMode);
  var exists = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'scheduledDailyEditorialTopicApprovalV070'; });
  if (!exists) ScriptApp.newTrigger('scheduledDailyEditorialTopicApprovalV070').timeBased().everyMinutes(1).create();
  var result = scheduledDailyEditorialTopicApprovalV070();
  Logger.log(JSON.stringify({reply_mode:replyMode,cadence:v069Settings_().daily_editorial_cadence,approval_required:v069Settings_().daily_editorial_topic_approval_required,result:result}));
  return result;
}


/**
 * THE REV. Editorial AI v0.7.1
 * Supervisor QC crash self-recovery adapter.
 *
 * Problem addressed:
 * - v0.6.5.2 moves Queue DRAFTING -> QC before finalizeWebBlog_().
 * - If finalize/editor code throws, v065GeneratePendingArticle_ catches it outside
 *   v065ResumeNoInterviewSelf_ and returns LEGACY_BRIDGE_FAILED_AFTER_DRAFT,
 *   leaving the Queue in QC/QC.
 * - The next Supervisor tick ignores QC/QC, so work stalls until an external
 *   fallback manually resets it.
 *
 * This adapter keeps the existing Supervisor and safety gates intact, but:
 * 1) immediately rewinds a QC/QC row after a caught generation failure;
 * 2) repairs a stale QC/QC row on a later tick if Apps Script was terminated
 *    before the catch path ran;
 * 3) if a READY/PASS blog row already exists, skips regeneration and hands the
 *    row to the existing Bridge recovery path instead;
 * 4) bounds repeated QC recovery attempts and fails closed to ERROR.
 *
 * Auto Publish remains OFF. Human Review & Publish remains mandatory.
 */

var V071_QC_RECOVERY_VERSION = 'v0.7.1';
var V071_QC_RECOVERY_PREFIX = 'THE_REV_QC_RECOVERY_COUNT_';
var V071_QC_RECOVERY_MAX_ATTEMPTS_DEFAULT = 3;
var V071_QC_RECOVERY_STALE_MINUTES_DEFAULT = 5;

function v071QcToken_(v) {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (v === null || v === undefined) return '';
  return String(v).trim().toUpperCase();
}

function v071QcErrorText_(e) {
  if (typeof errorText_ === 'function') {
    try { return String(errorText_(e) || ''); } catch (_ignored) {}
  }
  return String(e && (e.stack || e.message) || e || 'UNKNOWN_QC_ERROR');
}

function v071QcSettingNumber_(name, fallback, min, max) {
  var st = typeof getSettings_ === 'function' ? (getSettings_() || {}) : {};
  var n = Number(st[name]);
  if (!isFinite(n)) n = Number(fallback);
  if (isFinite(min)) n = Math.max(min, n);
  if (isFinite(max)) n = Math.min(max, n);
  return n;
}

function v071QcMaxAttempts_() {
  return Math.floor(v071QcSettingNumber_('daily_editorial_qc_recovery_max_attempts', V071_QC_RECOVERY_MAX_ATTEMPTS_DEFAULT, 1, 10));
}

function v071QcStaleMinutes_() {
  return v071QcSettingNumber_('daily_no_interview_resume_stale_minutes', V071_QC_RECOVERY_STALE_MINUTES_DEFAULT, 1, 60);
}

function v071QcProps_() {
  return PropertiesService.getScriptProperties();
}

function v071QcRetryKey_(contentId) {
  return V071_QC_RECOVERY_PREFIX + String(contentId || '').trim();
}

function v071QcRetryCount_(contentId) {
  var raw = v071QcProps_().getProperty(v071QcRetryKey_(contentId));
  var n = Number(raw || 0);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function v071QcSetRetryCount_(contentId, count) {
  v071QcProps_().setProperty(v071QcRetryKey_(contentId), String(Math.max(0, Math.floor(Number(count) || 0))));
}

function v071QcClearRetry_(contentId) {
  if (!String(contentId || '').trim()) return;
  try { v071QcProps_().deleteProperty(v071QcRetryKey_(contentId)); } catch (_ignored) {}
}

function v071QcAgeMinutes_(value) {
  if (!value) return Infinity;
  var d = value instanceof Date ? value : new Date(value);
  var ms = d && !isNaN(d.getTime()) ? (Date.now() - d.getTime()) : Infinity;
  return ms / 60000;
}

function v071QcQueue_() {
  var sh = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
  if (!sh) return { sheet: null, rows: [] };
  return { sheet: sh, rows: getObjectsWithRow_(sh) };
}

function v071QcBlogRow_(contentId) {
  var sh = ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
  if (!sh) return null;
  return getObjectsWithRow_(sh).find(function (r) {
    return String(r.content_id || '').trim() === String(contentId || '').trim();
  }) || null;
}

function v071QcAppendNote_(notes, text) {
  var base = String(notes || '').trim();
  return (base ? base + ' | ' : '') + text;
}

function v071QcRecoverRow_(row, reason) {
  if (!row || !row.__row) return { recovered: false, status: 'ROW_MISSING' };
  var q = v071QcQueue_();
  if (!q.sheet) return { recovered: false, status: 'QUEUE_SHEET_MISSING' };

  var contentId = String(row.content_id || '').trim();
  if (!contentId) return { recovered: false, status: 'CONTENT_ID_MISSING' };

  var attempts = v071QcRetryCount_(contentId) + 1;
  var maxAttempts = v071QcMaxAttempts_();
  var error = String(reason || 'QC_STAGE_CRASH').slice(0, 1200);
  var now = new Date();

  if (attempts > maxAttempts) {
    v071QcSetRetryCount_(contentId, attempts);
    setObjectRow_(q.sheet, row.__row, {
      queue_status: 'ERROR',
      draft_status: 'QC',
      failed_stage: 'BLOG_QC',
      next_stage: 'HUMAN_REVIEW',
      human_action_required: 'REVIEW_ERROR',
      last_error: 'QC_AUTO_RECOVERY_EXHAUSTED: ' + error,
      notes: v071QcAppendNote_(row.notes, '[V071_QC_RECOVERY] exhausted after ' + maxAttempts + ' automatic attempts.'),
      supervisor_heartbeat_at: now,
      updated_at: now
    });
    return {
      recovered: false,
      status: 'QC_RECOVERY_EXHAUSTED',
      content_id: contentId,
      attempts: attempts,
      max_attempts: maxAttempts
    };
  }

  v071QcSetRetryCount_(contentId, attempts);
  var blog = v071QcBlogRow_(contentId);
  var blogReady = blog && v071QcToken_(blog.status) === 'READY' && v071QcToken_(blog.fact_check_status) === 'PASS';

  if (blogReady) {
    setObjectRow_(q.sheet, row.__row, {
      queue_status: 'BRIDGE_ERROR',
      draft_status: 'READY',
      failed_stage: 'WEB_BRIDGE',
      next_stage: 'WEB_BRIDGE',
      human_action_required: 'NONE',
      last_error: 'QC_CRASH_RECOVERED_WITH_READY_BLOG: ' + error,
      notes: v071QcAppendNote_(row.notes, '[V071_QC_RECOVERY] READY/PASS blog preserved; resume from Bridge.'),
      supervisor_heartbeat_at: now,
      updated_at: now
    });
    return {
      recovered: true,
      status: 'QC_RECOVERED_TO_BRIDGE',
      content_id: contentId,
      attempts: attempts,
      max_attempts: maxAttempts
    };
  }

  setObjectRow_(q.sheet, row.__row, {
    queue_status: 'PATCHING',
    draft_status: 'NOT_STARTED',
    failed_stage: 'BLOG_QC',
    next_stage: 'BLOG_DRAFT',
    human_action_required: 'NONE',
    last_error: 'QC_CRASH_RECOVERED: ' + error,
    notes: v071QcAppendNote_(row.notes, '[V071_QC_RECOVERY] QC/QC rewound to PATCHING/NOT_STARTED for automatic retry.'),
    supervisor_heartbeat_at: now,
    updated_at: now
  });
  return {
    recovered: true,
    status: 'QC_RECOVERED_TO_RETRY',
    content_id: contentId,
    attempts: attempts,
    max_attempts: maxAttempts
  };
}

function v071QcRecoverContent_(contentId, reason) {
  var id = String(contentId || '').trim();
  if (!id) return { recovered: false, status: 'CONTENT_ID_MISSING' };
  var q = v071QcQueue_();
  var row = q.rows.find(function (r) { return String(r.content_id || '').trim() === id; });
  if (!row) return { recovered: false, status: 'QUEUE_ROW_MISSING', content_id: id };

  if (v071QcToken_(row.queue_status) !== 'QC' || v071QcToken_(row.draft_status) !== 'QC') {
    return { recovered: false, status: 'NOT_QC_STUCK', content_id: id };
  }
  return v071QcRecoverRow_(row, reason);
}

function v071QcRecoverStale_() {
  var q = v071QcQueue_();
  if (!q.sheet) return { recovered: false, status: 'QUEUE_SHEET_MISSING' };
  var staleMinutes = v071QcStaleMinutes_();
  var row = q.rows
    .filter(function (r) {
      return v071QcToken_(r.queue_status) === 'QC' &&
        v071QcToken_(r.draft_status) === 'QC' &&
        v071QcAgeMinutes_(r.updated_at || r.supervisor_heartbeat_at || r.created_at) >= staleMinutes;
    })
    .sort(function (a, b) {
      return new Date(a.updated_at || a.created_at || 0) - new Date(b.updated_at || b.created_at || 0);
    })[0];
  if (!row) return { recovered: false, status: 'NO_STALE_QC' };
  return v071QcRecoverRow_(row, 'STALE_QC_TIMEOUT_' + staleMinutes + 'M');
}

var V071_QC_RECOVERY_ADAPTER = (function () {
  if (typeof v065GeneratePendingArticle_ !== 'function') return 'SUPERVISOR_NOT_PRESENT';
  var original = v065GeneratePendingArticle_;

  v065GeneratePendingArticle_ = function () {
    var staleRecovery = v071QcRecoverStale_();
    var result;
    try {
      result = original.apply(this, arguments);
    } catch (e) {
      var q = v071QcQueue_();
      var stuck = q.rows.find(function (r) {
        return v071QcToken_(r.queue_status) === 'QC' && v071QcToken_(r.draft_status) === 'QC';
      });
      var healed = stuck ? v071QcRecoverRow_(stuck, v071QcErrorText_(e)) : { recovered: false, status: 'NO_QC_ROW_AFTER_EXCEPTION' };
      return {
        status: healed.recovered ? 'QC_CRASH_RECOVERED' : 'GENERATION_ERROR',
        error: v071QcErrorText_(e),
        qc_recovery: healed,
        stale_recovery: staleRecovery
      };
    }

    if (result && String(result.status || '') === 'LEGACY_BRIDGE_FAILED_AFTER_DRAFT') {
      var recovery = v071QcRecoverContent_(result.content_id, result.error || 'LEGACY_BRIDGE_FAILED_AFTER_DRAFT');
      var out = {};
      Object.keys(result).forEach(function (k) { out[k] = result[k]; });
      out.original_status = result.status;
      out.status = recovery.recovered ? 'QC_CRASH_RECOVERED' : result.status;
      out.qc_recovery = recovery;
      out.stale_recovery = staleRecovery;
      return out;
    }

    if (result && result.content_id && [
      'REVIEW_READY', 'IMAGE_PREPARING', 'NO_INTERVIEW_RESUME_DONE',
      'INTERVIEW_RESUME_DONE', 'SKIPPED'
    ].indexOf(String(result.status || '')) >= 0) {
      v071QcClearRetry_(result.content_id);
    }

    if (staleRecovery && staleRecovery.recovered && (!result || String(result.status || '') === 'NO_DAILY_ACTION')) {
      return { status: 'QC_STALE_RECOVERED', qc_recovery: staleRecovery };
    }
    return result;
  };

  return 'QC_SELF_RECOVERY_INSTALLED';
})();

function inspectEditorialQcRecoveryV071() {
  return {
    version: V071_QC_RECOVERY_VERSION,
    adapter: V071_QC_RECOVERY_ADAPTER,
    stale_minutes: v071QcStaleMinutes_(),
    max_attempts: v071QcMaxAttempts_(),
    auto_publish: false,
    human_approval: true
  };
}

