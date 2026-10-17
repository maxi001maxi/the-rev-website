#!/usr/bin/env node
// IMAGE V3: zero-image-cost design contract. Only affects opted-in jobs.
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export function v3BriefPreflight(job,registry,root=process.cwd()){
  const errors=[],notes=[];
  if(job?.v3?.version!=='THE_REV_IMAGE_V3')return {pass:true,applies:false,errors,notes};
  const briefPath=String(job?.v3?.creative_brief_path||'');
  const inRoot=p=>/^(editorial|assets)\/[\w/.\-]+$/.test(String(p||''))&&!p.includes('..');
  if(!inRoot(briefPath)||!fs.existsSync(briefPath))
    return {pass:false,applies:true,errors:['V3_CREATIVE_BRIEF_MISSING'],notes};
  let b;
  try{b=JSON.parse(fs.readFileSync(briefPath,'utf8'))}catch{errors.push('V3_BRIEF_JSON_INVALID');}
  if(!b)return {pass:false,applies:true,errors,notes};
  if(b.schema!=='the-rev-image-v3-creative-brief-v1'||b.status!=='DESIGN_APPROVED_FOR_SINGLE_PRODUCTION_ATTEMPT'||b.design_completed_before_api!==true)errors.push('V3_BRIEF_NOT_APPROVED');
  if(b.content_id!=='BLOG-20261018-082d82'||job.slug!=='personal-gym-trial-three-checks')errors.push('V3_CONTENT_SCOPE_MISMATCH');
  if(b.owner_rejection?.rating_100!==30||b.owner_rejection?.do_not_reuse_rejected_scene!==true)errors.push('V3_OWNER_REJECTION_NOT_ENFORCED');
  if(!Array.isArray(b.concepts)||b.concepts.length!==3||new Set(b.concepts.map(c=>c.id)).size!==3)errors.push('V3_THREE_CONCEPTS_REQUIRED');
  const axes=['article_match','photographic_impact','real_facility_fidelity','text_crop_compatibility','distinctiveness'];
  if(!b.concepts?.every(c=>axes.every(k=>Number.isInteger(c.scores?.[k])&&c.scores[k]>=1&&c.scores[k]<=5)&&
       ['scene','emotion','camera','copy','risks','rating_note'].every(k=>String(c[k]||'').length>16)))
    errors.push('V3_CONCEPT_SCORE_OR_DETAIL_MISSING');
  const rated=(b.concepts||[]).map(c=>({id:c.id,total:axes.reduce((sum,k)=>sum+(c.scores?.[k]||0),0)}));
  const winner=rated.find(c=>c.id===b.selected_concept_id);
  if(!winner||winner.total<22||winner.total!==b.selected_total||winner.total!==Math.max(...rated.map(c=>c.total))||
      String(b.selected_justification||'').length<70)errors.push('V3_SELECTION_NOT_GROUNDED');
  const source=registry?.sources?.find(s=>s.source_id===b.reference_source?.source_id&&s.repo_path===b.reference_source?.repo_path);
  const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if(!source?.scene_inventory||source.scene_inventory.source_sha256!==b.reference_source.sha256||
     job.automation?.selected_source_id!==source.source_id||
     job.automation?.source_repo_path!==source.repo_path||
     job.scene_plan?.source_sha256!==source.scene_inventory.source_sha256||
     !fs.existsSync(source.repo_path)||sha(source.repo_path)!==source.scene_inventory.source_sha256)
    errors.push('V3_SOURCE_AUTHENTICITY_FAILED');
  if(!inRoot(b.golden_reference)||!fs.existsSync(b.golden_reference)||
     !Array.isArray(job.style_references)||!job.style_references.includes(b.golden_reference))
    errors.push('V3_R7_GOLDEN_REFERENCE_MISSING');
  const sh=b.shot_contract||{},act=String(sh.subject_action||''),dir=String(job.scene_plan?.article_specific_directive||'');
  if(sh.lens_mm_equivalent!==50||!Number.isFinite(sh.camera_height_m)||
    !Array.isArray(sh.subject_horizontal_range_pct)||sh.subject_horizontal_range_pct.length!==2||
    !Array.isArray(sh.text_lines)||sh.text_lines.join('|')!=='体験前に、|3つだけ。'||
    !String(sh.crop_safe||'').includes('4:3')||!String(sh.background||'').includes('real THE REV'))
     errors.push('V3_SHOT_AND_CROP_PLAN_MISSING');
  if(!/sleeve/i.test(act)||!/sleeve/i.test(dir)||!/rack/i.test(dir)||
    /female customer|reception stool|mild concern|her upper sleeve|phone|smartphone/i.test(dir+' '+job.visible_action+' '+job.emotional_state+' '+job.visual_claim+' '+job.composition_hint))
    errors.push('V3_OLD_OR_GENERIC_SCENE_LEAK');
  if(job.scene_plan?.human_action!=='observing_real_equipment'||
     job.scene_plan?.location_type!=='training_area'||job.scene_plan?.visual_role!=='deciding_own_start')
    errors.push('V3_SELECTED_SCENE_MISMATCH');
  if(job.image_headline_short!==sh.text_lines.join('\n')||
     !['thumbnail','og_image','gbp_image'].every(k=>!!job[k])||
     job.max_generation_attempts!==1)
    errors.push('V3_LAYOUT_OR_ATTEMPTS_MISMATCH');
  if(b.spend_policy?.provider!=='OpenAI'||b.spend_policy?.max_paid_generation_attempts!==1||
     b.spend_policy?.one_scene_three_offline_derivatives!==true||b.spend_policy?.no_paid_fallback!==true||
     job.v3?.provider!=='OpenAI')
    errors.push('V3_PROVIDER_OR_COST_POLICY_VIOLATION');
  if(job.asset_version===b.owner_rejection.asset_version||String(job.thumbnail).includes(b.owner_rejection.asset_version))
    errors.push('V3_REJECTED_ASSET_VERSION_REUSED');
  if(job.publish_requires_human_approval!==true||b.publish_policy?.blog_post!==false||b.publish_policy?.gbp_post!==false)
    errors.push('V3_HUMAN_PUBLISH_BOUNDARY_MISSING');
  if(errors.length===0)notes.push('Creative brief locked, 3 concepts compared, chosen camera/source/copy verified, no paid calls before preflight');
  return {pass:errors.length===0,applies:true,errors,notes,selected_concept:b.selected_concept_id,selected_score:b.selected_total,brief_path:briefPath,strict_one_attempt:true};
}
