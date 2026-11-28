// Owner-selected real lobby view, scoped to ONE article/version. Only the
// repeated source is permitted; repeated scenes and every visual gate remain blocked.
import {evaluateSceneGrounding} from './editorialSceneGrounding.mjs';
export const ROUTE_B_VERSION='reference-v3-lobby-route-b-20261018-contract-r6';
export const ROUTE_B_SOURCE='37fd69c2b1698cb4f367b718981bceaa3824bfcb86b592f7e14098e34d654ae0';
export function routeBSourceReuse(job={},grounding={}) {
  const actual=grounding.observation?.scene_fingerprint||{};
  const evaluated=evaluateSceneGrounding({...grounding,recent:grounding.recent||[]});
  return job.slug==='personal-gym-trial-three-checks' &&
    (job.asset_version||job.image_asset_version)===ROUTE_B_VERSION &&
    grounding.asset_version===ROUTE_B_VERSION &&
    grounding.asset_hashes?.source===ROUTE_B_SOURCE &&
    grounding.inventory?.source_sha256===ROUTE_B_SOURCE &&
    grounding.pass===true && evaluated.pass===true &&
    grounding.similarity?.pass===true && grounding.similarity?.unknown_count===0 &&
    grounding.recent?.length>=12 &&
    actual.location_type==='reception' && actual.human_action==='observe_facility' &&
    actual.visual_role==='deciding_own_start' && actual.article_intent==='training_start' &&
    actual.composition_type==='medium_side_portrait' &&
    grounding.recent.slice(0,4).every(r=>{
      const f=r.scene_fingerprint||{};
      return f.visual_role!==actual.visual_role || f.human_action!==actual.human_action ||
        f.article_intent!==actual.article_intent || f.composition_type!==actual.composition_type;
    });
}
export function routeBQaReuse(draft={},qa={}) {
  return routeBSourceReuse({...draft,slug:draft.slug||qa.slug},qa.scene_grounding) && qa.owner_route_b_source_reuse===true &&
    qa.pass===true && qa.manual_visual_rejection===false && qa.generated_customer_count===1 &&
    ['human_environment_integration','perspective_scale_consistency',
      'ground_contact_shadow_consistency','lighting_consistency','anatomy_pose_realism']
      .every(k=>Number(qa[k])>=9);
}
