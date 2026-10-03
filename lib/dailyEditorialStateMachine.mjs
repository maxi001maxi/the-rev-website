// THE REV. Daily Editorial state machine (pure, side-effect free).
//
// This module is the executable source of truth for two decisions that were
// previously left to natural-language automation prompts:
//
//   1. Publish reconciliation: a Queue row whose article already has verified
//      production publication evidence moves to PUBLISHED. Evidence must come
//      from the Supabase publication state written by reconcilePublication()
//      (exact Deploy to Xserver success + live production URL). A Queue status,
//      a human memory or a GitHub commit alone is never enough.
//
//   2. Daily creation gate: on a business day, today's article is created
//      unless today already has a row or the active Queue reached its cap.
//      ACTIVE statuses count toward the cap. They are NOT exclusive locks:
//      one REVIEW_READY article waiting for Human Publish must never stop the
//      next business day's article while active < cap.
//
// The Vercel Bridge exposes this plan to the GAS gate. Neither side publishes.

import { ACTIVE_QUEUE_STATUSES, PUBLISH_STATUS, isTerminalQueueStatus } from './editorialPublication.mjs';

export const DAILY_EDITORIAL_DEFAULTS = Object.freeze({
  enabled: true,
  days: Object.freeze(['TU', 'WE', 'TH', 'SA', 'SU']),
  hour: 5,
  minute: 0,
  maxActive: 5,
  maxNewTopics: 1,
  // Editorial runs every day. Each run prepares the article whose
  // target_date = run_date + leadDays (1 = tomorrow's article is prepared today).
  leadDays: 1,
  // Which target days get an article. Shop business days and Editorial run
  // days are different things: the run itself happens every day.
  cadence: 'BUSINESS_DAYS'
});

export const EDITORIAL_CADENCE = Object.freeze({
  BUSINESS_DAYS: 'BUSINESS_DAYS',
  DAILY: 'DAILY'
});

export const DAILY_DECISION = Object.freeze({
  CREATE_NEW: 'CREATE_NEW',
  NO_ACTION: 'NO_ACTION'
});

export const DAILY_DECISION_REASON = Object.freeze({
  CAPACITY_AVAILABLE: 'CAPACITY_AVAILABLE',
  DISABLED: 'DISABLED',
  CLOSED_DAY: 'CLOSED_DAY',
  ALREADY_SCHEDULED_TODAY: 'ALREADY_SCHEDULED_TODAY',
  ACTIVE_CAP_REACHED: 'ACTIVE_CAP_REACHED',
  INVALID_DATE: 'INVALID_DATE'
});

// What an existing non-terminal row needs. None of these block today's
// creation; only the active count can.
export const EXISTING_WORK = Object.freeze({
  NEW: 'SELECT_TOPIC',
  KNOWLEDGE_CHECK: 'KNOWLEDGE_GATE',
  TOPIC_SELECTED: 'RESUME_DRAFT',
  INTERVIEW_WAITING: 'AWAIT_INTERVIEW_ANSWER',
  INTERVIEW_COMPLETE: 'RESUME_DRAFT',
  DRAFTING: 'RESUME_DRAFT',
  PATCHING: 'RESUME_DRAFT',
  QC: 'RESUME_QC',
  BRIDGE_SYNCING: 'RETRY_BRIDGE',
  BRIDGE_ERROR: 'RETRY_BRIDGE',
  IMAGE_PREPARING: 'POLL_IMAGE',
  REVIEW_READY: 'AWAIT_HUMAN_PUBLISH',
  REVIEW_REQUIRED: 'AWAIT_HUMAN_REVIEW',
  ERROR: 'ERROR_BLOCKED'
});

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function token(value) {
  if (value === true) return 'TRUE';
  if (value === false) return 'FALSE';
  if (value == null) return '';
  return String(value).trim().toUpperCase();
}

function jstKeyFromEpoch(ms) {
  const d = new Date(ms + JST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Normalizes Sheets/GAS date values to a JST YYYY-MM-DD key.
// Unparseable values return null; they never silently become "today".
export function toJstDateKey(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : jstKeyFromEpoch(value.getTime());
  }
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 1) return null;
    // Sheets serial dates are local (JST) calendar days.
    const d = new Date(SHEETS_EPOCH_MS + Math.floor(serial) * DAY_MS);
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const plain = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T](?!.*(?:Z|[+-]\d{2}:?\d{2})$))/);
  if (plain) {
    return `${plain[1]}-${plain[2].padStart(2, '0')}-${plain[3].padStart(2, '0')}`;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : jstKeyFromEpoch(parsed);
}

