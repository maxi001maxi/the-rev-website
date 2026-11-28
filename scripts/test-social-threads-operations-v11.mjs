import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THREADS_OPERATIONS_V11,
  validateThreadsOperationsV11
} from '../lib/socialThreadParticipationV11.mjs';

const base = () => ({
  version: THREADS_OPERATIONS_V11,
  run_mode: 'SHADOW',
  conversation_source_status: 'FRESH',
  daily_mode: 'PARTICIPATION_ONLY',
  participation_opportunities: [{
    opportunity_key: 'reply-1',
    surface: 'REPLY',
    decision: 'SELECT',
    source_ref: 'threads:real-post-1',
    source_observed_at: '2026-10-08T08:00:00+09:00',
    source_summary: '実在する会話の要約',
    why_this_conversation: 'THE REV.の専門判断を短く足せる',
    THE_REV_role: 'PERSPECTIVE',
    draft_text: 'この考え方、かなり分かります。自分ならまず状態を見ます🤔'
  }],
  original_required: false,
  original_reason: null,
  hold_reason: null,
  measurement_windows: [7,30],
  one_post_rule_promotion: false,
  human_approval_required: true,
  auto_reply: false,
  auto_publish: false
});

test('v1.1 is shadow-only and keeps human approval', () => {
  const out = validateThreadsOperationsV11(base());
  assert.equal(out.run_mode, 'SHADOW');
  assert.equal(out.human_approval_required, true);
  assert.equal(out.auto_reply, false);
  assert.equal(out.auto_publish, false);
});

test('selected participation requires FRESH conversation source', () => {
  const x = base();
  x.conversation_source_status = 'UNKNOWN';
  assert.throws(() => validateThreadsOperationsV11(x), /SELECT_REQUIRES_FRESH_SOURCE/);
});

test('selected reply cannot exist without traceable source', () => {
  const x = base();
  delete x.participation_opportunities[0].source_ref;
  assert.throws(() => validateThreadsOperationsV11(x), /SOURCE_REF_REQUIRED/);
});

test('PARTICIPATION_ONLY cannot silently create an Original', () => {
  const x = base();
  x.original_required = true;
  assert.throws(() => validateThreadsOperationsV11(x), /ORIGINAL_MUST_BE_FALSE/);
});

test('ORIGINAL_ONLY is valid when conversation source is unavailable', () => {
  const x = base();
  x.conversation_source_status = 'NOT_CONFIGURED';
  x.daily_mode = 'ORIGINAL_ONLY';
  x.participation_opportunities = [];
  x.original_required = true;
  x.original_reason = 'v1.0 Evidence-first Original has a current Why Now';
  const out = validateThreadsOperationsV11(x);
  assert.equal(out.daily_mode, 'ORIGINAL_ONLY');
  assert.equal(out.selected_participation_count, 0);
});

test('HOLD requires a reason and zero selected participation', () => {
  const x = base();
  x.conversation_source_status = 'UNKNOWN';
  x.daily_mode = 'HOLD';
  x.participation_opportunities = [];
  x.original_required = false;
  x.hold_reason = 'Conversation source unavailable and no grounded Original reason';
  const out = validateThreadsOperationsV11(x);
  assert.equal(out.daily_mode, 'HOLD');

  const bad = {...x, hold_reason: ''};
  assert.throws(() => validateThreadsOperationsV11(bad), /HOLD_REASON_REQUIRED/);
});

test('one-post performance cannot promote a durable rule', () => {
  const x = base();
  x.one_post_rule_promotion = true;
  assert.throws(() => validateThreadsOperationsV11(x), /ONE_POST_RULE_PROMOTION_FORBIDDEN/);
});

test('7-day and 30-day learning windows are explicit', () => {
  const x = base();
  x.measurement_windows = [7];
  assert.throws(() => validateThreadsOperationsV11(x), /MEASUREMENT_WINDOWS_REQUIRED/);
});
