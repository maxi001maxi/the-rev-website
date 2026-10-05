import fs from 'node:fs';
import {
  ACTIVE_QUEUE_STATUSES,
  TERMINAL_QUEUE_STATUSES
} from '../lib/editorialPublication.mjs';
import { planDailyEditorial } from '../lib/dailyEditorialStateMachine.mjs';
import { planDailyCreation } from '../lib/dailyEditorialCreator.mjs';
import { gasBundleIsCurrent } from './build-gas-bundle.mjs';
import { AUTO_PUBLISH_ENV, AUTO_PUBLISH_EXECUTOR_INSTALLED, autoPublishGate } from '../lib/editorialAutoPublishGate.mjs';

const CONTRACT_PATH = new URL('../editorial/daily-editorial-state-contract.json', import.meta.url);
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(contract.schema_version === '1.7.0', 'Unexpected Daily Editorial state contract schema.');
assert(contract.source_of_truth?.gas_supervisor_version === 'v0.6.5.2', 'GAS Supervisor contract version drifted.');
assert(contract.source_of_truth?.gbp_sheet === '22_GBP_POST', '22_GBP_POST must be a named Source of Truth.');
assert(contract.source_of_truth?.image_operator_primary_adapter === 'editorial/gas/DailyEditorialImageOperatorStatus_v0.7.2.gs', 'Image Operator Primary adapter must be versioned in the contract.');
const operatorPrimary = contract.image_operator_primary || {};
assert(operatorPrimary.asset_version_must_match === true, 'Operator state must match the current asset version.');
assert(operatorPrimary.queue_status_while_blocked === 'IMAGE_PREPARING', 'Blocked Image Operator state must remain pollable by Primary.');
assert(operatorPrimary.blocked_mapping?.BLOCKED_PROVIDER_CREDITS?.image_status === 'BLOCKED', 'Provider credit blocker must surface as image_status=BLOCKED.');
assert(operatorPrimary.blocked_mapping?.BLOCKED_PROVIDER_CREDITS?.consume_generation_attempt === false, 'Provider credit blocker must not consume generation attempts.');
assert(operatorPrimary.failed_statuses?.includes('BLOCKED_MAX_ATTEMPTS') && operatorPrimary.failed_statuses?.includes('ERROR'), 'Terminal operator failures must be named explicitly.');
assert(operatorPrimary.publish_boundary_unchanged === true, 'Image Operator status propagation must not change the publish boundary.');

const noInterview = contract.new_queue_no_interview || {};
assert(noInterview.queue_status === 'DRAFTING', 'No-interview queue must start in DRAFTING.');
assert(noInterview.knowledge_gate === 'SUFFICIENT', 'No-interview queue must require SUFFICIENT knowledge.');
assert(noInterview.interview_required === false, 'No-interview queue must set interview_required=false.');
assert(noInterview.interview_status === 'NOT_REQUIRED', 'No-interview queue must set interview_status=NOT_REQUIRED.');
assert(noInterview.draft_status === 'NOT_STARTED', 'No-interview draft_status must be NOT_STARTED for GAS v0.6.5.2 compatibility.');
assert(noInterview.image_status === 'NOT_STARTED', 'No-interview image_status must start at NOT_STARTED.');
assert(Array.isArray(noInterview.forbidden_draft_statuses) && noInterview.forbidden_draft_statuses.includes('PENDING'), 'PENDING must remain explicitly forbidden.');

const handoffs = new Map((contract.handoffs || []).map((x) => [x.name, x]));
const draftToImage = handoffs.get('draft_to_image');
assert(draftToImage, 'draft_to_image handoff missing.');
assert(draftToImage.from_queue_status === 'DRAFTING', 'draft_to_image must originate from DRAFTING.');
assert(draftToImage.required_before_handoff?.draft_status === 'READY', 'draft_to_image requires draft_status=READY.');
assert(draftToImage.to_queue_status === 'IMAGE_PREPARING', 'Image job creation must advance Queue to IMAGE_PREPARING.');
assert(draftToImage.to_image_status === 'PREPARING', 'Image job creation must set image_status=PREPARING.');
assert(draftToImage.to_web_bridge_status === 'IMAGE_PREPARING', 'Image job creation must set web_bridge_status=IMAGE_PREPARING.');

