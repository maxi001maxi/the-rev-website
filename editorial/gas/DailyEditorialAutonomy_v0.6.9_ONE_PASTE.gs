/**
 * THE REV. Daily Editorial Autonomy v0.6.9
 * ONE-PASTE INSTALL BUNDLE
 *
 * Generated from:
 * - DailyEditorialGate_v0.6.9.gs
 * - DailyEditorialCreator_v0.6.9.gs
 * - DailyEditorialTopicApproval_v0.7.0.gs
 * - DailyEditorialSupervisorRecovery_v0.7.1.gs
 * - DailyEditorialImageOperatorStatus_v0.7.2.gs
 * - DailyEditorialTriggerTopology_v0.7.3.gs
 * - DailyEditorialQuality_v0.8.0.gs
 * - DailyEditorialProductionRecovery_v0.8.2.gs
 *
 * Paste this entire file into ONE file in the bound Apps Script project,
 * then run installDailyEditorialAutonomyV069() once.
 * Keep the existing v0.6.5.2 Supervisor in the same project.
 * v0.7.1 wraps its generation step with bounded QC crash self-recovery.
 * v0.7.2 returns Image Operator BLOCKED/FAILED states to the Primary Supervisor.
 * v0.7.3 removes redundant Creator/Watchdog triggers while Topic Approval owns orchestration.
 * v0.8.2 adds opt-in bounded preservation repair and evidence delivery.
 * v0.8.0 adds opt-in Writer/Editor prompts + independent quality gate (OFF by default).
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
    return { status: 'DELEGATED_TO_TOPIC_APPROVAL_TRIGGER', handler: 'scheduledDailyEditorialTopicApprovalV070' };
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
  var approval = String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE';
  var handlers = ['scheduledDailyEditorialGateV069', 'scheduledDailyEditorialWatchdogV069'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scheduledDailyEditorialGateV069').timeBased().atHour(V069_GATE_HOUR).everyDays(1).inTimezone('Asia/Tokyo').create();
  if (!approval) {
    ScriptApp.newTrigger('scheduledDailyEditorialWatchdogV069').timeBased().atHour(V069_WATCHDOG_HOUR).everyDays(1).inTimezone('Asia/Tokyo').create();
  }
  return {
    status: 'INSTALLED',
    version: 'v0.6.9',
    trigger_mode: approval ? 'TOPIC_APPROVAL' : 'LEGACY_CREATOR',
    gate_hour_jst: V069_GATE_HOUR,
    watchdog_hour_jst: approval ? null : V069_WATCHDOG_HOUR,
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
    return { status: 'DELEGATED_TO_TOPIC_APPROVAL_TRIGGER', handler: 'scheduledDailyEditorialTopicApprovalV070' };
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
  var approval = String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE';
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledDailyEditorialCreatorV069') ScriptApp.deleteTrigger(t);
  });
  if (!approval) {
    ScriptApp.newTrigger('scheduledDailyEditorialCreatorV069').timeBased().everyHours(1).create();
  }
  return {
    status: approval ? 'DELEGATED_TO_TOPIC_APPROVAL_TRIGGER' : 'INSTALLED',
    version: 'v0.6.9',
    handler: approval ? 'scheduledDailyEditorialTopicApprovalV070' : 'scheduledDailyEditorialCreatorV069',
    window_jst: approval ? 'every minute via Topic Approval' : V069C_START_HOUR_DEFAULT + ':00-' + (V069C_END_HOUR - 1) + ':59 hourly',
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
  var topology = typeof reconcileDailyEditorialTriggerTopologyV073 === 'function'
    ? reconcileDailyEditorialTriggerTopologyV073()
    : null;
  return {
    status: 'INSTALLED',
    gate: gate,
    creator: creator,
    topology: topology,
    supervisor_triggers: v069cSupervisorWired_().supervisor_triggers
  };
}

// Manual run: ignores the 05:00-11:59 window (every other rule still applies),
// so the target day can be prepared right after install or after an outage.
// One call after pasting the bundle: install the triggers, then prepare the
// target day right away (no need to wait for the next hourly tick).
function startDailyEditorialAutonomyV069() {
  var installed = installDailyEditorialAutonomyV069();
  var approval = String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE';
  var first = approval && typeof v070TopicTick_ === 'function'
    ? v069WithLock_(function () { return v070TopicTick_(true); })
    : runDailyEditorialCreatorV069Once();
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
function v069cReviewContract_(json, q, gbp) {
  var preflight = json && json.canonical_preflight;
  var failed = preflight && Array.isArray(preflight.checks)
    ? preflight.checks.filter(function(item) { return item && item.status === 'error'; }).map(function(item) { return item.id; })
    : [];
  var canonicalOk = !!(json && json.readiness && json.readiness.ready === true && preflight && preflight.ok === true && failed.length === 0);
  var checks = {
    canonical_preflight: canonicalOk,
    gbp_row_exists: !!gbp,
    gbp_parent_matches: !!gbp && String(gbp.parent_blog_id || '') === String(q && q.content_id || ''),
    gbp_ready: !!gbp && String(gbp.status || '').toUpperCase() === 'READY'
  };
  var missing = Object.keys(checks).filter(function(key) { return !checks[key]; });
  if (!checks.canonical_preflight && failed.length) {
    missing = failed.concat(missing.filter(function(key) { return key !== 'canonical_preflight'; }));
  }
  return {ok: missing.length === 0, checks: checks, missing: missing};
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
  var qsh = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
  var bsh = ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
  var gsh = ss_().getSheetByName('22_GBP_POST');
  var q = getObjectsWithRow_(qsh).filter(function(r) { return r.content_id === id; })[0];

  // The server-side Canonical Preflight owns all Review/Publish QC. If it says
  // no, an older REVIEW_READY state is actively reconciled back to review.
  if (json.readiness.ready !== true) {
    if (q && String(q.queue_status || '').toUpperCase() === 'REVIEW_READY' &&
        json.canonical_preflight && json.canonical_preflight.ok === false) {
      var failedIds = (json.canonical_preflight.checks || [])
        .filter(function(item) { return item && item.status === 'error'; })
        .map(function(item) { return item.id; });
      var canonicalReason = String(json.readiness.reason || ('CANONICAL_PREFLIGHT_BLOCKED:' + failedIds.join(',')));
      setObjectRow_(qsh,q.__row,{
        queue_status:'REVIEW_REQUIRED',
        last_error:canonicalReason,
        failed_stage:'CANONICAL_PREFLIGHT',
        next_stage:'REPAIR_QC',
        human_action_required:'REVIEW_QC',
        updated_at:new Date()
      });
    }
    return json;
  }
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
  var verdict = v069cReviewContract_(json, q, gbp);
  if (!verdict.ok) {
    json.readiness.ready = false;
    json.readiness.reason = 'CANONICAL_PREFLIGHT_BLOCKED:' + verdict.missing.join(',');
    setObjectRow_(qsh,q.__row,{last_error:json.readiness.reason,failed_stage:'CANONICAL_PREFLIGHT',next_stage:'REPAIR_QC',updated_at:new Date()});
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
    // Audience v0.8 adds five structured reader/evidence contracts; legacy 5200 truncates the response.
    if (endpoint === 'responses' && format && format.name === 'blog_topic_shortlist' &&
        String(PropertiesService.getScriptProperties().getProperty('THE_REV_AUDIENCE_DISCOVERY_MODE') || 'OFF').toUpperCase() === 'ENFORCE') {
      payload.max_output_tokens = Math.max(Number(payload.max_output_tokens || 0), 14000);
    }
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

// Phase 6B: reuse the ONE existing topic-generation model call.
// OFF and SHADOW use the legacy prompt. ENFORCE asks for a durable
// audience contract encoded in the existing notes column.
function v080AudienceDirection_(props) {
  var legacy = '毎日の候補だけを5件提案。記事本文はまだ作らない。一般的な運動の検索ニーズ、ボクシング、酸素ルーム、DENBAの商品説明を散りばめる。同じ悩みの言い換えを避ける。未確認の店内運用・顧客実績・効果を作らない。';
  var mode = String(props.getProperty('THE_REV_AUDIENCE_DISCOVERY_MODE') || 'OFF').toUpperCase();
  // The old topic lane targets already exist in policy Sheets. The media-role
  // budget is an INDEPENDENT axis: an oxygen-room topic can explain science OR
  // show a real first visit. Never invent store facts to fill an article slot.
  var mediaPortfolioBrief = 'ブログを単発SEO記事ではなく一つのメディアとして編成。候補5件は同じ知識解説で埋めず、読者の疑問の新規性を維持しつつ「知識・生活の疑問」「実際のサービス体験と流れ」「実店舗・空間・指導者・設備の紹介」「選び方・初回来店の判断」「地域の人物・物語・季節の企画」から最低3種類の編集役割をカバーする。直近12公開記事の柔軟目安: 知識5、サービス体験3、施設と信頼2、比較と判断2。これは記事の役割であり、酸素ルーム・筋トレ等の分野と別軸。店舗や人物、イベントの事実/写真/客の声が未確認なら作らず、HOLD_FOR_FACTSと必要な確認事項を書く。記事の実例を捏造しない。実際の店舗紹介だけにせず、無料でできる代替策や合わない読者も扱う。別の読者の問いと読後価値がない類似記事は提案しない。';
  if (mode !== 'ENFORCE') return legacy;
  return legacy + '\n' + mediaPortfolioBrief + '\nAudience Discovery v0.8: サービス名やSEOキーワードより先に、運動未経験者を含む人々の生活場面・悩み・好奇心・代替行動から幅広く発想してから、最も異なる読者の疑問5つへ絞る。ミット打ち経験者しか分からない悩みだけで埋めない。ジム選びのコツの反復、DENBAとはの言い換えは提案しない。過去のblog_historyと新たに得られる具体的な答えを比較。酸素ルームやDENBAの疾病治療・症状改善・アスリート回復効果は実証済みでない限り断言しない。すべての候補で notes を1行の AUDIENCE_V08: から始まるJSON文字列にする。キーは editorial_role (KNOWLEDGE|SERVICE_EXPERIENCE|FACILITY_AND_TRUST|COMPARISON_DECISION|COMMUNITY_STORY、記事の目的の主役を1つ選ぶ), editorial_role_reason (読者に何を体験・理解・判断してほしいか), audience_stage (PROBLEM_AWARE|EXPLORING_OPTIONS|CATEGORY_AWARE|READY_TO_VISIT|EXISTING_USER), psychological_hook (RECOGNITION|MISCONCEPTION|DISCOVERY|COMPARISON|SITUATION|UNCERTAINTY), reader_scene (具体的な生活場面、12字以上), reader_job (読者の求める判断、6字以上), reader_question, new_reader_takeaway (記事で新たに学べること、15字以上), incremental_answer (過去記事と違う具体的な答え、12字以上), natural_service_fit (THE REV.のどこに自然につながるか、またはつながらないか、14字以上), content_action (NEW_ARTICLE|UPDATE_EXISTING|HOLD_FOR_FACTS|REJECT), search_signal_type (QUERY_HYPOTHESIS。GSC実測が渡されない限りMEASUREDとしない), nearest_content_ids (不明なら空配列), same_answer_as_existing (boolean), unverified_health_claim (boolean), evidence_items (array of {kind,source}; kind は FIRST_PARTY_VERIFIED|EXTERNAL_VERIFIED|RESEARCH_INTERPRETATION|HYPOTHESIS|UNKNOWN、根拠が未確認ならHYPOTHESIS)。notesはこのJSONだけで余計な文章をつけず、ほかの既存必須フィールド why_now, audience_question, unique_angle, score_breakdown を従来どおり必ず埋める。1回のモデル呼び出し内で完結し追加のAI批評呼び出しをしない。';
}

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
    direction:v080AudienceDirection_(props),
    blog_history:getObjectsWithRow_(ss_().getSheetByName('21_WEB_BLOG_OUTPUT')).slice(-100).map(function(r) {return {title:r.title,query:r.target_keyword,status:r.status};})};
  var candidates = generateBlogTopicCandidates_(ctx,5);
  if (!Array.isArray(candidates) || candidates.length !== 5 || candidates.some(function(c) {return !String(c.title_candidate || '').trim() || !String(c.why_now || '').trim();})) throw new Error('TOPIC_POOL_RESPONSE_INVALID');
  if (String(props.getProperty('THE_REV_AUDIENCE_DISCOVERY_MODE') || 'OFF').toUpperCase() === 'ENFORCE' && candidates.some(function(c) {
    var note = String(c.notes || '');
    if (note.indexOf('AUDIENCE_V08:') !== 0) return true;
    try {
      var m = JSON.parse(note.slice('AUDIENCE_V08:'.length));
      return ['KNOWLEDGE','SERVICE_EXPERIENCE','FACILITY_AND_TRUST','COMPARISON_DECISION','COMMUNITY_STORY'].indexOf(m.editorial_role) < 0 || !m.editorial_role_reason ||
        !m.audience_stage || !m.reader_scene || !m.reader_job || !m.new_reader_takeaway ||
        !m.incremental_answer || !m.content_action || !Array.isArray(m.evidence_items);
    } catch (_) { return true; }
  })) throw new Error('AUDIENCE_CONTRACT_INVALID');
  if (String(props.getProperty('THE_REV_AUDIENCE_DISCOVERY_MODE') || 'OFF').toUpperCase() === 'ENFORCE') {
    var assignedRoles = {};
    candidates.forEach(function(c) {
      var m = JSON.parse(String(c.notes).slice('AUDIENCE_V08:'.length));
      if (m.content_action === 'NEW_ARTICLE') assignedRoles[m.editorial_role] = true;
    });
    if (Object.keys(assignedRoles).length < 3) throw new Error('MEDIA_ROLE_DIVERSITY_INSUFFICIENT_BEFORE_SHEET_WRITE');
  }
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
    now: new Date().toISOString(),
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

function v070StuckAlerts_(res) {
  if (typeof v069cStuckAlerts_ !== 'function') return [];
  return v069cStuckAlerts_((res && res.stuck) || [], v069TargetKey_());
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
    Logger.log(JSON.stringify({event:'EDITORIAL_LINE_PUSH_HTTP',proposal_id:n.proposal_id,kind:n.kind,http_status:code,
      request_id:String((r.getAllHeaders() || {})['x-line-request-id'] || (r.getAllHeaders() || {})['X-Line-Request-Id'] || ''),
      accepted_request_id:String((r.getAllHeaders() || {})['x-line-accepted-request-id'] || (r.getAllHeaders() || {})['X-Line-Accepted-Request-Id'] || '')}));
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
  var stuckNotices = v070StuckAlerts_(res);
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
    v069FinishLog_(log,status,created.length,'target_date='+v069TargetKey_()+' created='+created.join(',')+' stuck='+stuckNotices.length+' owner_topic_choice_required=true publish=human',notifications.some(function(n) {return n.status === 'ERROR';}) ? 'LINE notification unverified' : '');
    props.setProperty('THE_REV_TOPIC_LAST_LOG',logKey);
  }
  return {status:status,created:created,notifications:notifications,stuck:stuckNotices};
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
  var topology = null;
  if (typeof reconcileDailyEditorialTriggerTopologyV073 === 'function') {
    topology = reconcileDailyEditorialTriggerTopologyV073();
  } else {
    var exists = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'scheduledDailyEditorialTopicApprovalV070'; });
    if (!exists) ScriptApp.newTrigger('scheduledDailyEditorialTopicApprovalV070').timeBased().everyMinutes(typeof V073_TOPIC_APPROVAL_POLL_MINUTES === 'number' ? V073_TOPIC_APPROVAL_POLL_MINUTES : 10).create();
  }
  var result = scheduledDailyEditorialTopicApprovalV070();
  Logger.log(JSON.stringify({reply_mode:replyMode,cadence:v069Settings_().daily_editorial_cadence,approval_required:v069Settings_().daily_editorial_topic_approval_required,topology:topology,result:result}));
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


/**
 * THE REV. Editorial AI v0.7.2
 * Image Operator BLOCKED/FAILED -> Primary Supervisor adapter.
 *
 * The image operator already persists durable state in GitHub. The status API
 * now returns that state. This adapter makes the 1-minute Primary Supervisor
 * consume it instead of pretending every non-READY image is merely PREPARING.
 *
 * Queue stays IMAGE_PREPARING so the Primary keeps polling and can recover
 * automatically after an external blocker is cleared or a repaired image
 * version becomes READY. The explicit image_status / failed_stage /
 * human_action_required fields carry the failure truth.
 *
 * Final Publish remains human-only.
 */

