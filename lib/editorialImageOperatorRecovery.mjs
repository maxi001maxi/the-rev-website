import { SCENE_PLAUSIBILITY_VERSION, scenePlausibilityPass } from './editorialScenePlausibility.mjs';
import { typographyAcceptancePass } from './editorialThumbnailTypography.mjs';

// Retry routing only: this never changes QA or makes an image acceptable.
export function retainSceneForOverlay(qa, job = {}) {
  if (!qa || typographyAcceptancePass(qa)) return false;
  const contextual = qa.scene_plausibility_version === SCENE_PLAUSIBILITY_VERSION;
  if (contextual && !scenePlausibilityPass(qa)) return false;
  const scores = ['photo_treatment', 'article_visual_relevance', 'main_claim_visualization',
    'rev_environment_consistency', 'brand_space_authenticity', 'human_environment_integration',
    'perspective_scale_consistency', 'ground_contact_shadow_consistency',
    'lighting_consistency', 'anatomy_pose_realism'];
  const trueFlags = ['article_theme_inferable_without_title', 'scene_action_has_article_specific_meaning',
    'no_cutout_or_sticker_look', 'location_semantics_pass', 'exercise_pose_plausible',
    'customer_only_or_no_people', 'generated_customer_present', 'real_the_rev_background_confirmed'];
  const falseFlags = ['generic_passive_pose_without_article_reason', 'trainer_present',
    'unknown_trainer_present', 'non_customer_people_present', 'facility_only_thumbnail'];
  if (scores.filter(k=>!contextual || k!=='main_claim_visualization').some((key) => !(Number(qa[key]) >= 8)) ||
      trueFlags.filter(k=>!contextual || k!=='article_theme_inferable_without_title').some((key) => qa[key] !== true) ||
      falseFlags.some((key) => qa[key] !== false) || Number(qa.generated_customer_count) !== 1) return false;
  if (job.layout_variant === 'human-first-v1' && (
    !(Number(qa.human_subject_prominence) >= 8) ||
    !(Number(qa.human_visual_attention_share) >= 58 && Number(qa.human_visual_attention_share) <= 75) ||
    ['face_expression_readable', 'background_secondary_pass', 'background_soft_blur_pass',
      'the_rev_anchor_visible', 'customer_presentation_matches_plan'].some((key) => qa[key] !== true)
  )) return false;
  return true;
}

export function operatorStateMatchesAsset(state, job, jobPath) {
  const version = String(state?.asset_version || state?.last_qa?.asset_version || '').trim();
  if (version) return version === String(job.asset_version || '').trim();
  // Legacy errors omitted asset_version. Keep their bounded budget when the
  // persisted job path matches rather than silently starting from zero.
  return Boolean(state?.job_path && state.job_path === jobPath &&
    ['ERROR', 'BLOCKED_MAX_ATTEMPTS', 'BLOCKED_PROVIDER_CREDITS'].includes(state.status));
}


export const IMAGE_OPERATOR_PRIMARY_STATE = Object.freeze({
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
  RUNNING: 'RUNNING',
  READY: 'READY',
  UNKNOWN: 'UNKNOWN'
});

// Translate the GitHub image operator's durable state into the much smaller
// contract the Primary Editorial Supervisor needs. This never retries or
// changes Visual QC; it only reports what already happened.
export function classifyImageOperatorState(state = {}) {
  const status = String(state?.status || '').trim().toUpperCase();
  const attempts = Number.isFinite(Number(state?.attempts_total)) ? Number(state.attempts_total) : null;
  const maxAttempts = Number.isFinite(Number(state?.max_attempts)) ? Number(state.max_attempts) : null;
  const lastError = String(state?.last_error || '').trim();

  if (!status) {
    return {
      state: IMAGE_OPERATOR_PRIMARY_STATE.UNKNOWN,
      blocking: false,
      status: '',
      code: null,
      attempts_total: attempts,
      max_attempts: maxAttempts,
      last_error: lastError,
      human_action_required: 'NONE',
      automatic_retry_allowed: true
    };
  }

  if (status === 'READY_CANDIDATE') {
    return {
      state: IMAGE_OPERATOR_PRIMARY_STATE.READY,
      blocking: false,
      status,
      code: null,
      attempts_total: attempts,
      max_attempts: maxAttempts,
      last_error: lastError,
      human_action_required: 'NONE',
      automatic_retry_allowed: false
    };
  }

  if (status === 'BLOCKED_PROVIDER_CREDITS') {
    return {
      state: IMAGE_OPERATOR_PRIMARY_STATE.BLOCKED,
      blocking: true,
      status,
      code: 'PROVIDER_CREDITS',
      attempts_total: attempts,
      max_attempts: maxAttempts,
      last_error: lastError,
      human_action_required: 'RESTORE_PROVIDER_CREDITS',
      automatic_retry_allowed: false
    };
  }

  if (['BLOCKED_MAX_ATTEMPTS', 'OVERLAY_QC_REJECTED', 'ERROR'].includes(status)) {
    return {
      state: IMAGE_OPERATOR_PRIMARY_STATE.FAILED,
      blocking: true,
      status,
      code:
        status === 'BLOCKED_MAX_ATTEMPTS' ? 'MAX_ATTEMPTS_EXHAUSTED' :
        status === 'OVERLAY_QC_REJECTED' ? 'OVERLAY_QC_REJECTED' :
        'IMAGE_OPERATOR_ERROR',
      attempts_total: attempts,
      max_attempts: maxAttempts,
      last_error: lastError,
      human_action_required: 'REVIEW_IMAGE_OPERATOR',
      automatic_retry_allowed: false
    };
  }

  return {
    state: IMAGE_OPERATOR_PRIMARY_STATE.RUNNING,
    blocking: false,
    status,
    code: null,
    attempts_total: attempts,
    max_attempts: maxAttempts,
    last_error: lastError,
    human_action_required: 'NONE',
    automatic_retry_allowed: true
  };
}
