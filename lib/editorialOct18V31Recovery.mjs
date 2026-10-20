import {createHash} from 'node:crypto';
import {editorialShootingContract} from './editorialShootingContract.mjs';
import {evaluateSceneGrounding} from './editorialSceneGrounding.mjs';

export const OCT18_R8='reference-v31-lobby-contract-review-20261018-r8';
const SLUG='personal-gym-trial-three-checks';
const CONTENT='BLOG-20261018-082d82';
const SOURCE='37fd69c2b1698cb4f367b718981bceaa3824bfcb86b592f7e14098e34d654ae0';
const sha=x=>createHash('sha256').update(x).digest('hex');
export const briefDigest=b=>sha(JSON.stringify(b));
export function recoveryJobDigest(job) {
  const copy=structuredClone(job);
  delete copy.v31.owner_approval;delete copy.v31.owner_spend_approval;
  // Runtime re-derives these exclusively from the hash-verified registry/plan.
  // Exclude them so a checkpoint can resume with the same approved contract.
  delete copy.source_scene_inventory;delete copy.scene_grounding_version;delete copy.scene_intent;
  return sha(JSON.stringify(copy));
}
function approvalMatches(a={}) {
  return a.status==='APPROVED' && a.approved_by==='OWNER' && Number.isFinite(Date.parse(a.approved_at)) &&
    a.content_id===CONTENT && a.asset_version===OCT18_R8 && a.source_sha256===SOURCE &&
    a.scope==='SINGLE_GENERATION_AND_PRIVATE_QC' && a.source_reuse===true &&
    a.max_generation_calls===1 && a.max_qc_calls===2 && a.automatic_retry===false &&
    /^[a-f0-9]{64}$/.test(a.job_sha256||'') && /^[a-f0-9]{64}$/.test(a.brief_sha256||'');
}
export function oct18V31BriefPreflight(job,brief,{requireApproval=false}={}) {
  const errors=[];const check=(ok,e)=>{if(!ok)errors.push(e);};
  if(!job?.v31?.recovery_proposal)return {pass:true,applies:false,errors};
  check(job.slug===SLUG && job.asset_version===OCT18_R8 && brief?.content_id===CONTENT && brief?.asset_version===OCT18_R8,'R8_SCOPE_MISMATCH');
  let shot;try{shot=editorialShootingContract(brief);}catch{errors.push('R8_SHOT_CONTRACT_MISSING');}
  check(brief?.schema==='the-rev-image-v31-recovery-brief-v1','R8_BRIEF_SCHEMA_MISMATCH');
  check(brief?.source?.sha256===SOURCE && job.scene_plan?.source_sha256===SOURCE && job.automation?.source_repo_path===brief?.source?.path,'R8_SOURCE_MISMATCH');
  check(shot?.subject_action===job.visible_action && shot?.subject_action===job.scene_plan?.article_specific_directive && /down/i.test(shot?.eyeline||'') && /sheet/i.test(shot?.eyeline||''),'R8_ACTION_NOT_CONNECTED');
  check(['face_box','hands_box','paper_box'].every(k=>Array.isArray(shot?.[k]) && shot[k].length===4 && shot[k].every(n=>Number.isFinite(n)&&n>=0&&n<=1) && shot[k][0]<shot[k][2] && shot[k][1]<shot[k][3]),'R8_CROP_PLAN_MISSING');
  check(shot?.text_lines?.join('\n')===job.image_headline_short,'R8_COPY_MISMATCH');
  check(job.design_revision==='editorial-thumbnail-v2.6-human-first' && job.layout_variant==='human-first-v1' && ['thumbnail','og','gbp'].every(k=>job.scene_object_position?.[k]==='center'),'R8_CANONICAL_LAYOUT_MISMATCH');
  check(job.max_generation_attempts===1 && job.v31.max_qc_calls===2 && job.v31.source_guided_edit===true && brief?.spend_policy?.provider==='OpenAI' && brief?.spend_policy?.max_generation_calls===1 && brief?.spend_policy?.max_qc_calls===2 && brief?.spend_policy?.automatic_retry===false,'R8_SPEND_LIMIT_MISMATCH');
  check(job.publish_requires_human_approval===true && ['main_merge','production_staging','supabase_mutation','article_publish','gbp_post'].every(k=>brief?.publication?.[k]===false),'R8_PUBLICATION_BOUNDARY_CHANGED');
  if(requireApproval) {
    const a=job.v31.owner_approval;
    check(job.v31.owner_spend_approval==='APPROVED' && approvalMatches(a) && a.job_sha256===recoveryJobDigest(job) && a.brief_sha256===briefDigest(brief),'OWNER_SPEND_APPROVAL_REQUIRED');
  }
  return {pass:errors.length===0,applies:true,errors};
}

// Only repeated source provenance is permitted. Actual scene grounding,
// semantic novelty, pixels, R7 comparison and all visual thresholds still apply.
export function oct18V31SourceReuse(job={},grounding={}) {
  const a=job.v31?.owner_approval||{},f=grounding.observation?.scene_fingerprint||{};
  return job.slug===SLUG && job.asset_version===OCT18_R8 && approvalMatches(a) &&
    grounding.asset_version===OCT18_R8 && grounding.asset_hashes?.source===SOURCE &&
    grounding.inventory?.source_sha256===SOURCE && grounding.pass===true &&
    evaluateSceneGrounding(grounding).pass===true && grounding.similarity?.pass===true &&
    grounding.similarity?.unknown_count===0 && Array.isArray(grounding.recent) && grounding.recent.length>=12 &&
    f.location_type==='reception' && f.human_action==='review_paper' &&
    f.visual_role==='deciding_own_start' && f.article_intent==='training_start' &&
    f.composition_type==='medium_three_quarter_portrait' &&
    grounding.recent.slice(0,4).every(r=>{
      const prior=r.scene_fingerprint||{};
      return ['human_action','visual_role','article_intent','composition_type'].some(k=>prior[k]!==f[k]);
    });
}
export function oct18V31QaReuse(draft={},qa={}) {
  const a=qa.oct18_v31_source_reuse_approval;
  return qa.pass===true && qa.manual_visual_rejection===false && qa.generated_customer_count===1 &&
    qa.editorial_image_revision==='3.1' && qa.background_reuse_relevance_exception===true &&
    (draft.image_asset_version||qa.asset_version)===OCT18_R8 &&
    oct18V31SourceReuse({slug:draft.slug||qa.slug,asset_version:qa.asset_version,v31:{owner_approval:a}},qa.scene_grounding) &&
    ['human_environment_integration','perspective_scale_consistency','ground_contact_shadow_consistency','lighting_consistency','anatomy_pose_realism'].every(k=>Number(qa[k])>=9);
}