var V072_IMAGE_OPERATOR_VERSION = 'v0.7.2';

function v072OperatorBlocking_(operator) {
  return operator && operator.matched === true && operator.blocking === true;
}

function v072OperatorQueueStatus_(operator) {
  return String(operator && operator.state || '').toUpperCase() === 'BLOCKED' ? 'BLOCKED' : 'ERROR';
}

function v072OperatorError_(operator) {
  return [
    'IMAGE_OPERATOR_' + String(operator && (operator.status || operator.state) || 'BLOCKED'),
    operator && operator.code ? 'code=' + operator.code : '',
    operator && operator.last_error ? String(operator.last_error) : ''
  ].filter(Boolean).join(' / ').slice(0, 1200);
}

function v072NotifyOperator_(q, operator) {
  var contentId = String(q && q.content_id || '').trim();
  var status = String(operator && (operator.status || operator.state) || 'BLOCKED').toUpperCase();
  var version = String(operator && operator.asset_version || '').trim();
  var key = 'THE_REV_IMAGE_OPERATOR_' + contentId + '_' + status + '_' + version;
  var action = String(operator && operator.human_action_required || 'REVIEW_IMAGE_OPERATOR');
  var text = [
    'THE REV. Editorial AI｜画像処理が停止しています',
    '',
    String(q && q.topic || ''),
    '',
    '状態: ' + status,
    operator && operator.code ? '原因コード: ' + operator.code : '',
    operator && operator.last_error ? '詳細: ' + String(operator.last_error).slice(0, 900) : '',
    '対応: ' + action,
    '',
    'Content ID: ' + contentId,
    '※記事Publishは行っていません。'
  ].filter(Boolean).join('\n');

  if (typeof v069cNotifyOnce_ === 'function') return v069cNotifyOnce_(key, text);

  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(key) === 'TRUE') return { status: 'ALREADY_SENT' };
  if (typeof v065LinePushText_ !== 'function') return { status: 'LINE_SENDER_MISSING' };
  var sent = v065LinePushText_(text);
  if (sent && sent.status === 'SENT') props.setProperty(key, 'TRUE');
  return sent || { status: 'UNKNOWN' };
}

