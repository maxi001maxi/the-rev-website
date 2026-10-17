const t=(v,n=12000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

const CHANNELS=new Set(['REEL','STORIES','THREADS']);
const ROLES=new Set(['PRIMARY','CORROBORATING','COUNTEREVIDENCE']);
const STRENGTHS=new Set(['GROUNDED','EXPLORATORY','UNGROUNDED']);
const CONFIDENCE=new Set(['HIGH','MEDIUM','LOW']);
const QC=new Set(['READY','REVIEW_REQUIRED','BLOCKED','HOLD']);

function texts(v,max=30,n=1000){
  return arr(v).map(x=>t(x,n)).filter(Boolean).slice(0,max);
}

function channelScores(value){
  const source=obj(value);
  const out={};
  for(const channel of CHANNELS){
    const n=Number(source[channel]);
    if(Number.isFinite(n))out[channel]=Math.max(0,Math.min(100,n));
  }
  return out;
}

export function normalizeSocialOpportunity(input={},opportunityNo,evidenceKeys=new Set()){
  const title=t(input.title,500);
  const business_problem=t(input.business_problem,1000);
  const why_now=t(input.why_now,5000);
  const evidence_strength=t(input.evidence_strength||'UNGROUNDED',40).toUpperCase();
  const confidence=t(input.confidence||'LOW',40).toUpperCase();
  const qc_decision=t(input.qc_decision||'REVIEW_REQUIRED',80).toUpperCase();

  if(!title)throw new Error('SOCIAL_OPPORTUNITY_TITLE_REQUIRED');
  if(!business_problem)throw new Error('SOCIAL_OPPORTUNITY_BUSINESS_PROBLEM_REQUIRED');
  if(!why_now)throw new Error('SOCIAL_OPPORTUNITY_WHY_NOW_REQUIRED');
  if(!STRENGTHS.has(evidence_strength))throw new Error('SOCIAL_OPPORTUNITY_EVIDENCE_STRENGTH_INVALID');
  if(!CONFIDENCE.has(confidence))throw new Error('SOCIAL_OPPORTUNITY_CONFIDENCE_INVALID');
  if(!QC.has(qc_decision))throw new Error('SOCIAL_OPPORTUNITY_QC_INVALID');

  const possible_channels=[...new Set(
    arr(input.possible_channels).map(x=>t(x,40).toUpperCase()).filter(x=>CHANNELS.has(x))
  )];
  if(!possible_channels.length)throw new Error('SOCIAL_OPPORTUNITY_CHANNEL_REQUIRED');

  const links=arr(input.evidence_links||input.evidence_refs).map(link=>{
    const key=t(link?.evidence_key||link?.key,300);
    const role=t(link?.role||'CORROBORATING',40).toUpperCase();
    if(!key||!evidenceKeys.has(key)||!ROLES.has(role))throw new Error('SOCIAL_OPPORTUNITY_EVIDENCE_LINK_INVALID');
    return {key,role};
  });
  if(!links.some(x=>x.role==='PRIMARY'))throw new Error('SOCIAL_OPPORTUNITY_PRIMARY_EVIDENCE_REQUIRED');
  if(evidence_strength==='UNGROUNDED'&&!['BLOCKED','HOLD'].includes(qc_decision)){
    throw new Error('SOCIAL_OPPORTUNITY_UNGROUNDED_MUST_BLOCK');
  }

  return {
    row:{
      opportunity_no:opportunityNo,
      title,
      business_problem,
      business_job:nt(input.business_job,120),
      primary_objective:nt(input.primary_objective,500),
      audience_state:nt(input.audience_state,120),
      why_now,
      observed_signal:nt(input.observed_signal,5000),
      interpretation:nt(input.interpretation,6000),
      hypothesis:nt(input.hypothesis,6000),
      expected_behavior:nt(input.expected_behavior,4000),
      confidence,
      evidence_strength,
      evidence_gaps:texts(input.evidence_gaps,20,1200),
      possible_channels,
      channel_scores:channelScores(input.channel_scores),
      test_metrics:texts(input.test_metrics,20,200),
      counterevidence_summary:nt(input.counterevidence_summary,5000),
      generalization_flags:texts(input.generalization_flags,20,500),
      qc_decision,
      status:'CANDIDATE',
      source_refs:texts(input.source_refs,30,1200),
      metadata:obj(input.metadata)
    },
    links
  };
}

export async function pollSocialOpportunities({supabase,targetDate}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const plan=await supabase.from('social_opportunity_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(plan.error)throw new Error('SOCIAL_OPPORTUNITY_PLAN_READ_FAILED');
  if(!plan.data)return {plan:null,opportunities:[]};

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

export async function prepareSocialOpportunities({
  supabase,targetDate,opportunities=[],primaryBusinessProblem,sourceContext={},holdReason,replaceOpen=false
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');

  const pool=await supabase.from('social_evidence_daily_pools').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(pool.error)throw new Error('SOCIAL_EVIDENCE_POOL_READ_FAILED');
  if(!pool.data||pool.data.status!=='READY'){
    if(!holdReason)throw new Error('SOCIAL_EVIDENCE_POOL_NOT_READY');
  }

  const existing=await supabase.from('social_opportunity_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_OPPORTUNITY_PLAN_READ_FAILED');
  const existingStatus=t(existing.data?.status,40).toUpperCase();
  if(existing.data&&['READY','HOLD'].includes(existingStatus))return pollSocialOpportunities({supabase,targetDate});
  if(existing.data&&existingStatus==='OPEN'&&replaceOpen!==true){
    const current=await pollSocialOpportunities({supabase,targetDate});
    if(current.opportunities.length)return current;
  }

  const list=arr(opportunities);
  if(!holdReason&&(list.length<1||list.length>5))throw new Error('SOCIAL_OPPORTUNITY_COUNT_INVALID');

  const plan=await supabase.from('social_opportunity_daily_plans').upsert({
    target_date:targetDate,
    evidence_pool_id:pool.data?.id||null,
    status:holdReason?'HOLD':'OPEN',
    primary_business_problem:nt(primaryBusinessProblem,1000),
    source_context:obj(sourceContext),
    hold_reason:holdReason?t(holdReason,4000):null,
    updated_at:new Date().toISOString()
  },{onConflict:'target_date'}).select('*').single();
  if(plan.error||!plan.data)throw new Error('SOCIAL_OPPORTUNITY_PLAN_UPSERT_FAILED');

  const reset=await supabase.from('social_opportunities').delete().eq('plan_id',plan.data.id);
  if(reset.error)throw new Error('SOCIAL_OPPORTUNITY_RESET_FAILED');
  if(holdReason)return {plan:{...plan.data,status:'HOLD'},opportunities:[]};

  const evidenceRows=await supabase.from('social_evidence_items').select('*').eq('pool_id',pool.data.id);
  if(evidenceRows.error)throw new Error('SOCIAL_EVIDENCE_ITEM_READ_FAILED');
  const evidenceMap=new Map((evidenceRows.data||[]).map(x=>[x.evidence_key,x]));
  const evidenceKeys=new Set(evidenceMap.keys());

  const normalized=list.map((item,i)=>normalizeSocialOpportunity(item,i+1,evidenceKeys));
  const inserted=await supabase.from('social_opportunities').insert(
    normalized.map(x=>({plan_id:plan.data.id,...x.row}))
  ).select('*');
  if(inserted.error)throw new Error('SOCIAL_OPPORTUNITY_INSERT_FAILED');

  const linkRows=[];
  for(const row of inserted.data||[]){
    const source=normalized.find((_,idx)=>idx+1===row.opportunity_no);
    for(const link of source?.links||[]){
      const ev=evidenceMap.get(link.key);
      if(ev)linkRows.push({opportunity_id:row.id,evidence_id:ev.id,evidence_role:link.role});
    }
  }
  if(linkRows.length){
    const links=await supabase.from('social_opportunity_evidence').insert(linkRows);
    if(links.error)throw new Error('SOCIAL_OPPORTUNITY_EVIDENCE_INSERT_FAILED');
  }

  const ready=await supabase.from('social_opportunity_daily_plans').update({
    status:'READY',hold_reason:null,updated_at:new Date().toISOString()
  }).eq('id',plan.data.id).select('*').single();
  if(ready.error)throw new Error('SOCIAL_OPPORTUNITY_PLAN_UPSERT_FAILED');

  return pollSocialOpportunities({supabase,targetDate});
}
