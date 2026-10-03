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
 *  Every day the run prepares the article for today + lead days (default:
 *  tomorrow's article), only when that target day is a business day.
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
var V069_PLAN_FIELDS = ['queue_id', 'run_date', 'content_id', 'queue_status', 'web_bridge_status', 'created_at', 'updated_at'];

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

// JST date of the article being prepared (26_DAILY_EDITORIAL_QUEUE.run_date).
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
      'THE_REV_DAILY_GATE_' + plan.run_date,
      JSON.stringify({ action: plan.decision.action, reason: plan.decision.reason, active: plan.active.count, cap: plan.active.cap })
    );
    var summary = 'prepared_on=' + plan.prepared_on + ' run_date=' + plan.run_date + ' ' + plan.weekday +
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
    return v069DateKey_(r.run_date) === today && String(r.queue_status || '').toUpperCase() !== 'SKIPPED';
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
    'DAILY_CREATION_NOT_STARTED run_date=' + today + ' notification=' + sent.status,
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