function v072CheckImageDirect_(q) {
  var secret = v065BridgeSecret_();
  if (!secret) throw new Error('EDITORIAL_BRIDGE_SECRET is not configured in Script Properties.');
  var contentId = String(q.content_id || '').trim();
  var url = 'https://the-rev-website.vercel.app/api/integrations/editorial-status/?content_id=' +
    encodeURIComponent(contentId);
  var r = v065FetchJson_(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + secret }
  });

  if (r.code === 404) return { ready: false, status: 'NOT_FOUND', operator: null };
  if (r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true) {
    throw new Error(
      'Editorial status bridge failed: HTTP ' + r.code + ' / ' +
      String((r.json && r.json.message) || r.body || '').slice(0, 1200)
    );
  }

  var a = r.json.article || {};
  var operator = r.json.operator || null;
  var blocked = v072OperatorBlocking_(operator);
  var ready = !blocked &&
    r.json.readiness && r.json.readiness.ready === true &&
    String(a.image_status || '').toUpperCase() === 'READY' &&
    a.image_asset_ready === true;
  var imageStatus = blocked ? v072OperatorQueueStatus_(operator) : String(a.image_status || 'PREPARING');
  var operatorError = blocked ? v072OperatorError_(operator) : '';

  v065UpsertBridgeSheet_(contentId, {
    synced_at: new Date(),
    bridge_status: ready ? 'PREVIEW_READY' : 'IMAGE_PREPARING',
    site_draft_id: String(a.id || ''),
    review_url: String(r.json.review_url || ''),
    editor_url: String(r.json.editor_url || ''),
    slug: String(a.slug || ''),
    title: String(a.title || ''),
    image_status: imageStatus,
    thumbnail_path: String(a.thumbnail || ''),
    og_image_path: String(a.og_image || ''),
    image_updated_at: new Date(),
    image_qa: a.image_qa || '',
    last_error: operatorError,
    notes: blocked
      ? 'Image Operator state returned to Primary. Human approval still required before publish.'
      : 'Human approval required before publish.'
  });

  return {
    ready: ready,
    review_url: String(r.json.review_url || ''),
    editor_url: String(r.json.editor_url || ''),
    image_status: imageStatus,
    reason: String(r.json.readiness && r.json.readiness.reason || ''),
    operator: operator
  };
}

function v072PollImage_() {
  var qsh = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
  if (!qsh) return { status: 'SHEET_MISSING' };
  var q = getObjectsWithRow_(qsh).find(function(r) {
    return v065Token_(r.queue_status) === 'IMAGE_PREPARING' && String(r.content_id || '').trim();
  });
  if (!q) return { status: 'NO_IMAGE_POLL' };

  try {
    var checked = v065CheckImageDirect_(q);
    var now = new Date();

    if (v072OperatorBlocking_(checked.operator)) {
      var operator = checked.operator;
      var imageStatus = v072OperatorQueueStatus_(operator);
      var lastError = v072OperatorError_(operator);
      var changed =
        v065Token_(q.image_status) !== imageStatus ||
        String(q.failed_stage || '') !== 'IMAGE_OPERATOR' ||
        String(q.last_error || '') !== lastError;

      var patch = {
        queue_status: 'IMAGE_PREPARING',
        draft_status: 'READY',
        image_status: imageStatus,
        web_bridge_status: 'IMAGE_PREPARING',
        failed_stage: 'IMAGE_OPERATOR',
        next_stage: 'IMAGE_OPERATOR',
        human_action_required: String(operator.human_action_required || 'REVIEW_IMAGE_OPERATOR'),
        last_error: lastError,
        supervisor_heartbeat_at: now
      };
      if (changed) patch.updated_at = now;
      setObjectRow_(qsh, q.__row, patch);

      var notice = v072NotifyOperator_(q, operator);
      return {
        status: String(operator.state || '').toUpperCase() === 'BLOCKED'
          ? 'IMAGE_OPERATOR_BLOCKED'
          : 'IMAGE_OPERATOR_FAILED',
        content_id: String(q.content_id || ''),
        operator_status: String(operator.status || ''),
        operator_code: operator.code || '',
        attempts_total: operator.attempts_total,
        max_attempts: operator.max_attempts,
        human_action_required: operator.human_action_required || '',
        notification: notice && notice.status || ''
      };
    }

    if (checked.ready) {
      setObjectRow_(qsh, q.__row, {
        queue_status: 'REVIEW_READY',
        draft_status: 'READY',
        image_status: 'READY',
        review_url: checked.review_url || String(q.review_url || ''),
        web_bridge_status: 'PREVIEW_READY',
        failed_stage: '',
        next_stage: 'HUMAN_REVIEW',
        human_action_required: 'REVIEW_AND_PUBLISH',
        last_error: '',
        supervisor_heartbeat_at: now,
        updated_at: now
      });
      return {
        status: 'REVIEW_READY',
        content_id: String(q.content_id || ''),
        review_url: checked.review_url || ''
      };
    }

    // A repaired/requeued operator state should automatically clear the old
    // BLOCKED/ERROR marker while the Queue remains pollable.
    if (String(q.failed_stage || '') === 'IMAGE_OPERATOR') {
      setObjectRow_(qsh, q.__row, {
        queue_status: 'IMAGE_PREPARING',
        draft_status: 'READY',
        image_status: 'PREPARING',
        web_bridge_status: 'IMAGE_PREPARING',
        failed_stage: '',
        next_stage: 'IMAGE_QA',
        human_action_required: 'NONE',
        last_error: '',
        supervisor_heartbeat_at: now,
        updated_at: now
      });
    }

    return {
      status: 'IMAGE_PREPARING',
      content_id: String(q.content_id || ''),
      review_url: checked.review_url || String(q.review_url || ''),
      reason: checked.reason || ''
    };
  } catch (e) {
    var msg = typeof errorText_ === 'function' ? errorText_(e) : String(e && e.stack || e);
    setObjectRow_(qsh, q.__row, {
      queue_status: 'BRIDGE_ERROR',
      failed_stage: 'IMAGE_STATUS_BRIDGE',
      next_stage: 'IMAGE_STATUS_BRIDGE',
      last_error: msg,
      supervisor_heartbeat_at: new Date(),
      updated_at: new Date()
    });
    return { status: 'BRIDGE_ERROR', content_id: String(q.content_id || ''), error: msg };
  }
}

var V072_IMAGE_OPERATOR_ADAPTER = (function() {
  if (typeof v065CheckImageDirect_ !== 'function' || typeof v065PollImage_ !== 'function') {
    return 'SUPERVISOR_NOT_PRESENT';
  }
  v065CheckImageDirect_ = v072CheckImageDirect_;
  v065PollImage_ = v072PollImage_;
  return 'IMAGE_OPERATOR_PRIMARY_STATUS_INSTALLED';
})();

function inspectEditorialImageOperatorStatusV072() {
  return {
    version: V072_IMAGE_OPERATOR_VERSION,
    adapter: V072_IMAGE_OPERATOR_ADAPTER,
    auto_publish: false,
    human_approval: true
  };
}


/**
 * THE REV. Editorial AI v0.7.3
 * Canonical trigger topology for Daily Editorial.
 *
 * Topic Approval ON:
 *   - Gate: 1/day
 *   - Topic Approval: every 10 minutes
 *   - Supervisor: existing trigger, untouched
 *   - Creator: 0
 *   - Watchdog: 0
 *
 * Topic Approval OFF:
 *   - Gate: 1/day
 *   - Creator: every hour
 *   - Watchdog: 1/day
 *   - Topic Approval: 0
 *
 * This file changes trigger topology only. It does not change cadence,
 * Auto Publish, Human Approval, Topic/Knowledge/Duplicate gates or content.
 */

var V073_TRIGGER_TOPOLOGY_VERSION = 'v0.7.3';
var V073_TOPIC_APPROVAL_POLL_MINUTES = 10;
var V073_TRIGGER_HANDLERS = [
  'scheduledDailyEditorialGateV069',
  'scheduledDailyEditorialCreatorV069',
  'scheduledDailyEditorialWatchdogV069',
  'scheduledDailyEditorialTopicApprovalV070'
];

function v073TopicApprovalEnabled_() {
  return String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE';
}

function v073TriggerCounts_() {
  var counts = {};
  V073_TRIGGER_HANDLERS.forEach(function(h) { counts[h] = 0; });
  var supervisors = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var h = String(t.getHandlerFunction() || '');
    if (counts.hasOwnProperty(h)) counts[h] += 1;
    if (/^scheduledDailyEditorialSupervisorV0\d+$/.test(h)) supervisors.push(h);
  });
  return { controlled: counts, supervisors: supervisors };
}

function v073DeleteControlledTriggers_() {
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var h = String(t.getHandlerFunction() || '');
    if (V073_TRIGGER_HANDLERS.indexOf(h) >= 0) {
      ScriptApp.deleteTrigger(t);
      removed.push(h);
    }
  });
  return removed;
}

function v073CreateCanonicalTriggers_(approval) {
  var created = [];
  ScriptApp.newTrigger('scheduledDailyEditorialGateV069')
    .timeBased().atHour(V069_GATE_HOUR).everyDays(1).inTimezone('Asia/Tokyo').create();
  created.push('scheduledDailyEditorialGateV069');

  if (approval) {
    if (typeof scheduledDailyEditorialTopicApprovalV070 !== 'function') {
      throw new Error('TOPIC_APPROVAL_SOURCE_NOT_INSTALLED');
    }
    ScriptApp.newTrigger('scheduledDailyEditorialTopicApprovalV070')
      .timeBased().everyMinutes(V073_TOPIC_APPROVAL_POLL_MINUTES).create();
    created.push('scheduledDailyEditorialTopicApprovalV070');
  } else {
    ScriptApp.newTrigger('scheduledDailyEditorialCreatorV069')
      .timeBased().everyHours(1).create();
    created.push('scheduledDailyEditorialCreatorV069');
    ScriptApp.newTrigger('scheduledDailyEditorialWatchdogV069')
      .timeBased().atHour(V069_WATCHDOG_HOUR).everyDays(1).inTimezone('Asia/Tokyo').create();
    created.push('scheduledDailyEditorialWatchdogV069');
  }
  return created;
}

