import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {articleSceneIntent,canonicalizeRecentFingerprint,semanticSimilarity,SCENE_ONTOLOGY} from './editorialSceneGrounding.mjs';

const sha256=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fingerprintComplete=f=>['scene_type','location_type','human_action','composition_type','visual_role','article_intent']
  .every(k=>SCENE_ONTOLOGY[k].includes(f?.[k]));

/**
 * Free deterministic checks ahead of billable image-generation API calls.
 * Supports opt-in strict mode for jobs with authoritative historical scene
 * observations. Unknown historical scenes are NEVER silently counted as new.
 * This check does not grant image QA or publishing approval.
 */
export function preflightEditorialImage(job,registry,{sourceExists=fs.existsSync,hashFile=sha256,requireStrict=false}={}){
  const errors=[],warnings=[];
  if(job?.automation?.require_complete_semantic_preflight!==true && !requireStrict)
    return {status:'LEGACY_UNMODIFIED',pass:true,strict:false,no_api_calls:true,errors,warnings};
  const source=registry?.sources?.find(x=>x.source_id===job?.automation?.selected_source_id&&x.repo_path===job?.automation?.source_repo_path);
  if(!source?.scene_inventory)errors.push('SOURCE_NOT_REGISTERED');
  if(!sourceExists(job?.automation?.source_repo_path||''))errors.push('SOURCE_MISSING');
  else if(source?.scene_inventory?.source_sha256!==hashFile(job.automation.source_repo_path))errors.push('SOURCE_SHA256_CHANGED');
  if(!job?.asset_version||!job?.scene_plan||job?.scene_plan?.source_id!==source?.source_id||
    job?.scene_plan?.source_sha256!==source?.scene_inventory?.source_sha256)errors.push('PLAN_SOURCE_MISMATCH');
  if(job?.scene_plan?.article_intent!==articleSceneIntent({title:job?.article_title}))
    errors.push('ARTICLE_INTENT_MISMATCH');
  if(!source?.scene_inventory?.allowed_generated_actions?.includes(job?.scene_plan?.human_action)||
    source?.scene_inventory?.primary_location!==job?.scene_plan?.location_type||
    source?.scene_inventory?.subject_zone!==job?.scene_plan?.subject_zone||
    !source?.scene_inventory?.suitable_article_intents?.includes(job?.scene_plan?.article_intent))
    errors.push('SOURCE_ACTION_NOT_ALLOWED');
  if(!fingerprintComplete(job?.scene_plan))errors.push('SCENE_FINGERPRINT_INVALID');
  const recent=Array.isArray(job?.automation?.recent_semantic_articles)?job.automation.recent_semantic_articles:[];
  if(job?.automation?.require_consistent_recent_history===true){
    const ids=rows=>JSON.stringify((rows||[]).map(r=>[r.slug,r.assetVersion||r.asset_version||'']));
    if(ids(job.automation.recent_articles)!==ids(recent.slice(0,4)))errors.push('RECENT_HISTORY_SNAPSHOT_MISMATCH');
  }
  if(recent.length===0)warnings.push('HISTORY_EMPTY');
  const history=recent.map(r=>({...r,scene_fingerprint:canonicalizeRecentFingerprint(r,r.scene_fingerprint||r.sceneFingerprint)}));
  const similarity=fingerprintComplete(job?.scene_plan)?semanticSimilarity(job.scene_plan,history):null;
  if(!similarity||!similarity.pass)errors.push('RECENT_SCENE_DUPLICATE');
  if(similarity?.unknown_count>0)errors.push('SEMANTIC_HISTORY_INCOMPLETE');
  if(!Number.isInteger(job?.max_generation_attempts)||job.max_generation_attempts!==1)
    errors.push('STRICT_ATTEMPT_LIMIT_NOT_ONE');
  if(job?.generated_customer_count!==1||job?.policy?.trainer_present_forbidden!==true||
     job?.policy?.unknown_trainer_forbidden!==true||job?.policy?.non_customer_people_forbidden!==true)
    errors.push('ONE_CUSTOMER_ONLY_POLICY_MISSING');
  const formats=['thumbnail','og_image','gbp_image'];
  if(formats.some(k=>!job?.[k]))errors.push('THREE_FORMATS_NOT_CONFIGURED');
  return {status:errors.length?'BLOCKED_BEFORE_MODEL':'PASS_BEFORE_MODEL',pass:errors.length===0,strict:true,
    no_api_calls:true,source_id:source?.source_id||null,
    history_compared:similarity?.compared||0,history_unknown:similarity?.unknown_count??recent.length,
    closest_article:similarity?.matches?.filter(x=>!x.unknown).sort((a,b)=>b.score-a.score)[0]?.slug||null,
    duplicate_slugs:similarity?.matches?.filter(x=>x.hard_exclusion).map(x=>x.slug)||[],errors,warnings};
}
