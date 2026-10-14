/**
 * THE REV. P2 five-article offline paired-image experiment.
 * Produces image-generation BRIEFS, never images or publish decisions.
 * Canonical source/QC remain authoritative and unchanged.
 */
import {FINGERPRINT_FIELDS, semanticSimilarity} from './editorialSceneGrounding.mjs';
import {proposeSafeSceneVariations,auditEditorialCopy} from './editorialImageVariationV1.mjs';

export const P2_VERSION='the-rev-editorial-image-p2-paired-v1';
export const P2_REQUIRED_CASES=5;
export const P2_AXES=['article_meaning','scene_originality','human_naturalness','the_rev_authenticity','copy_readability'];
const clean=v=>String(v??'').trim();
const assert=(v,msg)=>{if(!v)throw new Error(msg);};
const fingerprint=(p)=>Object.fromEntries(FINGERPRINT_FIELDS.map(k=>[k,p[k]]));
const sameFingerprint=(a,b)=>FINGERPRINT_FIELDS.every(k=>a?.[k]===b?.[k]);
const safeId=x=>/^[a-z0-9-]+$/.test(clean(x));

export function validateP2Cohort(cohort) {
  assert(cohort?.mode==='OFFLINE_ONLY','P2_MODE_MUST_BE_OFFLINE_ONLY');
  assert(Array.isArray(cohort.cases)&&cohort.cases.length===P2_REQUIRED_CASES,'P2_REQUIRES_EXACTLY_FIVE_CASES');
  const slugs=new Set(),ids=new Set();
  for(const c of cohort.cases){
    assert(safeId(c.slug)&&safeId(c.case_id),'P2_CASE_ID_OR_SLUG_INVALID');
    assert(!slugs.has(c.slug)&&!ids.has(c.case_id),'P2_DUPLICATE_CASE_OR_ARTICLE');
    slugs.add(c.slug);ids.add(c.case_id);
    assert(clean(c.baseline_asset_version)&&clean(c.improved_brief)&&clean(c.hypothesis),'P2_CASE_BRIEF_REQUIRED');
    assert(['scene_type','human_action','composition_type','visual_role'].every(k=>clean(c.target_fingerprint?.[k])),'P2_TARGET_FINGERPRINT_INCOMPLETE');
  }
  return true;
}

export function buildP2Case({configuration,job,qa,source,baselineAssetHashes={}}) {
  const c=configuration;
  assert(job?.slug===c?.slug,'P2_BASELINE_SLUG_MISMATCH');
  assert(job?.asset_version===c.baseline_asset_version,'P2_BASELINE_ASSET_VERSION_CHANGED');
  assert(job?.qa_report_path&&qa?.slug===c.slug&&qa?.asset_version===job.asset_version,'P2_BASELINE_QA_ID_MISMATCH');
  assert(qa.pass===true&&qa.manual_visual_rejection!==true,'P2_BASELINE_INDEPENDENT_QC_NOT_PASS');
  assert(qa.scene_grounding?.pass===true,'P2_BASELINE_GROUNDING_NOT_PASS');
  assert(qa.image_generation_used===true&&qa.source_material_scope_pass===true,'P2_BASELINE_SOURCE_UNVERIFIED');
  assert(source?.source_id===job?.automation?.selected_source_id,'P2_SOURCE_ID_DRIFT');
  assert(source?.repo_path===job?.automation?.source_repo_path,'P2_SOURCE_PATH_DRIFT');
  assert(source?.drive_file_id===job?.background_source?.drive_file_id,'P2_DRIVE_PROVENANCE_DRIFT');
  assert(source?.scene_inventory?.source_sha256===job?.scene_plan?.source_sha256,'P2_SOURCE_HASH_DRIFT');
  assert(qa.background_source_drive_file_id===source.drive_file_id,'P2_QA_DRIVE_PROVENANCE_DRIFT');
  assert(job.scene_plan?.source_id===source.source_id,'P2_PLAN_SOURCE_DRIFT');
  assert(job.policy?.publish_boundary==='REVIEW_AND_PUBLISH'||job.publish_requires_human_approval===true,'P2_HUMAN_PUBLISH_BOUNDARY_MISSING');
  assert(clean(baselineAssetHashes.thumbnail)&&clean(baselineAssetHashes.source),'P2_BASELINE_BYTES_NOT_VERIFIED');
  assert(baselineAssetHashes.source===source.scene_inventory.source_sha256,'P2_SOURCE_BYTES_CHANGED');
  const article={title:job.article_title,description:c.article_context||''};
  const history=job.automation?.recent_semantic_articles||[];
  const candidates=proposeSafeSceneVariations({article,source,canonicalPlan:job.scene_plan,recent:history});
  const selected=candidates.find(v=>
    Object.entries(c.target_fingerprint).every(([k,value])=>v.fingerprint[k]===value));
  assert(selected,'P2_VARIATION_NOT_ALLOWED_BY_CANONICAL_SOURCE');
  assert(!selected.is_current,'P2_IMPROVED_SCENE_IDENTICAL_TO_BASELINE');
  // An unknown historical fingerprint cannot be silently interpreted as diverse.
  const prior=semanticSimilarity({...job.scene_plan,...selected.fingerprint},history);
  assert(prior.pass,'P2_KNOWN_RECENT_SCENE_COLLISION');
  const bPlan={
    ...job.scene_plan,
    ...selected.fingerprint,
    required_equipment:[...(job.scene_plan.required_equipment||[])],
    article_specific_directive:c.improved_brief
  };
  assert(source.scene_inventory.allowed_generated_actions.includes(bPlan.human_action),'P2_SOURCE_ACTION_NOT_PERMITTED');
  assert(bPlan.location_type===source.scene_inventory.primary_location&&bPlan.subject_zone===source.scene_inventory.subject_zone,'P2_INVALID_LOCATION');
  return {
    case_id:c.case_id,slug:c.slug,title:job.article_title,hypothesis:c.hypothesis,
    original:{
      slot:'BASELINE',asset_version:job.asset_version,thumbnail:job.thumbnail,
      qa_report_path:job.qa_report_path,qa_checked_at:qa.checked_at,
      thumbnail_sha256:baselineAssetHashes.thumbnail,
      fingerprint:fingerprint(job.scene_plan),
      verified_independent_qa_pass:true
    },
    comparison:{
      slot:'IMPROVED_NOT_RENDERED',
      asset_version:'p2-offline-'+c.case_id+'-v1',
      original_asset_version:job.asset_version,
      target_fingerprint:fingerprint(bPlan),
      source_file:source.repo_path,
      source_sha256:source.scene_inventory.source_sha256,
      article_title:job.article_title,
      image_headline_short:job.image_headline_short,
      customer_presentation:job.customer_presentation,
      full_grounded_scene_plan:bPlan,
      design_revision:job.design_revision,
      layout_variant:job.layout_variant,
      generation_model:job.generation_model,
      renderer:job.layout_template_id,
      output_sizes:{thumbnail:[1200,675],ogp:[1200,630],gbp:[1200,900]},
      output_location:'editorial/experiments/image-quality-p2/offline-output/'+c.case_id,
      generation_status:'NOT_GENERATED',
      independent_visual_qc_status:'NOT_RUN',
      source_history_unknown_count:prior.unknown_count,
      requires_history_review:prior.unknown_count>0,
      copy_preflight:auditEditorialCopy(job.image_headline_short),
      publication_allowed:false
    }
  };
}