function reconcileDailyEditorialTriggerTopologyV073() {
  if (typeof scheduledDailyEditorialGateV069 !== 'function') throw new Error('GATE_SOURCE_NOT_INSTALLED');
  if (typeof scheduledDailyEditorialCreatorV069 !== 'function') throw new Error('CREATOR_SOURCE_NOT_INSTALLED');
  if (typeof scheduledDailyEditorialWatchdogV069 !== 'function') throw new Error('WATCHDOG_SOURCE_NOT_INSTALLED');

  var approval = v073TopicApprovalEnabled_();
  var before = v073TriggerCounts_();
  var removed = v073DeleteControlledTriggers_();
  var created = v073CreateCanonicalTriggers_(approval);
  var after = v073TriggerCounts_();

  var expected = approval
    ? {
        scheduledDailyEditorialGateV069: 1,
        scheduledDailyEditorialCreatorV069: 0,
        scheduledDailyEditorialWatchdogV069: 0,
        scheduledDailyEditorialTopicApprovalV070: 1
      }
    : {
        scheduledDailyEditorialGateV069: 1,
        scheduledDailyEditorialCreatorV069: 1,
        scheduledDailyEditorialWatchdogV069: 1,
        scheduledDailyEditorialTopicApprovalV070: 0
      };

  Object.keys(expected).forEach(function(h) {
    if (Number(after.controlled[h] || 0) !== expected[h]) {
      throw new Error('TRIGGER_TOPOLOGY_READBACK_FAILED ' + h + '=' + after.controlled[h] + ' expected=' + expected[h]);
    }
  });

  var result = {
    status: 'RECONCILED',
    version: V073_TRIGGER_TOPOLOGY_VERSION,
    mode: approval ? 'TOPIC_APPROVAL' : 'LEGACY_CREATOR',
    removed: removed,
    created: created,
    before: before,
    after: after,
    supervisor_untouched: true,
    topic_approval_poll_minutes: approval ? V073_TOPIC_APPROVAL_POLL_MINUTES : null,
    auto_publish: false,
    human_approval: true
  };
  console.log(JSON.stringify(result));
  return result;
}

function inspectDailyEditorialTriggerTopologyV073() {
  var result = {
    version: V073_TRIGGER_TOPOLOGY_VERSION,
    mode: v073TopicApprovalEnabled_() ? 'TOPIC_APPROVAL' : 'LEGACY_CREATOR',
    triggers: v073TriggerCounts_(),
    topic_approval_poll_minutes: v073TopicApprovalEnabled_() ? V073_TOPIC_APPROVAL_POLL_MINUTES : null,
    auto_publish: false,
    human_approval: true
  };
  console.log(JSON.stringify(result));
  return result;
}


/**
 * Phase 5I: opt-in Writer + Preservation Editor + independent QC adapter.
 * Requires existing legacy Writer/Editor and v0.7.0 Topic Approval adapters.
 * Install order: append this LAST in the existing one-paste bundle.
 * Script Property THE_REV_EDITORIAL_QUALITY_V08_MODE = OFF(default)|SHADOW|ENFORCE.
 * SHADOW = deterministic QC log in editor_notes, no prompt or READY changes.
 * ENFORCE = Writer/Editor enrichment + separate QC model call + FAIL CLOSED.
 * No auto-publication is installed or enabled by this adapter.
 */
var V080_QUALITY_MODE = (function () {
  try {
    var value = String(PropertiesService.getScriptProperties().getProperty('THE_REV_EDITORIAL_QUALITY_V08_MODE') || 'OFF').trim().toUpperCase();
    return value === 'ENFORCE' || value === 'SHADOW' ? value : 'OFF';
  } catch (_) { return 'OFF'; }
})();

function v080ScoreAudit_(details, publishedTotal) {
  var maxima = {title_hook:15,seo_intent:15,human_voice:15,readability:15,length_efficiency:10,originality:10,brand_fit:10,fact_safety:10};
  var values = details && details.score_breakdown || {}, total = 0, errors = [];
  Object.keys(maxima).forEach(function(key) {
    var n = values[key];
    if (typeof n !== 'number' || !isFinite(n) || Math.floor(n) !== n || n < 0 || n > maxima[key]) errors.push('SCORE_RANGE:' + key);
    else total += n;
  });
  if (errors.length === 0 && (typeof publishedTotal !== 'number' || total !== publishedTotal)) errors.push('SCORE_TOTAL_MISMATCH');
  return {total:total,pass:errors.length === 0,errors:errors};
}

function v080BaseQuality_(draft, edited) {
  var errors = [], notices = [];
  var body = String(edited && edited.body_markdown || '');
  var original = String(draft && draft.body_markdown || '');
  var count = body.replace(/\s/g,'').length;
  var type = String(edited && edited.article_type || draft && draft.article_type || '').toUpperCase();
  if (!body.trim() || !original.trim()) errors.push('BODY_MISSING');
  if (type === 'STANDARD' && (count < 1600 || count > 2400)) errors.push('STANDARD_BODY_RANGE:' + count);
  if (type === 'EXPERT_DEEP_DIVE' && count < 1400) errors.push('EXPERT_BODY_TOO_SHORT:' + count);
  var safety = ['減圧','加圧','耳の違和感','禁忌','副作用'];
  safety.forEach(function(term) {if(original.indexOf(term) !== -1 && body.indexOf(term) === -1) errors.push('PRESERVED_SAFETY_TERM_LOST:' + term);});
  if (/病気が治ります|睡眠不足を完全に補えます|必ず誰でも上達/.test(body)) errors.push('HIGH_RISK_UNQUALIFIED_CLAIM');
  var title = String(edited && edited.title || '');
  if (/新大宮|奈良市/.test(title) && !(/新大宮|奈良市/.test(body))) errors.push('REGIONAL_TITLE_BODY_MISMATCH');
  if (!Array.isArray(edited && edited.source_refs) || edited.source_refs.length === 0) notices.push('SOURCE_PROVENANCE_REQUIRES_REVIEW');
  var details = {};
  try {details = JSON.parse(String(edited && edited._editor_notes || '{}'));} catch (_) {errors.push('EDITOR_NOTES_UNPARSEABLE');}
  var score = v080ScoreAudit_(details,edited && edited._editor_score);
  errors = errors.concat(score.errors);
  notices.push('SEMANTIC_CLAIM_PRESERVATION_NOT_PROVEN');
  notices.push('MODEL_SCORE_IS_NOT_HUMAN_READER_EVIDENCE');
  return {pass:errors.length === 0,errors:errors,notices:notices,body_chars:count,score_total:score.total,inspection:'DETERMINISTIC_ONLY'};
}

/**
 * Independent QC receives the owner-approved interview as primary-source
 * evidence. It is not permission to infer undocumented store procedures.
 * The official excerpt below is a narrow, manually verified PDF fact pack,
 * used only when that exact source is listed in the finalized article.
 */