const imageToReview = handoffs.get('image_to_review');
assert(imageToReview, 'image_to_review handoff missing.');
assert(imageToReview.from_queue_status === 'IMAGE_PREPARING', 'image_to_review must originate from IMAGE_PREPARING.');
assert(imageToReview.required_before_handoff?.gbp_post_row_exists === true, 'Review handoff requires a real 22_GBP_POST row.');
assert(imageToReview.required_before_handoff?.gbp_parent_blog_id_matches === true, 'GBP row must match the parent Blog content_id.');
assert(imageToReview.required_before_handoff?.image_status === 'READY', 'Review handoff requires image_status=READY.');
assert(imageToReview.required_before_handoff?.gbp_image_status === 'READY', 'Review handoff requires GBP 4:3 READY.');
assert(imageToReview.to_queue_status === 'REVIEW_READY', 'Ready images must advance Queue to REVIEW_READY.');
assert(imageToReview.to_web_bridge_status === 'PREVIEW_READY', 'Review Ready requires PREVIEW_READY bridge status.');
assert(imageToReview.review_url_required === true, 'Review Ready must require a review URL.');

const completion = contract.completion || {};
assert(completion.silent_stop_forbidden === true, 'Silent stop must be forbidden.');
assert(completion.success_requires_notification_evidence === true, 'Success must require notification evidence.');

const forbiddenSuccess = new Set(completion.intermediate_states_never_success || []);
for (const state of ['DRAFTING', 'QC', 'IMAGE_PREPARING', 'NOT_SYNCED']) {
  assert(forbiddenSuccess.has(state), `${state} must never be accepted as a successful Daily Editorial terminal state.`);
}

const allowed = new Map((completion.allowed_end_states || []).map((x) => [x.state, x]));
for (const state of ['REVIEW_READY', 'INTERVIEW_WAITING', 'ERROR_BLOCKED', 'NO_ACTION']) {
  const entry = allowed.get(state);
  assert(entry, `${state} completion contract missing.`);
  assert(entry.notification_required === true, `${state} must require user notification.`);
  assert(String(entry.notification_type || '').trim(), `${state} must define notification_type.`);
}

assert(contract.resume?.enabled === true, 'Resume/self-heal must stay enabled.');
assert(Number(contract.resume?.stuck_timeout_minutes) === 10, 'Stuck timeout must remain 10 minutes.');
for (const field of ['last_successful_stage', 'next_stage', 'human_action_required']) {
  assert((contract.resume?.required_fields_on_stop || []).includes(field), `Resume tracking field missing: ${field}`);
}

assert(contract.publish_boundary?.auto_publish === false, 'Auto Publish must remain disabled.');
assert(contract.publish_boundary?.human_approval_required === true, 'Human approval must remain required.');

