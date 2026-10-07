import {getDirectorAssignmentsForChannel} from './socialDirector.mjs';

const t=(v,n=12000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

const CONFIDENCE=['LOW','MEDIUM','HIGH'];
const QC=new Set(['READY_FOR_APPROVAL','REVIEW_REQUIRED','BLOCKED','HOLD']);
const INTERACTIONS=new Set(['NONE','POLL','QUESTION','QUIZ','LINK','DM']);

function textArray(v,max=30,n=1000){
  return [...new Set(arr(v).map(x=>t(x,n)).filter(Boolean))].slice(0,max);
}

function capConfidence(requested,opportunityConfidence){
  const req=t(requested||opportunityConfidence||'LOW',40).toUpperCase();
  const opp=t(opportunityConfidence||'LOW',40).toUpperCase();
  const ri=CONFIDENCE.indexOf(req);
  const oi=CONFIDENCE.indexOf(opp);
  if(ri<0||oi<0)return 'LOW';
  return CONFIDENCE[Math.min(ri,oi)];
}

function claimKeySet(opportunity){
  return new Set((opportunity?.evidence||[])
    .map(x=>x?.evidence?.evidence_key)
    .filter(Boolean));
}

function validateClaimRefs(refs,opportunity,{ready=false}={}){
  const allowed=claimKeySet(opportunity);
  const list=textArray(refs,30,300);
  for(const ref of list){
    if(!allowed.has(ref))throw new Error('SOCIAL_CREATIVE_CLAIM_REF_OUTSIDE_OPPORTUNITY');
  }
  if(ready&&!list.length)throw new Error('SOCIAL_CREATIVE_READY_REQUIRES_CLAIM_REF');
  return list;
}

function gateReady({opportunity,qcDecision,generalizationFlags,claimRefs}){
  if(qcDecision!=='READY_FOR_APPROVAL')return;
  if(opportunity.evidence_strength!=='GROUNDED')throw new Error('SOCIAL_CREATIVE_READY_REQUIRES_GROUNDED');
  if(opportunity.qc_decision!=='READY')throw new Error('SOCIAL_CREATIVE_READY_REQUIRES_READY_OPPORTUNITY');
  if(generalizationFlags.length)throw new Error('SOCIAL_CREATIVE_GENERALIZATION_REQUIRES_REVIEW');
  if(!claimRefs.length)throw new Error('SOCIAL_CREATIVE_READY_REQUIRES_CLAIM_REF');
}

async function loadOpportunityContext({supabase,targetDate}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const plan=await supabase.from('social_opportunity_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(plan.error)throw new Error('SOCIAL_OPPORTUNITY_PLAN_READ_FAILED');
  if(!plan.data)throw new Error('SOCIAL_OPPORTUNITY_PLAN_NOT_FOUND');
  if(plan.data.status!=='READY')throw new Error('SOCIAL_OPPORTUNITY_PLAN_NOT_READY');

  const opportunities=await supabase.from('social_opportunities').select('*')
    .eq('plan_id',plan.data.id).order('opportunity_no',{ascending:true});
  if(opportunities.error)throw new Error('SOCIAL_OPPORTUNITY_READ_FAILED');

  const ids=(opportunities.data||[]).map(x=>x.id);
  const evidenceByOpportunity={};
  if(ids.length){
    const links=await supabase.from('social_opportunity_evidence').select('*')
      .in('opportunity_id',ids);
    if(links.error)throw new Error('SOCIAL_OPPORTUNITY_EVIDENCE_READ_FAILED');
    const evidenceIds=[...new Set((links.data||[]).map(x=>x.evidence_id))];
    const evidenceMap={};
    if(evidenceIds.length){
      const evidence=await supabase.from('social_evidence_items').select('*').in('id',evidenceIds);
      if(evidence.error)throw new Error('SOCIAL_EVIDENCE_ITEM_READ_FAILED');
      for(const row of evidence.data||[])evidenceMap[row.id]=row;
    }
    for(const link of links.data||[]){
      if(!evidenceByOpportunity[link.opportunity_id])evidenceByOpportunity[link.opportunity_id]=[];
      evidenceByOpportunity[link.opportunity_id].push({
        role:link.evidence_role,
        evidence:evidenceMap[link.evidence_id]||null
      });
    }
  }

  return {
    plan:plan.data,
    opportunities:(opportunities.data||[]).map(x=>({
      ...x,
      evidence:evidenceByOpportunity[x.id]||[]
    }))
  };
}

function opportunityMap(context,channel){
  const map=new Map();
  for(const op of context.opportunities||[]){
    if(arr(op.possible_channels).includes(channel)&&!['BLOCKED','HOLD'].includes(op.qc_decision)){
      map.set(op.id,op);
    }
  }
  return map;
}

export async function getCreativeEvidenceContext({supabase,targetDate}){
  const context=await loadOpportunityContext({supabase,targetDate});
  const shape=channel=>context.opportunities
    .filter(x=>arr(x.possible_channels).includes(channel))
    .map(x=>({
      id:x.id,
      opportunity_no:x.opportunity_no,
      title:x.title,
      business_problem:x.business_problem,
      business_job:x.business_job,
      primary_objective:x.primary_objective,
      audience_state:x.audience_state,
      why_now:x.why_now,
      observed_signal:x.observed_signal,
      interpretation:x.interpretation,
      hypothesis:x.hypothesis,
      expected_behavior:x.expected_behavior,
      confidence:x.confidence,
      evidence_strength:x.evidence_strength,
      evidence_gaps:x.evidence_gaps,
      test_metrics:x.test_metrics,
      counterevidence_summary:x.counterevidence_summary,
      qc_decision:x.qc_decision,
      evidence:(x.evidence||[]).map(link=>({
        role:link.role,
        evidence_key:link.evidence?.evidence_key||null,
        source_type:link.evidence?.source_type||null,
        source_ref:link.evidence?.source_ref||null,
        evidence_text:link.evidence?.evidence_text||null,
        allowed_use:link.evidence?.allowed_use||null
      }))
    }));
  return {
    target_date:targetDate,
    opportunity_plan:context.plan,
    reel_opportunities:shape('REEL'),
    story_opportunities:shape('STORIES'),
    rules:{
      candidate_first_reason_afterward:false,
      ready_requires_grounded:true,
      ready_requires_primary_opportunity:true,
      ready_requires_claim_refs:true,
      claim_refs_must_exist_in_opportunity_evidence:true,
      model_prior_is_not_evidence:true,
      story_asset_first_supported:true,
      story_interaction_can_be_deprioritized:true,
      human_approval_required:true
    }
  };
}

export function normalizeEvidenceReelCandidate(input={},candidateNo,opMap,directorAssignmentMap=null){
  const opportunityId=t(input.opportunity_id,80);
  const op=opMap.get(opportunityId);
  if(!op)throw new Error('SOCIAL_REEL_EVIDENCE_OPPORTUNITY_INVALID');

  const directorAssignment=directorAssignmentMap?directorAssignmentMap.get(opportunityId):null;
  if(directorAssignmentMap&&!directorAssignment)throw new Error('SOCIAL_REEL_DIRECTOR_ASSIGNMENT_REQUIRED');
  if(directorAssignment&&input.director_assignment_id&&input.director_assignment_id!==directorAssignment.id){
    throw new Error('SOCIAL_REEL_DIRECTOR_ASSIGNMENT_MISMATCH');
  }

  const title=t(input.title,500);
  const direction=t(input.creative_direction,120).toUpperCase();
  const why=t(input.why_this_execution,5000);
  if(!title)throw new Error('SOCIAL_REEL_EVIDENCE_TITLE_REQUIRED');
  if(!direction)throw new Error('SOCIAL_REEL_EVIDENCE_DIRECTION_REQUIRED');
  if(!why)throw new Error('SOCIAL_REEL_EVIDENCE_EXECUTION_REASON_REQUIRED');

  const qcDecision=t(input.qc_decision||'REVIEW_REQUIRED',80).toUpperCase();
  if(!QC.has(qcDecision))throw new Error('SOCIAL_CREATIVE_QC_INVALID');

  const flags=textArray(input.generalization_flags,20,500);
  const refs=validateClaimRefs(input.claim_refs,op,{ready:qcDecision==='READY_FOR_APPROVAL'});
  gateReady({opportunity:op,qcDecision,generalizationFlags:flags,claimRefs:refs});

  return {
    candidate_no:candidateNo,
    opportunity_id:op.id,
    director_assignment_id:directorAssignment?.id||null,
    creative_direction:direction,
    title,
    hook:nt(input.hook,2000),
    core_message:nt(input.core_message,4000),
    why_this_execution:why,
    difference_from_history:nt(input.difference_from_history,5000),
    asset_plan:nt(input.asset_plan,4000),
    estimated_shoot_minutes:Number.isFinite(Number(input.estimated_shoot_minutes))
      ?Math.max(0,Math.min(240,Number(input.estimated_shoot_minutes))):null,
    business_job:op.business_job||null,
    audience_state:op.audience_state||null,
    fact:nt(input.fact,5000),
    interpretation:op.interpretation||null,
    hypothesis:op.hypothesis||null,
    expected_behavior:op.expected_behavior||null,
    confidence:capConfidence(input.confidence,op.confidence),
    evidence_strength:op.evidence_strength,
    evidence_gaps:[...new Set([...(op.evidence_gaps||[]),...textArray(input.evidence_gaps,20,1200)])],
    test_metrics:textArray(input.test_metrics?.length?input.test_metrics:op.test_metrics,20,300),
    claim_refs:refs,
    generalization_flags:flags,
    qc_decision:qcDecision,
    status:'CANDIDATE',
    production_plan:obj(input.production_plan),
    metadata:{
      ...obj(input.metadata),
      opportunity_title:op.title,
      opportunity_no:op.opportunity_no
    }
  };
}

function validateReelDiversity(rows,eligibleOps){
  const dirs=new Set(rows.map(x=>x.creative_direction));
  if(dirs.size<4)throw new Error('SOCIAL_REEL_EVIDENCE_DIVERSITY_TOO_LOW');
  const titles=rows.map(x=>x.title.toLowerCase());
  if(new Set(titles).size!==titles.length)throw new Error('SOCIAL_REEL_EVIDENCE_DUPLICATE_TITLE');
  const groundedReady=[...eligibleOps.values()].filter(x=>x.evidence_strength==='GROUNDED'&&x.qc_decision==='READY');
  if(groundedReady.length>=2&&new Set(rows.map(x=>x.opportunity_id)).size<2){
    throw new Error('SOCIAL_REEL_EVIDENCE_OPPORTUNITY_COVERAGE_TOO_LOW');
  }
}

export async function prepareEvidenceReelRun({
  supabase,targetDate,candidates=[],sourceContext={},holdReason,
  runMode='SHADOW',replaceExisting=false
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const mode=t(runMode||'SHADOW',40).toUpperCase();
  if(!['SHADOW','PRODUCTION'].includes(mode))throw new Error('SOCIAL_CREATIVE_RUN_MODE_INVALID');

  const context=await loadOpportunityContext({supabase,targetDate});
  const existing=await supabase.from('social_reel_evidence_runs').select('*')
    .eq('target_date',targetDate).eq('run_mode',mode).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_REEL_EVIDENCE_RUN_READ_FAILED');
  if(existing.data&&!replaceExisting)return pollEvidenceReelRun({supabase,targetDate,runMode:mode});

  const list=arr(candidates);
  if(!holdReason&&list.length!==5)throw new Error('SOCIAL_REEL_EVIDENCE_FIVE_REQUIRED');

  const run=await supabase.from('social_reel_evidence_runs').upsert({
    target_date:targetDate,
    run_mode:mode,
    planner_version:'v0.8',
    opportunity_plan_id:context.plan.id,
    status:holdReason?'HOLD':'OPEN',
    source_context:obj(sourceContext),
    hold_reason:holdReason?t(holdReason,5000):null,
    updated_at:new Date().toISOString()
  },{onConflict:'target_date,run_mode'}).select('*').single();
  if(run.error||!run.data)throw new Error('SOCIAL_REEL_EVIDENCE_RUN_UPSERT_FAILED');

  const reset=await supabase.from('social_reel_evidence_candidates').delete().eq('run_id',run.data.id);
  if(reset.error)throw new Error('SOCIAL_REEL_EVIDENCE_RESET_FAILED');
  if(holdReason)return {run:{...run.data,status:'HOLD'},candidates:[]};

  let opMap=opportunityMap(context,'REEL');
  const director=await getDirectorAssignmentsForChannel({
    supabase,targetDate,runMode:mode,channel:'REEL',
    required:obj(sourceContext).director_required===true
  });
  let directorAssignmentMap=null;
  if(director){
    directorAssignmentMap=new Map(director.assignments.map(x=>[x.opportunity_id,x]));
    opMap=new Map([...opMap].filter(([id])=>directorAssignmentMap.has(id)));
  }
  const rows=list.map((x,i)=>normalizeEvidenceReelCandidate(x,i+1,opMap,directorAssignmentMap));
  validateReelDiversity(rows,opMap);

  const inserted=await supabase.from('social_reel_evidence_candidates').insert(
    rows.map(x=>({run_id:run.data.id,...x}))
  ).select('*');
  if(inserted.error)throw new Error('SOCIAL_REEL_EVIDENCE_INSERT_FAILED');

  const ready=await supabase.from('social_reel_evidence_runs').update({
    status:'READY',hold_reason:null,updated_at:new Date().toISOString()
  }).eq('id',run.data.id).select('*').single();
  if(ready.error)throw new Error('SOCIAL_REEL_EVIDENCE_RUN_UPSERT_FAILED');

  return pollEvidenceReelRun({supabase,targetDate,runMode:mode});
}

export async function pollEvidenceReelRun({supabase,targetDate,runMode='SHADOW'}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const mode=t(runMode||'SHADOW',40).toUpperCase();
  const run=await supabase.from('social_reel_evidence_runs').select('*')
    .eq('target_date',targetDate).eq('run_mode',mode).maybeSingle();
  if(run.error)throw new Error('SOCIAL_REEL_EVIDENCE_RUN_READ_FAILED');
  if(!run.data)return {run:null,candidates:[]};

  const candidates=await supabase.from('social_reel_evidence_candidates').select('*')
    .eq('run_id',run.data.id).order('candidate_no',{ascending:true});
  if(candidates.error)throw new Error('SOCIAL_REEL_EVIDENCE_READ_FAILED');

  const context=await loadOpportunityContext({supabase,targetDate});
  const map=new Map(context.opportunities.map(x=>[x.id,x]));
  return {
    run:run.data,
    candidates:(candidates.data||[]).map(x=>({
      ...x,
      opportunity:map.get(x.opportunity_id)||null
    }))
  };
}

export function normalizeEvidenceStoryItem(input={},slotNo,opMap,directorAssignmentMap=null){
  const opportunityId=t(input.opportunity_id,80);
  const op=opMap.get(opportunityId);
  if(!op)throw new Error('SOCIAL_STORY_EVIDENCE_OPPORTUNITY_INVALID');

  const directorAssignment=directorAssignmentMap?directorAssignmentMap.get(opportunityId):null;
  if(directorAssignmentMap&&!directorAssignment)throw new Error('SOCIAL_STORY_DIRECTOR_ASSIGNMENT_REQUIRED');
  if(directorAssignment&&input.director_assignment_id&&input.director_assignment_id!==directorAssignment.id){
    throw new Error('SOCIAL_STORY_DIRECTOR_ASSIGNMENT_MISMATCH');
  }

  const role=t(input.role||'REAL_MOMENT',120).toUpperCase();
  const interaction=t(input.interaction||'NONE',40).toUpperCase();
  if(!INTERACTIONS.has(interaction))throw new Error('SOCIAL_STORY_INTERACTION_INVALID');

  const sourceSignal=t(input.source_signal,5000);
  const whyToday=t(input.why_today,5000);
  if(!sourceSignal)throw new Error('SOCIAL_STORY_EVIDENCE_SOURCE_SIGNAL_REQUIRED');
  if(!whyToday)throw new Error('SOCIAL_STORY_EVIDENCE_WHY_TODAY_REQUIRED');

  const hook=nt(input.hook,2000);
  const frameText=nt(input.frame_text||input.text||input.copy,4000);
  const assetPlan=nt(input.asset_plan,4000);
  if(!hook&&!frameText&&!assetPlan)throw new Error('SOCIAL_STORY_CONTENT_REQUIRED');

  const qcDecision=t(input.qc_decision||'REVIEW_REQUIRED',80).toUpperCase();
  if(!QC.has(qcDecision))throw new Error('SOCIAL_CREATIVE_QC_INVALID');

  const flags=textArray(input.generalization_flags,20,500);
  const refs=validateClaimRefs(input.claim_refs,op,{ready:qcDecision==='READY_FOR_APPROVAL'});
  gateReady({opportunity:op,qcDecision,generalizationFlags:flags,claimRefs:refs});

  const recentDifference=nt(input.recent_pattern_difference,4000);
  if(qcDecision==='READY_FOR_APPROVAL'&&!recentDifference){
    throw new Error('SOCIAL_STORY_EVIDENCE_RECENT_DIFFERENCE_REQUIRED');
  }

  return {
    slot_no:slotNo,
    opportunity_id:op.id,
    director_assignment_id:directorAssignment?.id||null,
    role,
    pattern:nt(input.pattern,120),
    interaction,
    business_job:op.business_job||null,
    audience_state:op.audience_state||null,
    title:nt(input.title,500),
    hook,
    frame_text:frameText,
    asset_plan:assetPlan,
    posting_window:nt(input.posting_window,120),
    source_signal:sourceSignal,
    why_today:whyToday,
    expected_behavior:op.expected_behavior||null,
    confidence:capConfidence(input.confidence,op.confidence),
    evidence_strength:op.evidence_strength,
    evidence_gaps:[...new Set([...(op.evidence_gaps||[]),...textArray(input.evidence_gaps,20,1200)])],
    recent_pattern_difference:recentDifference,
    test_metrics:textArray(input.test_metrics?.length?input.test_metrics:op.test_metrics,20,300),
    claim_refs:refs,
    generalization_flags:flags,
    qc_decision:qcDecision,
    status:['BLOCKED','HOLD'].includes(qcDecision)?'HOLD':'PLANNED',
    metadata:{
      ...obj(input.metadata),
      opportunity_title:op.title,
      opportunity_no:op.opportunity_no
    }
  };
}

function validateStoryDiversity(rows){
  if(rows.length>=3){
    const roles=new Set(rows.map(x=>x.role));
    if(roles.size<2)throw new Error('SOCIAL_STORY_EVIDENCE_ROLE_DIVERSITY_TOO_LOW');
  }
}

export function validateStoryAssetPolicy(rows=[],sourceContext={}){
  const ctx=obj(sourceContext);
  if(ctx.asset_first_required!==true)return {asset_first:false};

  if(rows.length===1&&!t(ctx.single_story_reason,1200)){
    throw new Error('SOCIAL_STORY_ASSET_FIRST_PREFERS_TWO_TO_THREE');
  }

  const categories=[];
  for(const row of rows){
    const meta=obj(row.metadata);
    if(meta.asset_source!=='EXISTING_LIBRARY'){
      throw new Error('SOCIAL_STORY_EXISTING_ASSET_REQUIRED');
    }
    const category=t(meta.asset_category,120).toUpperCase();
    if(!category)throw new Error('SOCIAL_STORY_ASSET_CATEGORY_REQUIRED');
    if(!row.asset_plan)throw new Error('SOCIAL_STORY_ASSET_PLAN_REQUIRED');
    categories.push(category);

    if(ctx.interaction_deprioritized===true&&row.interaction!=='NONE'){
      const reason=t(meta.interaction_exception_reason,1200);
      if(reason.length<20){
        throw new Error('SOCIAL_STORY_INTERACTION_REQUIRES_EXCEPTION');
      }
    }
  }

  if(rows.length>=3&&new Set(categories).size<2){
    throw new Error('SOCIAL_STORY_ASSET_CATEGORY_DIVERSITY_TOO_LOW');
  }

  return {
    asset_first:true,
    story_count:rows.length,
    categories:[...new Set(categories)],
    interaction_none_count:rows.filter(x=>x.interaction==='NONE').length
  };
}

export async function prepareEvidenceStoryRun({
  supabase,targetDate,stories=[],sourceContext={},holdReason,
  runMode='SHADOW',replaceExisting=false
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const mode=t(runMode||'SHADOW',40).toUpperCase();
  if(!['SHADOW','PRODUCTION'].includes(mode))throw new Error('SOCIAL_CREATIVE_RUN_MODE_INVALID');

  const context=await loadOpportunityContext({supabase,targetDate});
  const existing=await supabase.from('social_story_evidence_runs').select('*')
    .eq('target_date',targetDate).eq('run_mode',mode).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_STORY_EVIDENCE_RUN_READ_FAILED');
  if(existing.data&&!replaceExisting)return pollEvidenceStoryRun({supabase,targetDate,runMode:mode});

  const list=arr(stories);
  if(!holdReason&&(list.length<1||list.length>3))throw new Error('SOCIAL_STORY_EVIDENCE_COUNT_INVALID');

  const run=await supabase.from('social_story_evidence_runs').upsert({
    target_date:targetDate,
    run_mode:mode,
    planner_version:'v0.8',
    opportunity_plan_id:context.plan.id,
    status:holdReason?'HOLD':'OPEN',
    source_context:obj(sourceContext),
    hold_reason:holdReason?t(holdReason,5000):null,
    updated_at:new Date().toISOString()
  },{onConflict:'target_date,run_mode'}).select('*').single();
  if(run.error||!run.data)throw new Error('SOCIAL_STORY_EVIDENCE_RUN_UPSERT_FAILED');

  const reset=await supabase.from('social_story_evidence_items').delete().eq('run_id',run.data.id);
  if(reset.error)throw new Error('SOCIAL_STORY_EVIDENCE_RESET_FAILED');
  if(holdReason)return {run:{...run.data,status:'HOLD'},items:[]};

  let opMap=opportunityMap(context,'STORIES');
  const director=await getDirectorAssignmentsForChannel({
    supabase,targetDate,runMode:mode,channel:'STORIES',
    required:obj(sourceContext).director_required===true
  });
  let directorAssignmentMap=null;
  if(director){
    directorAssignmentMap=new Map(director.assignments.map(x=>[x.opportunity_id,x]));
    opMap=new Map([...opMap].filter(([id])=>directorAssignmentMap.has(id)));
  }
  const rows=list.map((x,i)=>normalizeEvidenceStoryItem(x,i+1,opMap,directorAssignmentMap));
  validateStoryDiversity(rows);
  validateStoryAssetPolicy(rows,sourceContext);

  const inserted=await supabase.from('social_story_evidence_items').insert(
    rows.map(x=>({run_id:run.data.id,...x}))
  ).select('*');
  if(inserted.error)throw new Error('SOCIAL_STORY_EVIDENCE_INSERT_FAILED');

  const hasReady=rows.some(x=>x.qc_decision==='READY_FOR_APPROVAL');
  const nextStatus=hasReady?'READY':'HOLD';
  const ready=await supabase.from('social_story_evidence_runs').update({
    status:nextStatus,
    hold_reason:hasReady?null:'NO_READY_FOR_APPROVAL_STORY',
    updated_at:new Date().toISOString()
  }).eq('id',run.data.id).select('*').single();
  if(ready.error)throw new Error('SOCIAL_STORY_EVIDENCE_RUN_UPSERT_FAILED');

  return pollEvidenceStoryRun({supabase,targetDate,runMode:mode});
}

export async function pollEvidenceStoryRun({supabase,targetDate,runMode='SHADOW'}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const mode=t(runMode||'SHADOW',40).toUpperCase();
  const run=await supabase.from('social_story_evidence_runs').select('*')
    .eq('target_date',targetDate).eq('run_mode',mode).maybeSingle();
  if(run.error)throw new Error('SOCIAL_STORY_EVIDENCE_RUN_READ_FAILED');
  if(!run.data)return {run:null,items:[]};

  const items=await supabase.from('social_story_evidence_items').select('*')
    .eq('run_id',run.data.id).order('slot_no',{ascending:true});
  if(items.error)throw new Error('SOCIAL_STORY_EVIDENCE_READ_FAILED');

  const context=await loadOpportunityContext({supabase,targetDate});
  const map=new Map(context.opportunities.map(x=>[x.id,x]));
  return {
    run:run.data,
    items:(items.data||[]).map(x=>({
      ...x,
      opportunity:map.get(x.opportunity_id)||null
    }))
  };
}