function v080QcEvidence_(edited, ctx) {
  var interview = ctx && ctx.first_party_interview;
  var owner = interview && String(interview.source_id || '').trim() &&
    String(interview.raw_answer || '').trim() ? {
      source_type:'FIRST_PARTY_OWNER_INTERVIEW',
      source_id:String(interview.source_id).trim(),
      raw_answer:String(interview.raw_answer).slice(0,10000),
      scope:'Owner statements only; no inferred clinical protocol, safety guarantee or operational procedure.'
    } : null;
  var refs = Array.isArray(edited && edited.source_refs) ? edited.source_refs : [];
  var hasOfficialPdf = refs.some(function(ref) {
    var value=String(ref||'');
    return value.indexOf('caa.go.jp/policies/council/csic/report/report_024/assets/csic_cms201_260527_11.pdf')!==-1;
  });
  var official = hasOfficialPdf ? [{
    source_type:'OFFICIAL_SOURCE_VERIFIED_EXCERPT',
    document:'消費者安全調査委員会 消費者事故等調査報告書 パーソナルトレーニングにおける事故',
    publication_date:'2026-05-27',
    url:'https://www.caa.go.jp/policies/council/csic/report/report_024/assets/csic_cms201_260527_11.pdf',
    page_reference:'PDF pages 58-60 (printed 59-61)',
    verified_points:[
      'トレーナーは利用者の体調や痛みの全てを把握できない。服用薬、健診で指摘されたこと、過去のけが、寝不足、痛みや違和感等は運動前・中・後に伝えるよう案内している。',
      'トレーナーに不安・痛みを申告された際には当該種目を一旦中止し、確認したうえで変更・中止・受診勧奨等、安全優先で対応するよう提言している。',
      '指導者の大丈夫という指示に従い、けがをした相談が寄せられている。不安が残る運動は一旦止め、話し合いによる見直しを勧めている。'
    ],
    scope:'Only these directly verified statements. Do not infer incident counts, individual store practices, guarantees or medical conclusions.'
  }] : [];
  if(refs.some(function(ref){return String(ref||'').indexOf('caa.go.jp/policies/policy/consumer_safety/caution/caution_086')!==-1;}))official.push({
    source_type:'OFFICIAL_SOURCE_VERIFIED_EXCERPT',
    url:'https://www.caa.go.jp/policies/policy/consumer_safety/caution/caution_086',
    verified_at:'2026-10-14',section:'事故事例・事故防止のポイント',
    verified_points:[
      '消費者庁は、運動中の違和感をトレーナーへ伝えた後も続けてけがをしたという相談事例を紹介している。これは相談として報告された事例であり、独立に因果関係を確定した臨床研究ではない。',
      '気になる情報は運動前・中・後に伝え、伝え方や合図を事前に話し合い、不安が残る運動は一旦止めるよう案内している。'
    ],
    scope:'Reported examples and official advice only. No incidence rate, store protocol or guarantee.'
  });
  if(refs.some(function(ref){return String(ref||'').indexOf('kennet.mhlw.go.jp/information/information/exercise/s-00-008.html')!==-1;}))official.push({
    source_type:'OFFICIAL_SOURCE_VERIFIED_EXCERPT',
    url:'https://kennet.mhlw.go.jp/information/information/exercise/s-00-008.html',
    verified_at:'2026-10-14',section:'運動中の注意',
    verified_points:['厚生労働省は、胸痛・動悸・めまいやふらつき・いつもと違う強い疲れ・関節や筋肉の強い痛み・冷や汗等の体調の異変を感じたら直ちに運動を中止するよう案内している。'],
    scope:'General stop-exercise guidance. Do not infer diagnosis or clinic/store treatment.'
  });
  if(refs.some(function(ref){return String(ref||'').indexOf('mhlw.go.jp/content/001195872.pdf')!==-1;}))official.push({
    source_type:'OFFICIAL_SOURCE_VERIFIED_EXCERPT',
    document:'健康づくりのための身体活動・運動ガイド2023 身体活動・運動を安全に行うためのポイント（正式版）',
    url:'https://www.mhlw.go.jp/content/001195872.pdf',
    verified_at:'2026-10-14',page_reference:'PDF pages 1-2: 普段の健康管理・内服薬・運動開始前の健康チェックシート',
    verified_points:[
      '運動開始時に健診結果や治療中の病気を共有し、健康状態を把握するよう案内している。内服薬と、薬剤の変更・追加についても情報共有が必要と記載している。',
      '健康チェックシートでは、慢性疾患や手術歴に伴う運動制限、慢性疾患の薬の運動時の注意について、分からない場合は受診するよう案内している。全員に一律の受診を求める趣旨ではない。',
      '胸痛、めまいでバランスを崩すことや過去1年の意識消失、運動で悪化しそうな骨・関節・筋肉等の問題がある場合は、運動開始前に医療機関を受診するよう案内している。'
    ],
    scope:'General official pre-exercise screening advice only. No diagnosis, medication adjustment, guaranteed safety or verified THE REV. medical protocol.'
  });
  return {first_party_owner_interview:owner,verified_official_excerpts:official,
    verified_research_excerpts:typeof v082ResearchEvidence_==='function'?v082ResearchEvidence_(refs):[]};
}

function v080IndependentQc_(edited, ctx) {
  if (typeof openAIRequest_ !== 'function' || typeof parseStructuredResponse_ !== 'function') throw new Error('V080_QC_API_NOT_AVAILABLE');
  var axes=['question_resolution','understanding_gain','decision_support','concreteness_evidence','originality_readability'];
  var props = {}; axes.forEach(function(k){props[k]={type:'integer',minimum:0,maximum:4};});
  var schema={type:'object',additionalProperties:false,properties:{scores:{type:'object',additionalProperties:false,properties:props,required:axes},issues:{type:'array',items:{type:'string'}},recommendations:{type:'array',items:{type:'string'}},source_unverified:{type:'boolean'},reason:{type:'string'}},required:['scores','issues','recommendations','source_unverified','reason']};
  var settings=getSettings_();
  var payload={model:settings.blog_editor_model||settings.blog_model,store:false,input:[
    {role:'system',content:[{type:'input_text',text:'You are an INDEPENDENT QC reviewer, NOT the writer or editor. Judge reader value without viewing writer/editor self-scores. Return five scores (0-4): question answered, new understanding, decision support, concrete grounded detail, readability/originality. Check factual claims against supplied verified facts, narrow official excerpts and the explicitly sourced owner interview. Treat the owner interview as evidence of the position stated by the owner ONLY, not independent proof of store protocols or clinical effectiveness. Unverified claims must still set source_unverified=true. Never fabricate verification. issues must list every material blocker (unsupported factual/clinical claims, misleading attribution, unsafe guidance or a missing answer to the core reader question). Put optional improvements in recommendations, with no deletion or relabeling of actual blockers. Clearly labeled illustrative schedules and general coaching suggestions are NOT clinical evidence; reject them if they imply a proven sleep benefit or universal safety threshold. RPE/RIR is not mandatory: practical plain-language intensity guidance is acceptable, and no RPE/RIR cutoff should be treated as sleep-validated without direct evidence. source_unverified concerns factual claims requiring evidence, not a demand that explicitly non-clinical examples have clinical trials. Be critical. Score is NOT a human-reader measurement.'}]},
    {role:'user',content:[{type:'input_text',text:JSON.stringify({title:edited.title,article_type:edited.article_type,body_markdown:edited.body_markdown,verified_public_facts:ctx&&ctx.verified_public_facts||[],blocked_facts:ctx&&ctx.blocked_facts||[],source_refs:edited.source_refs||[],qc_evidence:v080QcEvidence_(edited,ctx)})}]}
  ],text:{format:{type:'json_schema',name:'editorial_quality_v080',strict:true,schema:schema}},max_output_tokens:4000};
  var sequence=typeof v082Enabled_==='function'&&v082Enabled_()?v082Reserve_(edited,ctx,'qc'):null;
  var response;
  try{response=openAIRequest_('responses',payload);if(sequence)v082Finish_(edited,ctx,sequence,response,null);}
  catch(e){if(sequence)v082Finish_(edited,ctx,sequence,null,e);throw e;}
  var output=parseStructuredResponse_(response,'Editorial Independent QC v0.8');
  var sum=0,valid=true;
  axes.forEach(function(k){var n=output.scores&&output.scores[k];if(typeof n!=='number'||!isFinite(n)||Math.floor(n)!==n||n<0||n>4)valid=false;else sum+=n;});
  if(!Array.isArray(output.issues)||typeof output.source_unverified!=='boolean')valid=false;
  return {body_sha256:typeof v082Sha_==='function'?v082Sha_(String(edited.body_markdown||'').trim()):null,
    evidence_sha256:typeof v082Sha_==='function'?v082Sha_(JSON.stringify(v080QcEvidence_(edited,ctx))):null,
    pass:valid&&sum>=16&&axes.every(function(k){return output.scores[k]>=2;})&&output.issues.length===0&&output.source_unverified===false,total:valid?sum:null,issues:output.issues||[],source_unverified:output.source_unverified,reason:output.reason||'',recommendations:Array.isArray(output.recommendations)?output.recommendations:[],is_human_reader_test:false};
}

var V080_QUALITY_ADAPTER = (function () {
  if (V080_QUALITY_MODE === 'OFF') return 'DISABLED';
  if (typeof openAIRequest_ !== 'function' || typeof finalizeWebBlog_ !== 'function') return 'LEGACY_WRITER_EDITOR_NOT_PRESENT';
  var previousRequest = openAIRequest_, previousFinalize = finalizeWebBlog_;
  if (V080_QUALITY_MODE === 'ENFORCE') {
    openAIRequest_ = function(endpoint,payload) {
      var name=payload&&payload.text&&payload.text.format&&payload.text.format.name;
      if(endpoint==='responses'&&name&&Array.isArray(payload.input)&&payload.input[0]&&payload.input[0].content){
        var writer=name==='web_blog_draft_v1', editor=name==='web_blog_final_editor_v1';
        if(writer||editor) {
          var guidance=writer ?
            'Editorial Quality v0.8 WRITER: Answer the reader question within the opening paragraphs. Deliver one genuinely useful distinction, concrete decision/action, appropriate research limitations and a real example. Separate verified store facts from assumptions. Do not invent a trainer/client story. Local comparison titles require verified local options. Protect safety exceptions. For COMPARISON_GUIDE, help readers compare meaningful responses or decision options explicitly rather than offering only an undifferentiated checklist. In exercise-safety topics, distinguish discomfort from red flags such as chest pain, faintness or sudden severe pain: do not encourage trial exercise, and guide stopping activity and prompt appropriate medical attention. Do not diagnose. STANDARD body 1600-2400 non-whitespace characters; never pad.' :
            'Editorial Quality v0.8 PRESERVATION EDITOR: Keep the writer answer, knowledge gain, next action, meaningful examples, every safety caveat and source limitation. Edit style and order, never delete essential details for shortness. No new store procedures, medical promises, unverified outcomes or invented quotes. If uncertain, set fact_check_status REVIEW. Preserve the final topic-specific THE REV. conclusion in body_markdown, grounded in the owner interview; the separate CTA is not a substitute. Keep only verified store positions, not inferred procedures. STANDARD body 1600-2400 excluding whitespace; never pad.';
          payload.input[0].content.push({type:'input_text',text:guidance});
        }
      }
      if(typeof V082_ACTIVE_REPAIR!=='undefined'&&V082_ACTIVE_REPAIR && name==='web_blog_final_editor_v1'){
        payload.input[0].content.push({type:'input_text',text:'Repair only the listed QC blockers using this verified evidence. Preserve owner attribution, safety exceptions, useful distinctions, topic and article identity. Do not invent facts or rewrite unrelated material. Return fresh scores and fact decision. '+JSON.stringify(V082_ACTIVE_REPAIR.feedback)});
        var active=V082_ACTIVE_REPAIR,seq=v082Reserve_(active.draft,active.ctx,'repair');
        try{var response=previousRequest.apply(this,arguments);v082Finish_(active.draft,active.ctx,seq,response,null);return response;}
        catch(e){v082Finish_(active.draft,active.ctx,seq,null,e);throw e;}
      }
      return previousRequest.apply(this,arguments);
    };
  }
  finalizeWebBlog_ = function(draft,ctx){
    var result=previousFinalize.apply(this,arguments);
    var base=v080BaseQuality_(draft,result);
    var independent=null;
    if(V080_QUALITY_MODE==='ENFORCE'){
      try{independent=v080IndependentQc_(result,ctx);}catch(e){independent={pass:false,error:String(e).slice(0,240)};}
    }
    var recovery=null;
    if(V080_QUALITY_MODE==='ENFORCE'&&typeof v082Repair_==='function'&&v082Enabled_()){
      var recovered=v082Repair_(draft,result,ctx,base,independent,previousFinalize);
      result=recovered.result;base=recovered.base;independent=recovered.independent;recovery=recovered.audit;
    }
    var allowed=base.pass&&(V080_QUALITY_MODE==='SHADOW'||Boolean(independent&&independent.pass));
    var note={};try{note=JSON.parse(String(result._editor_notes||'{}'));}catch(_){note={legacy_editor_notes: String(result._editor_notes||'').slice(0,500)};}
    note.quality_v080={mode:V080_QUALITY_MODE,deterministic:base,independent:independent,enforced:V080_QUALITY_MODE==='ENFORCE',passed:allowed,publish_requires_human:true};
    if(recovery)note.production_recovery_v082=recovery;
    result._editor_notes=JSON.stringify(note);
    if(V080_QUALITY_MODE==='ENFORCE'&&!allowed){result._editor_decision='REVIEW_REQUIRED';result._fact_check_status='REVIEW';}
    return result;
  };
  return 'ACTIVE_'+V080_QUALITY_MODE;
})();

