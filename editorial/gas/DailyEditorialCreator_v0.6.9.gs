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
function v069cReviewContract_(q, blog, gbp, a, reviewUrl) {
  var qa = a.image_qa || {}, gqa = a.gbp_image_qa || {};
  var length = v069cLengthGate_(blog && blog.article_type, blog && blog.body_markdown);
  var closing = v069cEditorialClosingGate_(blog && blog.body_markdown);
  var checks = {
    blog_ready: !!blog && blog.status === 'READY' && length.pass,
    editorial_closing: closing.pass,
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
function v069cEditorialClosingGate_(body) {
  var compact = String(body || '').replace(/\s+/g, ' ').trim();
  if (!compact) return {pass:false, reason:'empty_body'};
  var tail = compact.slice(-1100);
  if (!/THE REV\.?\s*(?:CONDITIONING LAB\.)?/i.test(tail)) {
    return {pass:false, reason:'missing_the_rev_closing'};
  }
  var lastRev = Math.max(tail.lastIndexOf('THE REV.'), tail.lastIndexOf('THE REV'));
  var revTail = lastRev >= 0 ? tail.slice(lastRev) : tail;
  var pass = /(では|として|考え|見て|見る|確認|調整|組み立て|大切|重視|指導|提案|捉え|設備|生活|目的|状態|負荷|使い方|続け)/.test(revTail);
  return {pass:pass, reason:pass ? '' : 'missing_contextual_meaning'};
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