// Daily creation gate: ACTIVE is a cap, never an exclusive lock.
const creation = contract.daily_creation || {};
assert(Number(creation.max_active_queue) === 5, 'Active queue cap must remain 5.');
assert(Number(creation.prepare_lead_days) === 1, 'Each daily run must prepare the next day by default.');
assert(creation.cadence_default === 'BUSINESS_DAYS' && creation.cadence_values.includes('DAILY') && creation.cadence_applies_to === 'TARGET_DATE', 'Cadence must be switchable and judged on the target day.');
{
  const lead = planDailyEditorial({ rows: [], now: new Date('2026-10-02T05:00:00+09:00') });
  assert(lead.lead_days === creation.prepare_lead_days && lead.run_date === '2026-10-02' && lead.target_date === '2026-10-03' && lead.cadence === creation.cadence_default, 'Engine defaults drifted from the contract.');
  const dailyPlan = planDailyEditorial({ rows: [], now: new Date('2026-10-01T05:00:00+09:00'), settings: { [creation.cadence_setting]: 'DAILY' } });
  assert(dailyPlan.decision.action === 'CREATE_NEW', 'cadence=DAILY must schedule shop closed days.');
}
{
  const boundary = contract.publish_boundary;
  assert(boundary.both_keys_required === true && boundary.executor_installed === AUTO_PUBLISH_EXECUTOR_INSTALLED && boundary.auto_publish_env === AUTO_PUBLISH_ENV, 'Auto-publish gate drifted from the contract.');
  assert(autoPublishGate({ env: {}, settings: {} }).allowed === false, 'Auto publish must be off by default.');
  assert(autoPublishGate({ env: { AUTO_PUBLISH_ENABLED: 'true' }, settings: { auto_publish: true } }).allowed === false, 'Auto publish must stay off while no executor is installed.');
  assert(String(contract.post_publish_reconciliation?.post_history || '').startsWith('NOT_WRITTEN'), 'Blog must not be written into the Instagram Post History.');
}
assert(JSON.stringify(contract.flow) === JSON.stringify(['EVERY_DAY_FIXED_TIME', 'THREE_REASONED_TOPICS', 'OWNER_TOPIC_CHOICE', 'OPTIONAL_FIRST_PARTY_INTERVIEW', 'PREPARE_NEXT_DAY_ARTICLE', 'DRAFT', 'QC', 'GBP', 'IMAGES', 'REVIEW_READY', 'HUMAN_PUBLISH', 'POST_PUBLISH_STATE_AUTO_SYNC']), 'Daily Editorial flow drifted.');
assert(Number(creation.max_new_topics_per_run) === 1, 'Daily creation must stay at max 1 new topic per run.');
assert(creation.active_is_exclusive_lock === false, 'ACTIVE statuses must count toward the cap, not lock creation.');
assert(creation.review_ready_blocks_creation === false, 'REVIEW_READY must never block the next business day article.');
assert(creation.existing_work_is_parallel === true, 'Existing Review/Image work must run in parallel with today creation.');
assert(creation.notification_failure_blocks_creation === false, 'Notification failure must not stop content creation.');
assert(creation.reconcile_before_active_count === true, 'Publish reconciliation must run before counting active rows.');
assert(creation.missed_creation_end_state === 'ERROR_BLOCKED', 'A missed business-day creation must surface as ERROR_BLOCKED.');
assert(
  JSON.stringify([...creation.active_statuses_count_toward_cap].sort()) === JSON.stringify([...ACTIVE_QUEUE_STATUSES].sort()),
  'Contract active statuses drifted from lib/editorialPublication.mjs ACTIVE_QUEUE_STATUSES.'
);
for (const terminal of TERMINAL_QUEUE_STATUSES) {
  assert(!creation.active_statuses_count_toward_cap.includes(terminal), `${terminal} must never count as active.`);
}

// Publish reconciliation: PUBLISHED only with verified production evidence.
const reconciliation = contract.publish_reconciliation || {};
assert(reconciliation.to_queue_status === 'PUBLISHED' && reconciliation.to_web_bridge_status === 'PUBLISHED', 'Verified publication must reconcile Queue and Bridge to PUBLISHED.');
assert(reconciliation.required_evidence?.supabase_publish_status === 'PUBLISHED', 'Reconciliation requires Supabase PUBLISHED.');
assert(reconciliation.required_evidence?.publish_verified_at_required === true, 'Reconciliation requires publish_verified_at.');
assert((reconciliation.insufficient_evidence || []).includes('PUBLISH_COMMITTED'), 'PUBLISH_COMMITTED must never be treated as PUBLISHED.');
assert(reconciliation.gbp_auto_post === false, 'Reconciliation must never post to GBP.');