/**
 * One-shot, content-ID scoped editorial re-review.
 * To be run manually in the bound GAS project ONLY AFTER this exact source
 * has been installed and QUALITY_V08_MODE=ENFORCE was read back.
 * Never changes human publication approval or fakes a QC pass.
 */
function requeueOct15EditorialIndependentQcReview() {
  if (V080_QUALITY_MODE !== 'ENFORCE') throw new Error('V080_NOT_ENFORCED');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('OCT15_REVIEW_RETRY_LOCKED');
  try {
    var contentId = 'BLOG-20261015-fac1fd';
    var proposalId = 'TP-20261015';
    var sheet = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
    var blogSheet = ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
    if (!sheet || !blogSheet) throw new Error('EDITORIAL_SHEETS_NOT_FOUND');
    var row = getObjectsWithRow_(sheet).filter(function(r) { return String(r.content_id || '') === contentId; })[0];
    if (!row || !row.__row) throw new Error('OCT15_QUEUE_ROW_NOT_FOUND');
    if (String(row.queue_status) !== 'REVIEW_REQUIRED' || String(row.draft_status) !== 'REVIEW_REQUIRED')
      return {status:'NOOP_NOT_QC_REVIEW',content_id:contentId,queue_status:row.queue_status};
    var originalError=String(row.last_error||'');
    if (originalError !== 'Final Editor / Fact / Topic Gate requires review')
      throw new Error('OCT15_REVIEW_REASON_CHANGED');
    if (String(row.notes || '').indexOf('[V080_OCT15_REVIEW_RETRY]') >= 0)
      return {status:'NOOP_ALREADY_REQUEUED',content_id:contentId};
    var k={};
    try { k=JSON.parse(String(row.knowledge_context_json||'{}')); } catch (_) {throw new Error('OCT15_KNOWLEDGE_JSON_INVALID');}
    if (!k.topic_approval || k.topic_approval.proposal_id!==proposalId ||
      !Array.isArray(k.interview) || k.interview.length!==2 ||
      k.interview.some(function(x) {return !String(x.answer||'').trim();}))
      throw new Error('OCT15_APPROVED_INTERVIEW_MISSING');
    var blog=getObjectsWithRow_(blogSheet).filter(function(r){return String(r.content_id||'')===contentId;})[0];
    if (!blog || String(blog.status)!=='REVIEW_REQUIRED') throw new Error('OCT15_QC_BLOG_MISMATCH');
    var editor={};
    try {editor=JSON.parse(String(blog.editor_notes||'{}'));}catch(_){throw new Error('OCT15_EDITOR_NOTES_INVALID');}
    if (editor.quality_v080?.mode !== 'ENFORCE' || editor.quality_v080?.independent?.pass !== false)
      throw new Error('OCT15_INDEPENDENT_QC_FAILURE_NOT_CONFIRMED');
    var now=new Date();
    setObjectRow_(sheet,row.__row,{
      queue_status:'PATCHING',
      draft_status:'NOT_STARTED',
      failed_stage:'',
      next_stage:'BLOG_DRAFT',
      human_action_required:'NONE',
      last_error:'',
      notes:String(row.notes||'')+' | [V080_OCT15_REVIEW_RETRY] Approved interview retained; rerun with verified QC evidence and safety/comparison improvements.',
      updated_at:now
    });
    return {status:'REQUEUED_FOR_CANONICAL_QC',content_id:contentId,proposal_id:proposalId,auto_publish:false};
  } finally {lock.releaseLock();}
}


/** Autonomous Production Recovery v0.8.2. Install in generated bundle.
 * Opt-in property THE_REV_EDITORIAL_RECOVERY_V082_MODE=ENFORCE.
 * Existing Writer/Editor/Topic/Fact gates and human Publish stay authoritative.
 * One preservation repair + two independent QCs per topic/slug lifetime.
 * Script Properties reserve calls before API; ambiguous calls never auto-retry.
 */
var V082_ACTIVE_REPAIR = null;
// Durable external requests already consumed before GAS installation. This
// import prevents a fresh Script Properties journal from minting a new budget.
var V082_IMPORTED_QC_HISTORY = [
  {
    "identities": [
      "TP-20261021",
      "night-workout-sleep-timing-intensity"
    ],
    "calls": [
      {
        "request_id": "req_5132beae5d104cfb807c551661e7ae18",
        "model": "gpt-5.6-sol",
        "usage": {
          "input_tokens": 3398,
          "input_tokens_details": {
            "cache_write_tokens": 3395,
            "cached_tokens": 0
          },
          "output_tokens": 711,
          "output_tokens_details": {
            "reasoning_tokens": 356
          },
          "total_tokens": 4109
        },
        "pass": false,
        "total": 19,
        "body_sha256": "0071e929f34aef5121f9f62a0ee5f212f97c9f91b1a1df0875758104ffef50be",
        "kind": "qc",
        "status": "COMPLETED",
        "imported": true,
        "confirmed_cost": null,
        "source_path": "editorial/production-recovery/2026-10-20/oct21-independent-qc-claim.json"
      },
      {
        "request_id": "req_885cd030abb642d784f4c82adebcbb26",
        "model": "gpt-5.6-sol",
        "usage": {
          "input_tokens": 3356,
          "input_tokens_details": {
            "cache_write_tokens": 3353,
            "cached_tokens": 0
          },
          "output_tokens": 855,
          "output_tokens_details": {
            "reasoning_tokens": 394
          },
          "total_tokens": 4211
        },
        "pass": false,
        "total": 18,
        "body_sha256": "f8ae09cce8d17253c5e82001cbf625ef606a9122881907c232ff61cc36c730f3",
        "kind": "qc",
        "status": "COMPLETED",
        "imported": true,
        "confirmed_cost": null,
        "source_path": "editorial/production-recovery/2026-10-20/oct21-independent-qc-claim.json"
      }
    ]
  }
];
function v082ImportedQcCalls_(identity) {
  var entry=V082_IMPORTED_QC_HISTORY.find(function(x){return x.identities.indexOf(identity)>=0;});
  return entry?entry.calls.map(function(c){return Object.assign({},c);}):[];
}