export function buildP2ComparisonManifest(cohort,cases){
  validateP2Cohort(cohort);
  assert(Array.isArray(cases)&&cases.length===P2_REQUIRED_CASES,'P2_CASE_COUNT_MISMATCH');
  for(let i=0;i<cases.length;i++)assert(cases[i].slug===cohort.cases[i].slug,'P2_CASE_ORDER_MISMATCH');
  return {
    experiment_id:cohort.experiment_id,version:P2_VERSION,mode:'OFFLINE_ONLY',
    subject_count:P2_REQUIRED_CASES,
    experiment_design:'same article, same verified source, same copy/model/style; scene brief and permitted action/composition only',
    cases,
    release_gate:'NO_AUTOMATED_PRODUCTION_PROMOTION',
    image_generation_status:'NOT_GENERATED',
    human_review_status:'NOT_STARTED',
    adoption_status:'NOT_EVALUATED',
    auto_publish:false
  };
}

export function assessP2PairedResults(manifest,submissions=[]){
  assert(manifest?.mode==='OFFLINE_ONLY'&&manifest?.cases?.length===5,'P2_INVALID_MANIFEST');
  const failures=[];
  const map=new Map(submissions.map(x=>[x.case_id,x]));
  if(map.size!==submissions.length)failures.push('DUPLICATE_REVIEWS');
  const comparisons=[];
  for(const c of manifest.cases){
    const sub=map.get(c.case_id);
    if(!sub){failures.push(c.case_id+':REVIEW_MISSING');continue;}
    // Never grade an unrendered candidate or a merely self-reported "READY".
    if(c.comparison.generation_status!=='QC_PASS'||c.comparison.independent_visual_qc_status!=='PASS')
      failures.push(c.case_id+':IMPROVED_IMAGE_QC_NOT_VERIFIED');
    if(sub?.hard_gates?.source_structure!==true||sub?.hard_gates?.allowed_action!==true||
       sub?.hard_gates?.single_customer_no_trainer!==true||sub?.hard_gates?.realism_lighting!==true)
      failures.push(c.case_id+':HARD_GATE_REVIEW_NOT_PASS');
    for(const slot of ['baseline','improved'])
      for(const axis of P2_AXES)
        if(!Number.isInteger(sub?.ratings?.[slot]?.[axis])||sub.ratings[slot][axis]<1||sub.ratings[slot][axis]>5)
          failures.push(c.case_id+':INVALID_REVIEW_'+slot+'_'+axis);
    if(!failures.some(x=>x.startsWith(c.case_id+':'))){
      const delta=P2_AXES.map(a=>sub.ratings.improved[a]-sub.ratings.baseline[a]);
      comparisons.push({
        case_id:c.case_id,mean_delta:delta.reduce((a,b)=>a+b,0)/delta.length,
        wins:delta.filter(n=>n>0).length,declines:delta.filter(n=>n<0).length,
        no_naturalness_regression:delta[2]>=0,
        no_authenticity_regression:delta[3]>=0,
        no_copy_regression:delta[4]>=0
      });
    }
  }
  if(failures.length)return {status:'NOT_EVALUABLE',adopt:false,reason:'Actual improved images and verified independent QC plus paired human review required',failures,comparisons:[]};
  const improvedCases=comparisons.filter(x=>x.mean_delta>0&&x.no_naturalness_regression&&x.no_authenticity_regression&&x.no_copy_regression).length;
  return {
    status:'EXPERIMENT_REVIEW_COMPLETE',adopt:false,
    requires_owner_approval:true,
    recommendation:improvedCases>=4?'ELIGIBLE_FOR_OWNER_REVIEW':'KEEP_BASELINE',
    improved_cases:improvedCases,comparisons,
    note:'Even favorable results never trigger automatic canary/production promotion.'
  };
}
