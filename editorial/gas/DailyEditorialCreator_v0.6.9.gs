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
  var readyNotices = [];
  try { readyNotices = v069cNotifyPreparedReady_(); } catch (_n) {}
  var startHour = Number(v069Settings_().daily_editorial_hour);
  if (!(startHour >= 0)) startHour = V069C_START_HOUR_DEFAULT;
  var hour = v069cJstHour_();
  if (force !== true && (hour < startHour || hour >= V069C_END_HOUR)) return { status: 'OUTSIDE_WINDOW', hour: hour, review_ready_notices: readyNotices };

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
    return { status: 'NO_ACTION', reason: creation.reason, published_reconciled: applied, stuck: stuckNotices };
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