// Execute the contract scenarios against the real decision engine, so the
// contract cannot pass while the implementation disagrees with it.
for (const scenario of contract.regression_scenarios || []) {
  const fixture = JSON.parse(fs.readFileSync(new URL(`../${scenario.fixture}`, import.meta.url), 'utf8'));
  if (scenario.kind === 'creation') {
    const shortlist = JSON.parse(fs.readFileSync(new URL(`../${scenario.shortlist_fixture}`, import.meta.url), 'utf8'));
    const out = planDailyCreation({
      rows: fixture.rows,
      shortlist: shortlist.rows,
      now: new Date(scenario.now),
      evidenceByContentId: scenario.evidence || {}
    });
    const e = scenario.expect;
    assert(out.plan.decision.action === e.action, `${scenario.name}: expected ${e.action}, got ${out.plan.decision.action}`);
    assert(out.creation.status === e.creation_status, `${scenario.name}: expected ${e.creation_status}, got ${out.creation.status}`);
    assert(out.creation.candidate_id === e.candidate_id, `${scenario.name}: expected candidate ${e.candidate_id}, got ${out.creation.candidate_id}`);
    assert(out.creation.queue_row?.queue_status === e.queue_status, `${scenario.name}: created row must be ${e.queue_status}`);
    continue;
  }
  const plan = planDailyEditorial({
    rows: fixture.rows,
    now: new Date(scenario.now),
    evidenceByContentId: scenario.evidence || {}
  });
  const expect = scenario.expect || {};
  assert(plan.decision.action === expect.action, `${scenario.name}: expected ${expect.action}, got ${plan.decision.action}/${plan.decision.reason}`);
  if (expect.reason) assert(plan.decision.reason === expect.reason, `${scenario.name}: expected reason ${expect.reason}, got ${plan.decision.reason}`);
  if (expect.active != null) assert(plan.active.count === expect.active, `${scenario.name}: expected active ${expect.active}, got ${plan.active.count}`);
  if (expect.patches != null) assert(plan.reconciliation.patches.length === expect.patches, `${scenario.name}: expected ${expect.patches} reconcile patches`);
}
assert((contract.regression_scenarios || []).length >= 4, 'Daily Editorial regression scenarios missing.');

// Creator: the Gate decision must be executed by code, not by an external prompt.
const creator = contract.daily_creator || {};
assert(creator.decision_authority === 'GATE_ONLY', 'Creator must take its decision from the Gate only.');
assert(creator.external_operator_may_decide === false, 'An external operator (ChatGPT task) must not make its own create/skip decision.');
assert(creator.creates_queue_row?.queue_status === 'DRAFTING' && creator.creates_queue_row?.draft_status === 'NOT_STARTED', 'Creator must create the no-interview DRAFTING/NOT_STARTED contract row.');
assert((creator.not_success || []).includes('CREATE_NEW_recorded_only') && (creator.not_success || []).includes('watchdog_failure_notice'), 'Recording CREATE_NEW or alerting must never count as success.');
assert((creator.success_requires || []).includes('queue_row_read_back_from_sheet'), 'Creator success requires a Queue read-back.');
assert((creator.fail_closed_when || []).includes('supervisor_not_wired'), 'Creator must fail closed when the Supervisor is not wired.');
for (const key of ['executable', 'selection_engine', 'knowledge_registry']) {
  assert(fs.existsSync(new URL(`../${creator[key]}`, import.meta.url)), `Creator ${key} must exist in this repository.`);
}
assert(fs.existsSync(new URL(`../${contract.source_of_truth.gas_gate_source}`, import.meta.url)), 'GAS gate source must be versioned in this repository.');
assert(fs.existsSync(new URL('../editorial/gas/DailyEditorialAutonomy_v0.6.9_ONE_PASTE.gs', import.meta.url)), 'One-paste GAS install bundle must be versioned in this repository.');
assert(gasBundleIsCurrent(), 'One-paste GAS bundle is stale. Run: npm run build:gas-bundle');
const gasGateSource = fs.readFileSync(new URL(`../${contract.source_of_truth.gas_gate_source}`, import.meta.url), 'utf8');
assert(gasGateSource.includes("V069_STATUS_ORIGIN = 'https://the-rev-website.vercel.app'"), 'GAS gate must pin Editorial status polling to the stable production alias.');
assert(gasGateSource.includes("setProperty('EDITORIAL_STATUS_BASE_URL', V069_STATUS_ORIGIN)"), 'GAS installer must repair the legacy v0.6.8 status base property.');

console.log('Daily Editorial state contract: PASS');

assert(contract.topic_approval.selection_required_before_draft && contract.topic_approval.candidate_count === 3 && contract.topic_approval.reply_resumes_all_target_dates && !contract.topic_approval.human_wait_is_error, 'Topic choice must be a separate human gate with late resume.');