export function addDaysToDateKey(dateKey, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return null;
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayCodeForDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return null;
  return WEEKDAYS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(token).filter(Boolean);
  return String(value || '')
    .split(/[|,\s]+/)
    .map(token)
    .filter(Boolean);
}

// Reads 08_SETTINGS-style keys. Settings may tune days and caps, but cannot
// turn an ACTIVE status into an exclusive creation lock.
export function dailyEditorialSettings(settings = {}) {
  const enabledToken = token(settings.daily_editorial_enabled);
  const days = splitList(settings.daily_editorial_days);
  const maxActive = Number(settings.daily_editorial_max_active_queue);
  const maxNew = Number(settings.daily_editorial_max_new_topics);
  const lead = Number(settings.daily_editorial_lead_days);
  const activeStatuses = splitList(settings.daily_editorial_active_statuses)
    .filter((s) => !isTerminalQueueStatus(s));
  return {
    enabled: !['FALSE', '0', 'NO', 'OFF'].includes(enabledToken),
    days: days.length ? days : [...DAILY_EDITORIAL_DEFAULTS.days],
    maxActive: Number.isFinite(maxActive) && maxActive >= 1 ? Math.floor(maxActive) : DAILY_EDITORIAL_DEFAULTS.maxActive,
    maxNewTopics: Number.isFinite(maxNew) && maxNew >= 0 ? Math.floor(maxNew) : DAILY_EDITORIAL_DEFAULTS.maxNewTopics,
    leadDays: settings.daily_editorial_lead_days !== '' && settings.daily_editorial_lead_days != null
      && Number.isInteger(lead) && lead >= 0 && lead <= 7 ? lead : DAILY_EDITORIAL_DEFAULTS.leadDays,
    cadence: token(settings.daily_editorial_cadence) === EDITORIAL_CADENCE.DAILY
      ? EDITORIAL_CADENCE.DAILY
      : EDITORIAL_CADENCE.BUSINESS_DAYS,
    activeStatuses: activeStatuses.length ? activeStatuses : [...ACTIVE_QUEUE_STATUSES]
  };
}

// Verified publication evidence. Accepts the Supabase draft (or the article
// returned by reconcilePublication) and requires the durable PUBLISHED state
// with verification timestamp and URL. PUBLISH_COMMITTED is not enough.
// The content day a Queue row is for. Rows created before target_date existed
// were same-day rows, so their run_date is their target.
export function rowTargetDateKey(row) {
  return toJstDateKey(row?.target_date) || toJstDateKey(row?.run_date);
}

export function hasVerifiedPublication(evidence) {
  if (!evidence) return false;
  const article = evidence.article && !evidence.publish_status ? evidence.article : evidence;
  return (
    token(article?.publish_status) === PUBLISH_STATUS.PUBLISHED
    && Boolean(String(article?.publish_verified_at || '').trim())
    && Boolean(String(article?.published_url || '').trim())
  );
}

export function reconcileQueueRows(rows = [], evidenceByContentId = {}) {
  const patches = [];
  const pending = [];
  const reconciled = rows.map((row) => {
    const contentId = String(row?.content_id || '').trim();
    const status = token(row?.queue_status);
    if (!contentId || isTerminalQueueStatus(status)) return row;

    const evidence = evidenceByContentId[contentId];
    if (hasVerifiedPublication(evidence)) {
      const article = evidence.article && !evidence.publish_status ? evidence.article : evidence;
      const patch = {
        content_id: contentId,
        from_queue_status: status,
        queue_status: 'PUBLISHED',
        web_bridge_status: 'PUBLISHED',
        published_url: String(article.published_url),
        publish_verified_at: String(article.publish_verified_at),
        publish_commit_sha: article.publish_commit_sha || null,
        last_successful_stage: 'PUBLISHED',
        next_stage: '',
        human_action_required: 'NONE',
        reason: 'VERIFIED_PRODUCTION_PUBLICATION'
      };
      patches.push(patch);
      return { ...row, queue_status: 'PUBLISHED', web_bridge_status: 'PUBLISHED' };
    }

    if (token(evidence?.publish_status || evidence?.article?.publish_status) === PUBLISH_STATUS.PUBLISH_COMMITTED) {
      pending.push({ content_id: contentId, queue_status: status, reason: 'PUBLISH_COMMITTED_AWAITING_DEPLOY_VERIFICATION' });
    }
    return row;
  });
  return { rows: reconciled, patches, pending };
}

