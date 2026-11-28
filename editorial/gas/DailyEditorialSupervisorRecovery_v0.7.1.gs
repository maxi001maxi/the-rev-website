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
