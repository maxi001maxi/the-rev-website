import {
  pollSocialPortfolioSnapshot,normalizePortfolioDecision
} from './socialPortfolio.mjs';

const t=(v,n=12000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

const CHANNELS=['REEL','STORIES','THREADS'];
const CHANNEL_JOBS={
  REEL:new Set(['VISUAL_PROOF','PROCESS_DEMO','STORE_EXPERIENCE','SERVICE_PROOF','DISCOVERY_KNOWLEDGE']),
  STORIES:new Set(['RELATIONSHIP','FAMILIARITY','UNCERTAINTY_REDUCTION','PARTICIPATION','DECISION_SUPPORT']),
  THREADS:new Set([
    'PERSPECTIVE_JUDGMENT','FIELD_NOTE_OBSERVATION','MINI_KNOWLEDGE_THROUGH_JUDGMENT',
    'HUMAN_TEXTURE','CONVERSATION','LOCAL_CONTEXT','STORE_PROCESS_EXPERIENCE','LIGHT_PROMOTION'
  ])
};
const ROLES=new Set(['LEAD','SUPPORT']);
const QC=new Set(['READY','REVIEW_REQUIRED','BLOCKED','HOLD']);

function textArray(v,max=30,n=1000){
  return [...new Set(arr(v).map(x=>t(x,n)).filter(Boolean))].slice(0,max);
}
function normKey(v){return t(v,500).toLowerCase().replace(/\s+/g,' ').trim();}
function clamp(v,min,max,fallback){
  const n=Number(v);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
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
    const links=await supabase.from('social_opportunity_evidence').select('*').in('opportunity_id',ids);
    if(links.error)throw new Error('SOCIAL_OPPORTUNITY_EVIDENCE_READ_FAILED');
    const evidenceIds=[...new Set((links.data||[]).map(x=>x.evidence_id))];
    const evidenceMap={};
    if(evidenceIds.length){
      const rows=await supabase.from('social_evidence_items').select('*').in('id',evidenceIds);
      if(rows.error)throw new Error('SOCIAL_EVIDENCE_ITEM_READ_FAILED');
      for(const row of rows.data||[])evidenceMap[row.id]=row;
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

function evidenceKeySet(opportunity){
  return new Set((opportunity?.evidence||[]).map(x=>x?.evidence?.evidence_key).filter(Boolean));
}

export function normalizeDirectorAssignment(input={},opportunityMap){
  const opportunityId=t(input.opportunity_id,80);
  const op=opportunityMap.get(opportunityId);
  if(!op)throw new Error('SOCIAL_DIRECTOR_OPPORTUNITY_INVALID');

  const channel=t(input.channel,40).toUpperCase();
  const role=t(input.assignment_role||'SUPPORT',40).toUpperCase();
  const job=t(input.channel_job,120).toUpperCase();
  const angleKey=t(input.angle_key,200);
  const messageKey=t(input.message_key,200);
  const claimFocus=t(input.claim_focus,3000);
  const rationale=t(input.rationale,5000);
  const qc=t(input.qc_decision||'READY',80).toUpperCase();

  if(!CHANNELS.includes(channel))throw new Error('SOCIAL_DIRECTOR_CHANNEL_INVALID');
  if(!arr(op.possible_channels).includes(channel))throw new Error('SOCIAL_DIRECTOR_CHANNEL_NOT_ALLOWED_BY_OPPORTUNITY');
  if(!ROLES.has(role))throw new Error('SOCIAL_DIRECTOR_ROLE_INVALID');
  if(!CHANNEL_JOBS[channel].has(job))throw new Error('SOCIAL_DIRECTOR_CHANNEL_JOB_INVALID');
  if(!angleKey||!messageKey||!claimFocus||!rationale)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_FIELDS_REQUIRED');
  if(!QC.has(qc))throw new Error('SOCIAL_DIRECTOR_QC_INVALID');

  const allowedEvidence=evidenceKeySet(op);
  const evidenceKeys=textArray(input.evidence_keys,20,300);
  if(!evidenceKeys.length)throw new Error('SOCIAL_DIRECTOR_EVIDENCE_REQUIRED');
  for(const key of evidenceKeys){
    if(!allowedEvidence.has(key))throw new Error('SOCIAL_DIRECTOR_EVIDENCE_OUTSIDE_OPPORTUNITY');
  }

  if(qc==='READY'){
    if(op.evidence_strength!=='GROUNDED')throw new Error('SOCIAL_DIRECTOR_READY_REQUIRES_GROUNDED');
    if(op.qc_decision!=='READY')throw new Error('SOCIAL_DIRECTOR_READY_REQUIRES_READY_OPPORTUNITY');
  }

  return {
    opportunity_id:op.id,
    channel,
    assignment_role:role,
    channel_job:job,
    angle_key:angleKey,
    message_key:messageKey,
    claim_focus:claimFocus,
    rationale,
    expected_behavior:nt(input.expected_behavior||op.expected_behavior,4000),
    priority:clamp(input.priority,1,5,1),
    estimated_work_minutes:clamp(input.estimated_work_minutes,0,240,0),
    evidence_keys:evidenceKeys,
    qc_decision:qc,
    notes:nt(input.notes,4000),
    metadata:{
      ...obj(input.metadata),
      opportunity_no:op.opportunity_no,
      opportunity_title:op.title,
      evidence_strength:op.evidence_strength,
      opportunity_confidence:op.confidence
    }
  };
}

function normalizeChannelStates(input,assignments){
  const source=obj(input);
  const out={};
  for(const channel of CHANNELS){
    const count=assignments.filter(x=>x.channel===channel&& !['BLOCKED','HOLD'].includes(x.qc_decision)).length;
    const raw=obj(source[channel]);
    const status=t(raw.status||(count?'ACTIVE':'HOLD'),40).toUpperCase();
    if(!['ACTIVE','HOLD'].includes(status))throw new Error('SOCIAL_DIRECTOR_CHANNEL_STATE_INVALID');
    if(status==='ACTIVE'&&!count)throw new Error('SOCIAL_DIRECTOR_ACTIVE_CHANNEL_WITHOUT_ASSIGNMENT');
    if(status==='HOLD'&&count)throw new Error('SOCIAL_DIRECTOR_HOLD_CHANNEL_HAS_ASSIGNMENT');
    out[channel]={
      status,
      reason:nt(raw.reason,2000),
      assignment_count:count
    };
  }
  return out;
}

export function validateDirectorAssignmentSet(rows,budget){
  if(rows.length>8)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_COUNT_INVALID');

  const byChannel={REEL:[],STORIES:[],THREADS:[]};
  const byOpportunity=new Map();
  for(const row of rows){
    byChannel[row.channel].push(row);
    if(!byOpportunity.has(row.opportunity_id))byOpportunity.set(row.opportunity_id,[]);
    byOpportunity.get(row.opportunity_id).push(row);
  }

  const caps={REEL:2,STORIES:3,THREADS:2};
  for(const channel of CHANNELS){
    if(byChannel[channel].length>caps[channel])throw new Error('SOCIAL_DIRECTOR_CHANNEL_ASSIGNMENT_CAP_EXCEEDED');
    const leadCount=byChannel[channel].filter(x=>x.assignment_role==='LEAD').length;
    if(leadCount>1)throw new Error('SOCIAL_DIRECTOR_MULTIPLE_CHANNEL_LEADS');
  }

  for(const list of byOpportunity.values()){
    if(list.filter(x=>x.assignment_role==='LEAD').length!==1){
      throw new Error('SOCIAL_DIRECTOR_OPPORTUNITY_REQUIRES_ONE_LEAD');
    }
    if(new Set(list.map(x=>normKey(x.angle_key))).size!==list.length){
      throw new Error('SOCIAL_DIRECTOR_CROSS_CHANNEL_ANGLE_DUPLICATE');
    }
    if(new Set(list.map(x=>normKey(x.message_key))).size!==list.length){
      throw new Error('SOCIAL_DIRECTOR_CROSS_CHANNEL_MESSAGE_DUPLICATE');
    }
    if(new Set(list.map(x=>normKey(x.claim_focus))).size!==list.length){
      throw new Error('SOCIAL_DIRECTOR_CROSS_CHANNEL_CLAIM_DUPLICATE');
    }
  }

  const total=rows.reduce((s,x)=>s+x.estimated_work_minutes,0);
  if(Number.isFinite(Number(budget))&&total>Number(budget)){
    throw new Error('SOCIAL_DIRECTOR_WORKLOAD_BUDGET_EXCEEDED');
  }

  return {
    total_assignments:rows.length,
    assignments_by_channel:Object.fromEntries(CHANNELS.map(ch=>[ch,byChannel[ch].length])),
    opportunities_used:byOpportunity.size,
    estimated_workload_minutes:total,
    checks:{
      one_lead_per_opportunity:true,
      channel_caps:true,
      distinct_angle_per_opportunity:true,
      distinct_message_per_opportunity:true,
      distinct_claim_focus_per_opportunity:true,
      workload_budget_ok:true
    }
  };
}

export async function getSocialDirectorContext({supabase,targetDate,runMode='SHADOW'}){
  const opportunityContext=await loadOpportunityContext({supabase,targetDate});
  const mode=t(runMode||'SHADOW',40).toUpperCase();

  const [reelRun,storyRun,threadPlan]=await Promise.all([
    supabase.from('social_reel_evidence_runs').select('*').eq('target_date',targetDate).eq('run_mode',mode).maybeSingle(),
    supabase.from('social_story_evidence_runs').select('*').eq('target_date',targetDate).eq('run_mode',mode).maybeSingle(),
    supabase.from('social_thread_daily_plans').select('*').eq('target_date',targetDate).maybeSingle()
  ]);
  if(reelRun.error||storyRun.error||threadPlan.error)throw new Error('SOCIAL_DIRECTOR_CONTEXT_READ_FAILED');

  const learnings=await supabase.from('social_production_learnings').select('*')
    .in('status',['ACTIVE','CANDIDATE'])
    .order('reuse_weight',{ascending:false}).order('updated_at',{ascending:false}).limit(120);
  if(learnings.error)throw new Error('SOCIAL_DIRECTOR_LEARNING_READ_FAILED');

  const portfolio=await pollSocialPortfolioSnapshot({supabase,targetDate});

  return {
    target_date:targetDate,
    run_mode:mode,
    opportunity_plan:opportunityContext.plan,
    opportunities:opportunityContext.opportunities,
    current_outputs:{
      reel_run:reelRun.data||null,
      story_run:storyRun.data||null,
      thread_plan:threadPlan.data||null
    },
    learning_context:{
      active:(learnings.data||[]).filter(x=>x.status==='ACTIVE'),
      candidates:(learnings.data||[]).filter(x=>x.status==='CANDIDATE'),
      rule:'ACTIVE may influence reusable channel strategy; CANDIDATE is lower-weight evidence and must not become a hard rule.'
    },
    portfolio_context:{
      snapshot:portfolio.snapshot,
      items:portfolio.items,
      rankings:portfolio.rankings,
      rule:'Marketing Portfolio is a strategic signal. It can promote/demote attention, but never upgrades Evidence Strength and never forces a fixed content quota.'
    },
    channel_jobs:Object.fromEntries(
      Object.entries(CHANNEL_JOBS).map(([k,v])=>[k,[...v]])
    ),
    rules:{
      one_lead_per_opportunity:true,
      max_assignments:{REEL:2,STORIES:3,THREADS:2},
      same_opportunity_requires_distinct_angle_message_claim:true,
      exploratory_cannot_be_ready:true,
      channel_hold_is_valid:true,
      human_approval_required:true,
      portfolio_is_strategic_signal_not_quota:true
    }
  };
}

export async function pollSocialDirectorPlan({supabase,targetDate,runMode='SHADOW'}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const mode=t(runMode||'SHADOW',40).toUpperCase();
  const plan=await supabase.from('social_director_daily_plans').select('*')
    .eq('target_date',targetDate).eq('run_mode',mode).maybeSingle();
  if(plan.error)throw new Error('SOCIAL_DIRECTOR_PLAN_READ_FAILED');
  if(!plan.data)return {plan:null,assignments:[]};
  const rows=await supabase.from('social_director_channel_assignments').select('*')
    .eq('plan_id',plan.data.id).order('channel',{ascending:true}).order('priority',{ascending:true});
  if(rows.error)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_READ_FAILED');
  return {plan:plan.data,assignments:rows.data||[]};
}

export async function prepareSocialDirectorPlan({
  supabase,targetDate,assignments=[],channelStates={},workloadBudgetMinutes,
  sourceContext={},portfolioDecision={},runMode='SHADOW',holdReason,replaceExisting=false
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const mode=t(runMode||'SHADOW',40).toUpperCase();
  if(!['SHADOW','PRODUCTION'].includes(mode))throw new Error('SOCIAL_DIRECTOR_RUN_MODE_INVALID');

  const context=await loadOpportunityContext({supabase,targetDate});
  const portfolio=await pollSocialPortfolioSnapshot({supabase,targetDate});
  const portfolioRequired=obj(sourceContext).portfolio_required===true;
  let normalizedPortfolioDecision={};
  if(portfolioRequired){
    if(!portfolio.snapshot||portfolio.snapshot.status!=='READY'){
      throw new Error('SOCIAL_PORTFOLIO_SNAPSHOT_REQUIRED');
    }
    if((portfolio.rankings||[]).length!==(context.opportunities||[]).length){
      throw new Error('SOCIAL_PORTFOLIO_RANKINGS_REQUIRED');
    }
    const availableKeys=new Set((portfolio.items||[]).map(x=>x.inventory_key));
    normalizedPortfolioDecision=normalizePortfolioDecision(portfolioDecision,availableKeys);
  } else if(portfolio.snapshot&&Object.keys(obj(portfolioDecision)).length){
    const availableKeys=new Set((portfolio.items||[]).map(x=>x.inventory_key));
    normalizedPortfolioDecision=normalizePortfolioDecision(portfolioDecision,availableKeys);
  }

  const existing=await supabase.from('social_director_daily_plans').select('*')
    .eq('target_date',targetDate).eq('run_mode',mode).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_DIRECTOR_PLAN_READ_FAILED');
  if(existing.data&&!replaceExisting)return pollSocialDirectorPlan({supabase,targetDate,runMode:mode});

  if(holdReason){
    const plan=await supabase.from('social_director_daily_plans').upsert({
      target_date:targetDate,run_mode:mode,planner_version:portfolioRequired?'v1.0.1':'v0.9',
      opportunity_plan_id:context.plan.id,
      portfolio_snapshot_id:portfolio.snapshot?.id||null,
      portfolio_decision:normalizedPortfolioDecision,
      status:'HOLD',
      channel_states:{REEL:{status:'HOLD'},STORIES:{status:'HOLD'},THREADS:{status:'HOLD'}},
      workload_budget_minutes:Number.isFinite(Number(workloadBudgetMinutes))?Number(workloadBudgetMinutes):null,
      estimated_workload_minutes:0,cross_channel_qc:{decision:'HOLD'},
      source_context:obj(sourceContext),hold_reason:t(holdReason,5000),
      updated_at:new Date().toISOString()
    },{onConflict:'target_date,run_mode'}).select('*').single();
    if(plan.error||!plan.data)throw new Error('SOCIAL_DIRECTOR_PLAN_UPSERT_FAILED');
    await supabase.from('social_director_channel_assignments').delete().eq('plan_id',plan.data.id);
    return {plan:plan.data,assignments:[]};
  }

  const opMap=new Map(context.opportunities.map(x=>[x.id,x]));
  const normalized=arr(assignments).map(x=>normalizeDirectorAssignment(x,opMap));
  if(!normalized.length)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENTS_REQUIRED');

  const seen=new Set();
  for(const row of normalized){
    const key=`${row.channel}:${row.priority}`;
    if(seen.has(key))throw new Error('SOCIAL_DIRECTOR_CHANNEL_PRIORITY_DUPLICATE');
    seen.add(key);
  }

  const qc=validateDirectorAssignmentSet(normalized,workloadBudgetMinutes);
  const states=normalizeChannelStates(channelStates,normalized);
  const hasReview=normalized.some(x=>x.qc_decision==='REVIEW_REQUIRED');
  const status=hasReview?'REVIEW_REQUIRED':'READY';

  const plan=await supabase.from('social_director_daily_plans').upsert({
    target_date:targetDate,run_mode:mode,planner_version:portfolioRequired?'v1.0.1':'v0.9',
    opportunity_plan_id:context.plan.id,
    portfolio_snapshot_id:portfolio.snapshot?.id||null,
    portfolio_decision:normalizedPortfolioDecision,
    status,
    channel_states:states,
    workload_budget_minutes:Number.isFinite(Number(workloadBudgetMinutes))?Number(workloadBudgetMinutes):null,
    estimated_workload_minutes:qc.estimated_workload_minutes,
    cross_channel_qc:{decision:hasReview?'REVIEW_REQUIRED':'PASS',...qc},
    source_context:obj(sourceContext),hold_reason:null,updated_at:new Date().toISOString()
  },{onConflict:'target_date,run_mode'}).select('*').single();
  if(plan.error||!plan.data)throw new Error('SOCIAL_DIRECTOR_PLAN_UPSERT_FAILED');

  const reset=await supabase.from('social_director_channel_assignments').delete().eq('plan_id',plan.data.id);
  if(reset.error)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_RESET_FAILED');

  const inserted=await supabase.from('social_director_channel_assignments').insert(
    normalized.map(x=>({plan_id:plan.data.id,...x}))
  ).select('*');
  if(inserted.error)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_INSERT_FAILED');

  return {plan:plan.data,assignments:inserted.data||[]};
}

export async function getDirectorAssignmentsForChannel({
  supabase,targetDate,runMode='SHADOW',channel,required=false
}){
  const current=await pollSocialDirectorPlan({supabase,targetDate,runMode});
  if(!current.plan){
    if(required)throw new Error('SOCIAL_DIRECTOR_PLAN_REQUIRED');
    return null;
  }
  if(!['READY','REVIEW_REQUIRED'].includes(current.plan.status)){
    if(required)throw new Error('SOCIAL_DIRECTOR_PLAN_NOT_READY');
    return null;
  }
  const ch=t(channel,40).toUpperCase();
  const list=current.assignments.filter(x=>x.channel===ch&&!['BLOCKED','HOLD'].includes(x.qc_decision));
  const state=obj(current.plan.channel_states)[ch]||{};
  if(state.status==='HOLD')return {plan:current.plan,assignments:[]};
  if(required&&!list.length)throw new Error('SOCIAL_DIRECTOR_CHANNEL_ASSIGNMENT_REQUIRED');
  return {plan:current.plan,assignments:list};
}

export async function evaluateSocialDirectorOutputs({
  supabase,targetDate,runMode='SHADOW'
}){
  const current=await pollSocialDirectorPlan({supabase,targetDate,runMode});
  if(!current.plan)throw new Error('SOCIAL_DIRECTOR_PLAN_NOT_FOUND');

  const assignmentById=new Map(current.assignments.map(x=>[x.id,x]));
  const findings=[];
  const counts={REEL:0,STORIES:0,THREADS:0};

  const reelRun=await supabase.from('social_reel_evidence_runs').select('*')
    .eq('target_date',targetDate).eq('run_mode',runMode).maybeSingle();
  if(reelRun.error)throw new Error('SOCIAL_DIRECTOR_OUTPUT_READ_FAILED');
  if(reelRun.data){
    const rows=await supabase.from('social_reel_evidence_candidates').select('*')
      .eq('run_id',reelRun.data.id);
    if(rows.error)throw new Error('SOCIAL_DIRECTOR_OUTPUT_READ_FAILED');
    for(const row of rows.data||[]){
      if(row.qc_decision!=='READY_FOR_APPROVAL')continue;
      counts.REEL++;
      const a=assignmentById.get(row.director_assignment_id);
      if(!a||a.channel!=='REEL'||a.opportunity_id!==row.opportunity_id){
        findings.push({severity:'BLOCKER',code:'REEL_ASSIGNMENT_LINEAGE_INVALID',output_id:row.id});
      }
    }
  }

  const storyRun=await supabase.from('social_story_evidence_runs').select('*')
    .eq('target_date',targetDate).eq('run_mode',runMode).maybeSingle();
  if(storyRun.error)throw new Error('SOCIAL_DIRECTOR_OUTPUT_READ_FAILED');
  if(storyRun.data){
    const rows=await supabase.from('social_story_evidence_items').select('*')
      .eq('run_id',storyRun.data.id);
    if(rows.error)throw new Error('SOCIAL_DIRECTOR_OUTPUT_READ_FAILED');
    for(const row of rows.data||[]){
      if(row.qc_decision!=='READY_FOR_APPROVAL')continue;
      counts.STORIES++;
      const a=assignmentById.get(row.director_assignment_id);
      if(!a||a.channel!=='STORIES'||a.opportunity_id!==row.opportunity_id){
        findings.push({severity:'BLOCKER',code:'STORY_ASSIGNMENT_LINEAGE_INVALID',output_id:row.id});
      }
    }
  }

  const threadPlan=await supabase.from('social_thread_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(threadPlan.error)throw new Error('SOCIAL_DIRECTOR_OUTPUT_READ_FAILED');
  if(threadPlan.data){
    const rows=await supabase.from('social_thread_candidates').select('*')
      .eq('plan_id',threadPlan.data.id);
    if(rows.error)throw new Error('SOCIAL_DIRECTOR_OUTPUT_READ_FAILED');
    for(const row of rows.data||[]){
      if(row.qc_decision!=='READY_FOR_APPROVAL')continue;
      counts.THREADS++;
      const a=assignmentById.get(row.director_assignment_id);
      if(!a||a.channel!=='THREADS'||a.opportunity_id!==row.opportunity_id){
        findings.push({severity:'BLOCKER',code:'THREAD_ASSIGNMENT_LINEAGE_INVALID',output_id:row.id});
      }
    }
  }

  const blockers=findings.filter(x=>x.severity==='BLOCKER');
  const result={
    decision:blockers.length?'FAIL':'PASS',
    output_counts:counts,
    findings,
    checked_at:new Date().toISOString()
  };

  const updated=await supabase.from('social_director_daily_plans').update({
    cross_channel_qc:{...obj(current.plan.cross_channel_qc),output_validation:result},
    status:blockers.length?'REVIEW_REQUIRED':current.plan.status,
    updated_at:new Date().toISOString()
  }).eq('id',current.plan.id).select('*').single();
  if(updated.error)throw new Error('SOCIAL_DIRECTOR_PLAN_UPDATE_FAILED');

  return {plan:updated.data,assignments:current.assignments,validation:result};
}