export function activeQueueSummary(rows = [], { activeStatuses = ACTIVE_QUEUE_STATUSES } = {}) {
  const allowed = new Set(activeStatuses.map(token));
  const active = rows.filter((row) => allowed.has(token(row?.queue_status)));
  const byStatus = {};
  for (const row of active) {
    const s = token(row.queue_status);
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  return {
    count: active.length,
    content_ids: active.map((row) => String(row.content_id || row.queue_id || '').trim()).filter(Boolean),
    by_status: byStatus
  };
}

export function existingWorkFor(rows = []) {
  return rows
    .filter((row) => !isTerminalQueueStatus(row?.queue_status) && token(row?.queue_status))
    .map((row) => ({
      content_id: String(row.content_id || '').trim() || null,
      queue_status: token(row.queue_status),
      next_action: EXISTING_WORK[token(row.queue_status)] || 'INSPECT',
      blocks_daily_creation: false
    }));
}

export function planDailyEditorial({
  rows = [],
  now = new Date(),
  settings = {},
  evidenceByContentId = {}
} = {}) {
  const cfg = dailyEditorialSettings(settings);
  // run_date = the day Editorial runs. target_date = the content / publish day.
  const runDate = toJstDateKey(now);
  const targetDate = addDaysToDateKey(runDate, cfg.leadDays);
  const weekday = weekdayCodeForDateKey(targetDate);
  const businessDay = Boolean(weekday && cfg.days.includes(weekday));
  const targetScheduled = cfg.cadence === EDITORIAL_CADENCE.DAILY ? Boolean(weekday) : businessDay;

  // Reconcile first so verified publications never occupy active capacity.
  const reconciliation = reconcileQueueRows(rows, evidenceByContentId);
  const reconciledRows = reconciliation.rows;
  const active = activeQueueSummary(reconciledRows, { activeStatuses: cfg.activeStatuses });
  const todayRows = reconciledRows.filter((row) => (
    rowTargetDateKey(row) === targetDate && token(row?.queue_status) !== 'SKIPPED'
  ));

  let action = DAILY_DECISION.NO_ACTION;
  let reason;
  if (!runDate || !targetDate) reason = DAILY_DECISION_REASON.INVALID_DATE;
  else if (!cfg.enabled) reason = DAILY_DECISION_REASON.DISABLED;
  else if (!targetScheduled) reason = DAILY_DECISION_REASON.CLOSED_DAY;
  else if (todayRows.length) reason = DAILY_DECISION_REASON.ALREADY_SCHEDULED_TODAY;
  else if (active.count >= cfg.maxActive || cfg.maxNewTopics < 1) reason = DAILY_DECISION_REASON.ACTIVE_CAP_REACHED;
  else {
    action = DAILY_DECISION.CREATE_NEW;
    reason = DAILY_DECISION_REASON.CAPACITY_AVAILABLE;
  }

  return {
    run_date: runDate,
    target_date: targetDate,
    lead_days: cfg.leadDays,
    cadence: cfg.cadence,
    weekday,
    business_day: businessDay,
    target_scheduled: targetScheduled,
    decision: {
      action,
      reason,
      new_topics_allowed: action === DAILY_DECISION.CREATE_NEW ? Math.min(cfg.maxNewTopics, cfg.maxActive - active.count) : 0,
      today_content_ids: todayRows.map((row) => String(row.content_id || row.queue_id || '').trim()).filter(Boolean)
    },
    active: { ...active, cap: cfg.maxActive },
    reconciliation: {
      patches: reconciliation.patches,
      pending_deploy_verification: reconciliation.pending
    },
    existing_work: existingWorkFor(reconciledRows),
    required_end_states: action === DAILY_DECISION.CREATE_NEW
      ? ['REVIEW_READY', 'INTERVIEW_WAITING', 'ERROR_BLOCKED']
      : ['NO_ACTION'],
    invariants: {
      review_ready_blocks_creation: false,
      notification_failure_blocks_creation: false,
      auto_publish: false,
      human_publish_required: true
    }
  };
}

// Watchdog: after the creation window, a business day that was planned as
// CREATE_NEW but still has no row for today is a silent stop.
export function detectMissedDailyCreation({ plan, rows = [] } = {}) {
  if (plan?.decision?.action !== DAILY_DECISION.CREATE_NEW) return { missed: false };
  const created = rows.some((row) => rowTargetDateKey(row) === plan.target_date && token(row?.queue_status) !== 'SKIPPED');
  return created
    ? { missed: false }
    : { missed: true, run_date: plan.run_date, target_date: plan.target_date, state: 'ERROR_BLOCKED', reason: 'DAILY_CREATION_NOT_STARTED' };
}
