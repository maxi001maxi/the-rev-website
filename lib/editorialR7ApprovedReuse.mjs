// Narrow, immutable 2026-10-15 R7 owner-approved source re-use exception.
// It only removes the *same background* blocker. All other independent QC,
// source grounding, typography, human-only, live-asset and Publish gates stay on.
// Never treat a QA PASS alone as a blanket exception.
const SLUG='personal-gym-first-session-pain-health-history';
const VERSION='reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline';
const SOURCE='ca64249d26efba5cf664c955ce7e00e9280e72c29bfb148e74ba59296e408662';
const SCENE='f4626ed4af71a51e6c358482c151225edfc49d419b3c25cfa20f18d0e0f513b1';
const THUMB='ed41051a375fb46c780d640698fb5a36392d3e70be65bbc4302b2015cef70670';
const OGP='e5a29df585189a77ef25af812d256ae55cf870b3b9d55b45d85e74183a928c7b';
const GBP='b9663c392be7e849c35e2321479d6cbaae3c8050204983b4d3c3ad5888407505';
const DRIVE='1JvOA5-mmAV8atXtB_8p0hqwSKZOZeDYM';
const equal=(a,b)=>String(a??'')===b;
export function r7OwnerApprovedDistinctSceneReuse(draft={},qa={}){
 const reuse=qa.contextual_verified_facility_source_reuse||{};
 const grounding=qa.scene_grounding||{};
 const hash=grounding.asset_hashes||{};
 const observed=grounding.observation?.scene_fingerprint||{};
 const recent=Array.isArray(grounding.recent)?grounding.recent:[];
 const prior=recent.find(x=>x.slug==='the-rev-trial-three-menus-first-visit');
 const past=prior?.scene_fingerprint||{};
 const realDifferentScene=Boolean(prior) &&
    observed.article_intent==='health_before_start' &&
    observed.visual_role==='considering_health_report' &&
    observed.human_action==='prepare' &&
    observed.composition_type==='medium_seated_portrait' &&
    past.article_intent!==observed.article_intent &&
    past.visual_role!==observed.visual_role &&
    past.human_action!==observed.human_action;
 return equal(draft.slug,SLUG)&&equal(draft.image_asset_version,VERSION)&&
  equal(qa.asset_version,VERSION)&&qa.pass===true&&
  reuse.allowed===true&&reuse.policy==='authentic-real-reception-unique-health-action-qc-only-v1'&&
  reuse.source_repeated===true&&reuse.scene_repeated===false&&
  Array.isArray(reuse.errors)&&reuse.errors.length===0&&
  grounding.pass===true&&Array.isArray(grounding.errors)&&grounding.errors.length===0&&
  equal(grounding.inventory?.source_sha256,SOURCE)&&
  equal(grounding.asset_version,VERSION)&&
  equal(hash.source,SOURCE)&&equal(hash.scene,SCENE)&&
  equal(hash.thumbnail,THUMB)&&equal(hash.og,OGP)&&equal(hash.gbp,GBP)&&
  equal(prior?.driveFileId,DRIVE)&&
  equal(qa.background_source_drive_file_id,DRIVE)&&
  realDifferentScene&&qa.same_image_as_recent_articles===false&&
  qa.same_background_as_recent_articles===true&&
  qa.recent_similarity_check_pass===true&&qa.recent_similarity_window>=4&&
  qa.manual_visual_rejection===false&&qa.image_generation_used===true&&
  qa.scene_plausible_at_the_rev===true&&qa.source_material_scope_pass===true&&
  qa.trainer_present===false&&qa.unknown_trainer_present===false&&
  qa.non_customer_people_present===false&&qa.generated_customer_count===1&&
  qa.gbp_safe_area_pass===true&&qa.visual_art_direction?.pass===true&&
  qa.thumbnail_typography_acceptance?.pass===true;
}
