import fs from 'node:fs';

const CONTRACT_PATH = new URL('../editorial/daily-editorial-state-contract.json', import.meta.url);
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(contract.schema_version === '1.0.0', 'Unexpected Daily Editorial state contract schema.');
assert(contract.source_of_truth?.gas_supervisor_version === 'v0.6.5.2', 'GAS Supervisor contract version drifted.');

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

console.log('Daily Editorial state contract: PASS');
