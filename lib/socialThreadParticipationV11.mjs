export const THREADS_OPERATIONS_V11 = 'THREADS_OPERATIONS_V11_SHADOW';

const SOURCE_STATUS = new Set(['FRESH','STALE','UNKNOWN','NOT_CONFIGURED']);
const DAILY_MODES = new Set(['PARTICIPATION_ONLY','ORIGINAL_PLUS_PARTICIPATION','ORIGINAL_ONLY','HOLD']);
const SURFACES = new Set(['REPLY','QUOTE','REPOST']);
const DECISIONS = new Set(['SELECT','REJECT','HOLD']);

const arr = (v) => Array.isArray(v) ? v : [];
const text = (v) => String(v ?? '').trim();
const fail = (code) => { throw new Error('SOCIAL_THREADS_V11_' + code); };

export function validateThreadsOperationsV11(input = {}) {
  const version = text(input.version);
  if (version !== THREADS_OPERATIONS_V11) fail('VERSION_REQUIRED');
  if (text(input.run_mode) !== 'SHADOW') fail('SHADOW_ONLY');

  const sourceStatus = text(input.conversation_source_status);
  if (!SOURCE_STATUS.has(sourceStatus)) fail('SOURCE_STATUS_INVALID');

  const dailyMode = text(input.daily_mode);
  if (!DAILY_MODES.has(dailyMode)) fail('DAILY_MODE_INVALID');

  if (input.human_approval_required !== true) fail('HUMAN_APPROVAL_REQUIRED');
  if (input.auto_reply !== false) fail('AUTO_REPLY_FORBIDDEN');
  if (input.auto_publish !== false) fail('AUTO_PUBLISH_FORBIDDEN');

  const windows = arr(input.measurement_windows).map(Number);
  if (windows.length !== 2 || windows[0] !== 7 || windows[1] !== 30) fail('MEASUREMENT_WINDOWS_REQUIRED');
  if (input.one_post_rule_promotion === true) fail('ONE_POST_RULE_PROMOTION_FORBIDDEN');

  const seen = new Set();
  const opportunities = arr(input.participation_opportunities);
  const selected = [];

  for (const item of opportunities) {
    const key = text(item?.opportunity_key);
    if (!key) fail('OPPORTUNITY_KEY_REQUIRED');
    if (seen.has(key)) fail('OPPORTUNITY_KEY_DUPLICATE');
    seen.add(key);

    const surface = text(item?.surface);
    if (!SURFACES.has(surface)) fail('SURFACE_INVALID');

    const decision = text(item?.decision);
    if (!DECISIONS.has(decision)) fail('DECISION_INVALID');

    if (decision === 'SELECT') {
      if (sourceStatus !== 'FRESH') fail('SELECT_REQUIRES_FRESH_SOURCE');
      if (!text(item.source_ref)) fail('SOURCE_REF_REQUIRED');
      if (!text(item.source_observed_at)) fail('SOURCE_OBSERVED_AT_REQUIRED');
      if (!text(item.source_summary)) fail('SOURCE_SUMMARY_REQUIRED');
      if (!text(item.why_this_conversation)) fail('WHY_CONVERSATION_REQUIRED');
      if (!text(item.THE_REV_role)) fail('THE_REV_ROLE_REQUIRED');
      if (!text(item.draft_text)) fail('DRAFT_TEXT_REQUIRED');
      selected.push(item);
    }
  }

  const originalRequired = input.original_required === true;
  const holdReason = text(input.hold_reason);

  if (dailyMode === 'PARTICIPATION_ONLY') {
    if (!selected.length) fail('PARTICIPATION_REQUIRED');
    if (originalRequired) fail('ORIGINAL_MUST_BE_FALSE');
  }

  if (dailyMode === 'ORIGINAL_PLUS_PARTICIPATION') {
    if (!selected.length) fail('PARTICIPATION_REQUIRED');
    if (!originalRequired) fail('ORIGINAL_REQUIRED');
    if (!text(input.original_reason)) fail('ORIGINAL_REASON_REQUIRED');
  }

  if (dailyMode === 'ORIGINAL_ONLY') {
    if (selected.length) fail('ORIGINAL_ONLY_HAS_SELECTED_PARTICIPATION');
    if (!originalRequired) fail('ORIGINAL_REQUIRED');
    if (!text(input.original_reason)) fail('ORIGINAL_REASON_REQUIRED');
  }

  if (dailyMode === 'HOLD') {
    if (selected.length) fail('HOLD_HAS_SELECTED_PARTICIPATION');
    if (originalRequired) fail('HOLD_ORIGINAL_MUST_BE_FALSE');
    if (!holdReason) fail('HOLD_REASON_REQUIRED');
  }

  if (sourceStatus !== 'FRESH' && selected.length) fail('NONFRESH_SELECTION_FORBIDDEN');

  return {
    required: true,
    version: THREADS_OPERATIONS_V11,
    run_mode: 'SHADOW',
    conversation_source_status: sourceStatus,
    daily_mode: dailyMode,
    selected_participation_count: selected.length,
    original_required: originalRequired,
    human_approval_required: true,
    auto_reply: false,
    auto_publish: false,
    measurement_windows: [7, 30]
  };
}