function v082Enabled_() {
  return String(PropertiesService.getScriptProperties().getProperty('THE_REV_EDITORIAL_RECOVERY_V082_MODE')||'OFF')==='ENFORCE';
}
function v082Sha_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8)
    .map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function v082Identity_(draft,ctx) {
  return String(ctx&&ctx.first_party_interview&&ctx.first_party_interview.source_id || draft&&draft.slug_suggestion || '').trim();
}
function v082Journal_(draft,ctx,mutate) {
  var id=v082Identity_(draft,ctx);if(!id)throw new Error('V082_RECOVERY_IDENTITY_MISSING');
  var props=PropertiesService.getScriptProperties(),key='THE_REV_PRODUCTION_RECOVERY_'+v082Sha_(id).slice(0,24);
  var lock=LockService.getScriptLock(),alreadyHeld=lock.hasLock();if(!alreadyHeld&&!lock.tryLock(1000))throw new Error('V082_RECOVERY_BUSY');
  try{
    var raw=props.getProperty(key),record=raw?JSON.parse(raw):{identity:id,calls:[],confirmed_cost:null};
    if(record.identity!==id || !Array.isArray(record.calls))throw new Error('V082_CHECKPOINT_CORRUPT');
    v082ImportedQcCalls_(id).forEach(function(c){
      if(!record.calls.some(function(existing){return existing.request_id===c.request_id;}))record.calls.push(c);
    });
    if(mutate){mutate(record);props.setProperty(key,JSON.stringify(record));}
    return record;
  }finally{if(!alreadyHeld)lock.releaseLock();}
}
function v082Reserve_(draft,ctx,kind) {
  return v082Journal_(draft,ctx,function(r){
    if(r.calls.some(function(c){return c.status==='STARTED'||c.status==='UNCERTAIN';}))throw new Error('V082_AMBIGUOUS_API_REQUEST');
    if(r.calls.filter(function(c){return c.kind===kind;}).length>=(kind==='qc'?2:1))throw new Error('V082_'+kind.toUpperCase()+'_LIMIT');
    r.calls.push({kind:kind,status:'STARTED',at:new Date().toISOString(),body_sha256:v082Sha_(draft.body_markdown||''),confirmed_cost:null});
  }).calls.length;
}
function v082Finish_(draft,ctx,sequence,response,error) {
  return v082Journal_(draft,ctx,function(r){
    var c=r.calls[sequence-1];if(!c||c.status!=='STARTED')throw new Error('V082_RESERVATION_MISMATCH');
    c.status=error?'UNCERTAIN':'COMPLETED';c.completed_at=new Date().toISOString();
    c.request_id=response&&response._request_id||null;c.response_id=response&&response.id||null;
    c.usage=response&&response.usage||null;c.error=error?String(error).slice(0,240):null;
  });
}
function v082Repair_(original,result,ctx,base,independent,editor) {
  var audit={version:'v0.8.2',original_body_sha256:v082Sha_(result.body_markdown||''),
    initial_qc:independent,initial_deterministic:base,writer_reused:true,automatic_publish:false};
  if(!v082Enabled_())return {result:result,base:base,independent:independent,audit:null};
  if(independent&&independent.error){audit.stopped_reason='QC_API_FAILURE';audit.next_action='RECONCILE_API_CHECKPOINT';return {result:result,base:base,independent:independent,audit:audit};}
  var evidence=v080QcEvidence_(result,ctx);
  if(independent&&independent.source_unverified===true && !evidence.verified_official_excerpts.length && !evidence.verified_research_excerpts.length){
    audit.stopped_reason='SOURCE_EVIDENCE_MISSING';audit.next_action='COLLECT_VERIFIABLE_EVIDENCE';
    return {result:result,base:base,independent:independent,audit:audit};
  }
  if(base.pass&&independent&&independent.pass)return {result:result,base:base,independent:independent,audit:audit};
  var revised=result;
  try{
    V082_ACTIVE_REPAIR={draft:result,ctx:ctx,feedback:{deterministic:base.errors,independent:independent,evidence:evidence}};
    // Use the existing Editor contract and scores again. Never preserve a stale 91.
    revised=editor(result,ctx);
    V082_ACTIVE_REPAIR=null;
    base=v080BaseQuality_(original,revised);
    independent=v080IndependentQc_(revised,ctx);
    audit.revised_body_sha256=v082Sha_(revised.body_markdown||'');
    audit.stopped_reason=base.pass&&independent.pass?null:'REPAIR_QC_REJECTED';
    audit.next_action=audit.stopped_reason?'OWNER_REVIEW_WITH_QC_FINDINGS':'CANONICAL_SUPERVISOR_CONTINUE';
  }catch(e){
    audit.stopped_reason=String(e).slice(0,240);audit.next_action='RECONCILE_CHECKPOINT_BEFORE_RETRY';
    // No unverified revised body becomes READY after a QC exception.
    base={pass:false,errors:['V082_REPAIR_NOT_VERIFIED']};independent={pass:false,error:audit.stopped_reason};
  }finally{V082_ACTIVE_REPAIR=null;}
  return {result:revised,base:base,independent:independent,audit:audit};
}
// Adds only reviewed primary-source summaries whose EXACT URL occurs in refs.
// URL strings alone are not evidence. Unknown future sources remain blocked.
function v082ResearchEvidence_(refs) {
  var urls=(refs||[]).map(String).join('\n').match(/https:\/\/[^\s)\]"<>]+/g)||[];
  return V082_RESEARCH_CATALOG.filter(function(e){return urls.indexOf(e.url)>=0;});
}

// Reviewed catalog; source provenance and limits travel with every QC request.
var V082_RESEARCH_CATALOG = [
  {
    "source_type": "PRIMARY_RESEARCH_REVIEWED_SUMMARY",
    "url": "https://pubmed.ncbi.nlm.nih.gov/30374942/",
    "verification_url": "https://link.springer.com/article/10.1007/s40279-018-1015-0",
    "document": "Stutz et al. Sports Medicine 2019;49:269–287",
    "verified_at": "2026-10-20",
    "section": "Publisher abstract: Methods, Results, Conclusion",
    "verified_points": [
      "健康な成人で夕方・夜の単回運動と非運動を比較した23研究の系統的レビュー・メタ分析。全体として夜の運動が睡眠を悪化させるという仮説を支持しなかった。",
      "就寝1時間以内に終了する激しい運動では入眠潜時・睡眠時間・睡眠効率が損なわれる可能性がある。"
    ],
    "scope": "健康な成人の研究。1時間を全員共通の安全境界としない。全種目・不眠症・患者への一般化不可。リンク先公開抄録までを検証し、購読本文を読了したとは主張しない。",
    "summary_sha256": "5e4d12743f0358d04c748bd29c45804652173e6615cc065f9d8859981b485459"
  },
  {
    "source_type": "PRIMARY_RESEARCH_REVIEWED_SUMMARY",
    "url": "https://pubmed.ncbi.nlm.nih.gov/34416428/",
    "document": "Frimpong et al. Sleep Medicine Reviews 2021;60:101535",
    "verified_at": "2026-10-20",
    "section": "PubMed abstract",
    "verified_points": [
      "18–50歳の健康で普段よく眠れる成人を対象にした夜間高強度運動15研究・194人のメタ分析。",
      "就寝0.5–4時間前の単回高強度運動ではREM睡眠割合が減少した一方、その他の有意な睡眠変化はなかった。著者は2–4時間前の高強度運動で全体として睡眠を乱さないと結論した。"
    ],
    "scope": "対象・種目・実験条件に限る。すべての夜間筋トレの安全性や睡眠改善保証ではない。REM変化を無視して悪影響ゼロとしない。",
    "summary_sha256": "981642cffe0cc5c64df695b43166703400d94101623711a7bbf8728f9438b7ca"
  },
  {
    "source_type": "PRIMARY_RESEARCH_REVIEWED_SUMMARY",
    "url": "https://www.nature.com/articles/s41467-025-58271-x",
    "document": "Leota et al. Nature Communications 2025, Dose-response relationship between evening exercise and sleep",
    "verified_at": "2026-10-20",
    "section": "Discussion, limitations; Methods study population",
    "verified_points": [
      "活動的な成人14,689人・4,084,354人夜のウェアラブル記録による後ろ向き観察研究。",
      "終了時刻が遅く運動負荷が高いほど、入眠時刻の遅れ・睡眠時間短縮などと関連した。著者は可能なら入眠4時間以上前の終了、それ以内では軽い負荷を提案した。",
      "心拍に基づく負荷指標は短時間の高努力筋トレを過小評価する可能性があり、光曝露など交絡を完全には制御していない。"
    ],
    "scope": "関連であり因果の証明ではない。入眠時刻と床に就く時刻は異なり、入眠潜時を測定していない。4時間は全員共通の安全境界ではない。",
    "summary_sha256": "99b0f9fa05892e1fc4a243036a80e90b0b2b304a945615da3b8abbce4087b538"
  },
  {
    "source_type": "OFFICIAL_SOURCE_REVIEWED_SUMMARY",
    "url": "https://www.mhlw.go.jp/content/001305530.pdf",
    "document": "健康づくりのための睡眠ガイド2023",
    "verified_at": "2026-10-20",
    "section": "PDF page 28 (zero-based27), printed26: 運動強度と運動時間／運動のタイミングと頻度",
    "verified_points": [
      "夕方や夜の運動でも、就寝の約2～4時間前までという目安で、睡眠改善に有効と報告している。",
      "年齢・体調に応じて無理のない軽い運動から始め、寝る直前まで興奮状態が続くことを避ける。",
      "中強度の運動を息が弾み汗をかく程度と説明し、散歩・屋外でのウォーキング・軽い筋力トレーニングなどを例示している。"
    ],
    "scope": "一般的な目安。ジムだけの規則やTHE REV.の店舗固有の決まりではない。睡眠効果や安全性を保証しない。 この強度の説明を、就寝直前の安全基準、特定のRPE/RIRの睡眠効果、時刻別メニューの検証結果と扱わない。",
    "summary_sha256": "64898e4f9097c2ee842566f509fa35ad131d5040c6a1f491d650b23592c71370"
  }
];

// Send the existing Supervisor's exact accepted article proof through its normal
// Bridge call. Do not create a second scheduler or bypass v065 sheet readback.
var V082_BRIDGE_ADAPTER=(function(){
  if(typeof v065SyncBridgeDirect_!=='function'||typeof v065FetchJson_!=='function')return 'LEGACY_BRIDGE_NOT_PRESENT';
  var bridge=v065SyncBridgeDirect_,fetchJson=v065FetchJson_,active=null;
  v065FetchJson_=function(url,options){
    if(active&&url==='https://the-rev-website.vercel.app/api/integrations/editorial'&&options&&options.payload){
      var payload=JSON.parse(options.payload);
      payload.production_recovery_version='v0.8.2';payload.editorial_text_qc=active;
      options=Object.assign({},options,{payload:JSON.stringify(payload)});
    }
    return fetchJson(url,options);
  };
  v065SyncBridgeDirect_=function(queue,blog){
    if(!v082Enabled_())return bridge.apply(this,arguments);
    var notes=JSON.parse(String(blog.editor_notes||'{}')),quality=notes.quality_v080,qc=quality&&quality.independent;
    if(blog.status!=='READY'||blog.fact_check_status!=='PASS'||!quality||quality.passed!==true||!qc||qc.pass!==true||qc.source_unverified!==false||qc.body_sha256!==v082Sha_(String(blog.body_markdown||'').trim()))
      throw new Error('V082_BRIDGE_TEXT_QC_NOT_PASSED');
    v082EnsureGbp_(queue,blog);
    active={schema:'editorial-text-qc-v1',content_id:queue.content_id,body_sha256:qc.body_sha256,evidence_sha256:qc.evidence_sha256,
      pass:true,total:qc.total,source_unverified:false,issues:qc.issues,version:'v0.8.2'};
    try{return bridge.apply(this,arguments);}finally{active=null;}
  };
  return 'INSTALLED_OPT_IN';
})();

