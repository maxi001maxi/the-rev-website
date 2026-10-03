/**
 * THE REV. Daily Editorial Autonomy v0.6.9
 * ONE-PASTE INSTALL BUNDLE
 *
 * Generated from:
 * - DailyEditorialGate_v0.6.9.gs
 * - DailyEditorialCreator_v0.6.9.gs
 *
 * Paste this entire file into ONE file in the bound Apps Script project,
 * then run installDailyEditorialAutonomyV069() once.
 * Keep the existing v0.6.5.2 Supervisor in the same project.
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
  'title_candidate', 'primary_query', 'audience_question', 'why_now', 'local_angle', 'unique_angle',
  'selection_reason', 'article_type', 'total_score', 'source_refs', 'notes', 'comparison_doc_url',
  'content_pillar', 'pillar_recent12_count', 'pillar_diversity_adjustment', 'pillar_adjusted_score',
  'pillar_policy_version', 'content_cluster', 'cluster_recent4_count', 'cluster_priority_adjustment',
  'cluster_policy_version', 'editorial_lane', 'portfolio_recent12_count', 'portfolio_soft_target',
  'portfolio_adjustment', 'portfolio_final_score'
];
var V069C_PLAN_FIELDS = [
  'queue_id', 'run_date', 'target_date', 'content_id', 'topic_candidate_id', 'primary_query', 'queue_status',
  'draft_status', 'web_bridge_status', 'created_at', 'updated_at'
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
    settings: v069Settings_()
  });
  if (r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true || !r.json.plan || !r.json.creation) {
    throw new Error('daily_create failed: HTTP ' + r.code + ' / ' + String((r.json && r.json.message) || r.body || '').slice(0, 800));
  }
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
      return { status: 'ALREADY_CREATED', content_id: already.content_id };
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
      stuck: stuckNotices
    };
  } catch (e2) {
    var msg2 = typeof errorText_ === 'function' ? errorText_(e2) : String(e2 && e2.stack || e2);
    v069FinishLog_(runId, 'ERROR_BLOCKED', 0, 'Daily Creator write failed', msg2);
    var sent2 = v069cNotifyOnce_('THE_REV_DAILY_MISSED_ALERT_' + today,
      'THE REV. Editorial AI｜Daily Creatorの書込みに失敗しました\n\n' + String(msg2).slice(0, 1200));
    return { status: 'ERROR_BLOCKED', error: msg2, notification: sent2 };
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

