// Durable negative decisions live outside mutable model QA. Never erase history.
import { rejectedEditorialAssets } from '../editorial/image-review/rejected-assets.mjs';

export const REALISM_FIELDS = ['human_environment_integration','perspective_scale_consistency',
  'ground_contact_shadow_consistency','lighting_consistency','anatomy_pose_realism'];

export function imageAcceptanceIssues(draft = {}, qa = {}) {
  draft ||= {}; qa ||= {};
  const issues = [];
  const versions = [draft.image_asset_version, draft.asset_version, qa.asset_version].filter(Boolean);
  const hashes = Object.entries(qa.scene_grounding?.asset_hashes || {}).filter(([k])=>k!=='source').map(([,v])=>v);
  for (const v of Object.values(qa.thumbnail_typography_acceptance?.deterministic?.variants || {})) {
    if (v.asset_sha256) hashes.push(v.asset_sha256);
  }
  if (rejectedEditorialAssets.some(r => versions.includes(r.asset_version) || r.sha256.some(h => hashes.includes(h)))) {
    issues.push('OWNER_REJECTED_ASSET: 不採用履歴のある画像です。別版の制作と独立QCが必要です。');
  }
  if (draft.image_asset_version && qa.asset_version && draft.image_asset_version !== qa.asset_version) {
    issues.push('QA_ASSET_VERSION_MISMATCH: 画像とQCの版が一致しません。');
  }
  if (qa.editorial_image_revision === '3.1') {
    if (REALISM_FIELDS.some(k => !(Number(qa[k]) >= 9))) issues.push('REALISM_BELOW_NINE');
    if (qa.scene_action_has_article_specific_meaning !== true || qa.generic_passive_pose_without_article_reason !== false) issues.push('ARTICLE_ACTION_NOT_VERIFIED');
    if (qa.scene_grounding?.pass !== true) issues.push('INDEPENDENT_GROUNDING_NOT_VERIFIED');
  }
  if(versions.includes('reference-v31-evolgear-terms-foreground-20261018-r9')) {
    const lock=qa.source_pixel_lock,g=qa.scene_grounding;
    if(!lock||lock.changed_protected_pixels!==0||!(lock.protected_pixels>=1024*1536*.75)||lock.source_fit!=='uniform_cover'||lock.optical_blur_px!==.8||lock.source_sha256!=='437836aedf2116c7f051276d30aefb73e295f5f4481c8aa0c3b165f57d52f8ea'||lock.source_sha256!==g?.asset_hashes?.source||lock.scene_sha256!==g?.asset_hashes?.scene)issues.push('R9_SOURCE_PIXEL_LOCK_NOT_VERIFIED');
  }
  return issues;
}

export function imageStopReason(draft = {}) {
  if (draft.image_qa?.manual_visual_rejection === true) return draft.image_last_error || 'OWNER_REJECTED_ASSET';
  if (['ERROR','BLOCKED'].includes(draft.image_status)) return draft.image_last_error || 'IMAGE_OPERATOR_BLOCKED';
  return imageAcceptanceIssues(draft, draft.image_qa).join(' / ') || null;
}