/** Resume the oldest existing independently rejected article on the PRIMARY
 * generation tick. No Writer reset, new Queue, second Draft or extra trigger.
 * Current quality/API journal bounds also apply to this pre-upgrade backlog.
 */
function v082ResumeExistingReview_() {
  if(!v082Enabled_()||V080_QUALITY_MODE!=='ENFORCE')return null;
  var qsh=ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE'),bsh=ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
  if(!qsh||!bsh)return null;
  var blogs=getObjectsWithRow_(bsh),selected=null;
  getObjectsWithRow_(qsh).some(function(q){
    if(q.queue_status!=='REVIEW_REQUIRED'||q.draft_status!=='REVIEW_REQUIRED')return false;
    var b=blogs.find(function(x){return x.content_id===q.content_id&&x.status==='REVIEW_REQUIRED';});if(!b)return false;
    var n,k;try{n=JSON.parse(String(b.editor_notes||'{}'));k=JSON.parse(String(q.knowledge_context_json||'{}'));}catch(_){return false;}
    if(!k.topic_approval||!k.topic_approval.approved_at||!n.quality_v080||n.quality_v080.independent?.pass!==false||n.production_recovery_v082)return false;
    var refs;try{refs=JSON.parse(String(b.source_refs||'[]'));}catch(_){return false;}
    if(!v082ResearchEvidence_(refs).length)return false; // No evidence guessing, no paid loop.
    selected={q:q,b:b,k:k,refs:refs};return true;
  });
  if(!selected)return null;
  var q=selected.q,b=selected.b,k=selected.k;
  var ctx=buildM6Context_(v065WeekDate_(q.week_start||q.run_date));
  var answers=Array.isArray(k.interview)?k.interview:[];
  if(answers.length){
    if(answers.some(function(a){return !String(a.answer||'').trim();}))return null;
    ctx.first_party_interview={source_id:k.topic_approval.proposal_id,raw_answer:answers.map(function(a,i){return (i+1)+'. '+String(a.question||'')+'\n'+a.answer;}).join('\n\n')};
  }
  var parse=function(v,fallback){try{return JSON.parse(String(v||''));}catch(_){return fallback;}};
  var draft={...b,slug_suggestion:b.slug_suggestion,source_refs:selected.refs,article_type:b.article_type||'STANDARD',
    _editor_notes:b.editor_notes,_editor_score:Number(b.editor_score),_topic_gate:parse(q.topic_gate_json,{})};
  var journal=v082Journal_(draft,ctx);
  if(journal.calls.length)return null; // Previous unfinished call must be reconciled, never rewound.
  var final=finalizeWebBlog_(draft,ctx),notes=parse(final._editor_notes,{});
  notes.recovery_v082_prior_body=String(b.body_markdown||'');
  notes.recovery_v082_prior_editor_notes=String(b.editor_notes||'');
  var ready=final._editor_decision==='READY'&&final._fact_check_status==='PASS'&&notes.quality_v080?.passed===true&&draft._topic_gate.decision==='PUBLISH'&&v065LengthGate_(draft.article_type,final.body_markdown).pass===true;
  var patch={title:final.title,slug_suggestion:final.slug_suggestion,body_markdown:final.body_markdown,meta_description:final.meta_description||b.meta_description,
    lead:final.lead||b.lead,cta:final.cta||b.cta,source_refs:final.source_refs,internal_link_suggestions:final.internal_link_suggestions||b.internal_link_suggestions,
    editor_notes:JSON.stringify(notes),editor_score:final._editor_score,editor_decision:final._editor_decision,
    fact_check_status:ready?'PASS':'REVIEW',status:ready?'READY':'REVIEW_REQUIRED'};
  setObjectRow_(bsh,b.__row,patch); // Accepted body is checkpointed before GBP / Bridge.
  if(!ready){
    setObjectRow_(qsh,q.__row,{queue_status:'REVIEW_REQUIRED',failed_stage:'INDEPENDENT_QC',next_stage:'HUMAN_REVIEW',human_action_required:'REVIEW_QC_FINDINGS',last_error:JSON.stringify(notes.quality_v080.independent),updated_at:new Date()});
    return {status:'EXISTING_DRAFT_QC_HELD',content_id:q.content_id};
  }
  setObjectRow_(qsh,q.__row,{queue_status:'BRIDGE_SYNCING',draft_status:'READY',last_successful_stage:'BLOG_QC_PASSED',failed_stage:'',next_stage:'WEB_BRIDGE',last_error:'',updated_at:new Date()});
  // The existing Supervisor owns GBP and Bridge continuation, including its
  // READY/PASS resume path. Never run another Writer from this adapter.
  return {status:'EXISTING_DRAFT_QC_PASSED',content_id:q.content_id};
}
var V082_PRIMARY_ADAPTER=(function(){
  if(typeof v065GeneratePendingArticle_!=='function')return 'PRIMARY_NOT_PRESENT';
  var previous=v065GeneratePendingArticle_;
  v065GeneratePendingArticle_=function(){
    if(!v082Enabled_())return previous.apply(this,arguments);
    var lock=LockService.getScriptLock(),held=lock.hasLock();
    if(!held&&!lock.tryLock(1000))return {status:'RECOVERY_PRIMARY_BUSY'};
    try{var recovered=v082ResumeExistingReview_(),result=recovered||previous.apply(this,arguments);v082ReflectHold_();return result;}
    finally{if(!held)lock.releaseLock();}
  };
  return 'PRIMARY_ONLY_OPT_IN';
})();

function v082EnsureGbp_(queue,blog) {
  var sh=ss_().getSheetByName('22_GBP_POST');if(!sh)throw new Error('V082_GBP_SHEET_MISSING');
  var rows=getObjectsWithRow_(sh).filter(function(r){return r.parent_blog_id===queue.content_id;});
  if(rows.length>1)throw new Error('V082_DUPLICATE_GBP_ROWS');
  if(rows[0]&&rows[0].status==='READY')return;
  var ctx=buildM6Context_(v065WeekDate_(queue.week_start||queue.run_date));
  var identity={first_party_interview:{source_id:queue.content_id}},record=v082Journal_(blog,identity),gbp=record.gbp_checkpoint;
  if(!gbp){
    var sequence=v082Reserve_(blog,identity,'gbp');
    try{gbp=generateGBPFromBlog_({...blog,_editor_notes:blog.editor_notes},ctx);v082Finish_(blog,identity,sequence,gbp,null);}
    catch(e){v082Finish_(blog,identity,sequence,null,e);throw e;}
    // Save the output before the Sheet write so sync retries do not repeat API.
    v082Journal_(blog,identity,function(r){r.gbp_checkpoint=gbp;});
  }
  var value={generated_at:new Date(),content_id:rows[0]?.content_id||'GBP-'+queue.content_id,parent_blog_id:queue.content_id,
    title:gbp.title,body_copy_paste:gbp.body_copy_paste,cta_text:gbp.cta_text,local_context:gbp.local_context,
    blog_url_placeholder:'[BLOG_URL]',status:'READY',post_ready:'BLOCKED_URL',notes:gbp.notes||'Human Google posting required'};
  if(rows[0])setObjectRow_(sh,rows[0].__row,value);else appendObjectRow_(sh,value);
}

function v082ReflectHold_(){
  var qsh=ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE'),bsh=ss_().getSheetByName('21_WEB_BLOG_OUTPUT');if(!qsh||!bsh)return;
  var blogs=getObjectsWithRow_(bsh);
  getObjectsWithRow_(qsh).filter(function(q){return q.queue_status==='REVIEW_REQUIRED';}).forEach(function(q){
    var b=blogs.find(function(r){return r.content_id===q.content_id;});if(!b)return;
    var note;try{note=JSON.parse(String(b.editor_notes||'{}'));}catch(_){return;}
    var audit=note.production_recovery_v082;if(!audit||!audit.stopped_reason)return;
    var key='[V082_HOLD:'+v082Sha_(String(b.body_markdown||'')+audit.stopped_reason).slice(0,12)+']';
    if(String(q.notes||'').indexOf(key)>=0)return;
    var api=/API|CHECKPOINT|LIMIT|RESERVATION/.test(audit.stopped_reason);
    setObjectRow_(qsh,q.__row,{last_successful_stage:'BLOG_DRAFT',failed_stage:'INDEPENDENT_QC',
      next_stage:audit.next_action||'HUMAN_REVIEW',human_action_required:api?'RECONCILE_API_CHECKPOINT':'REVIEW_QC_FINDINGS',
      last_error:(api?'API呼出履歴の確認が必要です。自動再試行を停止しました。':'独立QCが未合格です。根拠と修正理由を確認してください。')+' '+audit.stopped_reason,
      notes:String(q.notes||'')+' | '+key,updated_at:new Date()});
    if(typeof v069cStuckAlerts_==='function')v069cStuckAlerts_([{content_id:q.content_id,reason:'QUALITY_RECOVERY_HELD',last_error:audit.stopped_reason}],q.target_date||q.run_date);
  });
}

