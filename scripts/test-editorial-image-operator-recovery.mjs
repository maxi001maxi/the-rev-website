import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retainSceneForOverlay, operatorStateMatchesAsset } from '../lib/editorialImageOperatorRecovery.mjs';

const job = { layout_variant: 'human-first-v1', asset_version: 'version-1' };
const scene = { manual_visual_rejection: true, generated_customer_count: 1,
  human_subject_prominence: 9, human_visual_attention_share: 65 };
for (const key of ['photo_treatment', 'article_visual_relevance', 'main_claim_visualization',
  'rev_environment_consistency', 'brand_space_authenticity', 'human_environment_integration',
  'perspective_scale_consistency', 'ground_contact_shadow_consistency', 'lighting_consistency',
  'anatomy_pose_realism']) scene[key] = 9;
for (const key of ['article_theme_inferable_without_title', 'scene_action_has_article_specific_meaning',
  'no_cutout_or_sticker_look', 'location_semantics_pass', 'exercise_pose_plausible',
  'customer_only_or_no_people', 'generated_customer_present', 'real_the_rev_background_confirmed',
  'face_expression_readable', 'background_secondary_pass', 'background_soft_blur_pass',
  'the_rev_anchor_visible', 'customer_presentation_matches_plan']) scene[key] = true;
for (const key of ['generic_passive_pose_without_article_reason', 'trainer_present',
  'unknown_trainer_present', 'non_customer_people_present', 'facility_only_thumbnail']) scene[key] = false;
test('scene rejection consumes the remaining bounded generation retry even with manual rejection flag', () => {
  assert.equal(retainSceneForOverlay({ ...scene, human_visual_attention_share: 45,
    background_secondary_pass: false, background_soft_blur_pass: false, main_claim_visualization: 4 }, job), false);
});
test('typography rejection preserves an otherwise accepted scene and never changes QA', () => {
  const qa = structuredClone(scene);
  assert.equal(retainSceneForOverlay(qa, job), true);
  assert.deepEqual(qa, scene);
  assert.equal(retainSceneForOverlay({ ...scene, anatomy_pose_realism: undefined }, job), false);
});
test('legacy failed QA retains its asset budget; a new asset version does not', () => {
  const state = { status: 'ERROR', attempts_total: 1, last_qa: { asset_version: 'version-1' } };
  assert.equal(operatorStateMatchesAsset(state, job, 'job.json'), true);
  assert.equal(operatorStateMatchesAsset(state, { ...job, asset_version: 'version-2' }, 'job.json'), false);
  assert.equal(operatorStateMatchesAsset({ status: 'ERROR', job_path: 'job.json' }, job, 'job.json'), true);
  assert.equal(operatorStateMatchesAsset({ status: 'READY_CANDIDATE' }, job, 'job.json'), false);
});
