import {normalizeCustomerSignal,normalizeThreadEvidence,normalizeThreadCandidate} from './socialThreadModel.mjs';

const arr=v=>Array.isArray(v)?v:[];
const t=(v,n=8000)=>String(v??'').trim().slice(0,n);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

async function getPlan({supabase,targetDate}){
  const r=await supabase.from('social_thread_daily_plans').select('*').eq('target_date',targetDate).maybeSingle();
  if(r.error)throw new Error('SOCIAL_THREAD_PLAN_READ_FAILED');
  return r.data||null;
}

export async function ingestCustomerSignals({supabase,signals=[]}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const list=arr(signals);
  if(!list.length||list.length>50)throw new Error('SOCIAL_CUSTOMER_SIGNAL_COUNT_INVALID');
  const r=await supabase.from('social_customer_signals').insert(list.map(normalizeCustomerSignal)).select('*');
  if(r.error)throw new Error('SOCIAL_CUSTOMER_SIGNAL_INSERT_FAILED');
  return r.data||[];
}

export async function listCustomerSignals({supabase,days=120,limit=100}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const since=new Date(Date.now()-Math.max(1,Math.min(Number(days)||120,730))*86400000).toISOString();
  const r=await supabase.from('social_customer_signals').select('*')
    .gte('observed_at',since).order('observed_at',{ascending:false}).limit(Math.max(1,Math.min(Number(limit)||100,300)));
  if(r.error)throw new Error('SOCIAL_CUSTOMER_SIGNAL_READ_FAILED');
  return r.data||[];
}

export async function pollThreadPlan({supabase,targetDate}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const plan=await getPlan({supabase,targetDate});
  if(!plan)return {plan:null,evidence:[],candidates:[],links:[]};
  const evidence=await supabase.from('social_thread_evidence').select('*').eq('plan_id',plan.id)
    .order('decision_relevance',{ascending:false}).order('confidence',{ascending:false});
  if(evidence.error)throw new Error('SOCIAL_THREAD_EVIDENCE_READ_FAILED');
  const candidates=await supabase.from('social_thread_candidates').select('*').eq('plan_id',plan.id)
    .order('candidate_no',{ascending:true});
  if(candidates.error)throw new Error('SOCIAL_THREAD_CANDIDATE_READ_FAILED');
  const ids=(candidates.data||[]).map(x=>x.id);
  let links=[];
  if(ids.length){
    const r=await supabase.from('social_thread_candidate_evidence').select('*').in('candidate_id',ids);
    if(r.error)throw new Error('SOCIAL_THREAD_EVIDENCE_LINK_READ_FAILED');
    links=r.data||[];
  }
  return {plan,evidence:evidence.data||[],candidates:candidates.data||[],links};
}

export async function prepareThreadPlan({
  supabase,targetDate,evidence=[],candidates=[],primaryTheme,sourceContext={},holdReason,replaceOpen=false
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');

  const existing=await getPlan({supabase,targetDate});
  const state=String(existing?.status||'').toUpperCase();
  if(existing&&['SELECTED','PUBLISHED_VERIFIED'].includes(state))return pollThreadPlan({supabase,targetDate});
  if(existing&&['OPEN','READY','HOLD'].includes(state)&&replaceOpen!==true){
    const current=await pollThreadPlan({supabase,targetDate});
    if(state==='HOLD'||current.candidates.length)return current;
  }

  const planWrite=async status=>{
    const r=await supabase.from('social_thread_daily_plans').upsert({
      target_date:targetDate,status,primary_theme:t(primaryTheme,500)||null,
      source_context:obj(sourceContext),hold_reason:holdReason?t(holdReason,5000):null,
      selected_candidate_id:null,updated_at:new Date().toISOString()
    },{onConflict:'target_date'}).select('*').single();
    if(r.error||!r.data)throw new Error('SOCIAL_THREAD_PLAN_UPSERT_FAILED');
    return r.data;
  };

  if(holdReason){
    const plan=await planWrite('HOLD');
    await supabase.from('social_thread_candidates').delete().eq('plan_id',plan.id).in('status',['CANDIDATE','REJECTED']);
    await supabase.from('social_thread_evidence').delete().eq('plan_id',plan.id);
    return {plan,evidence:[],candidates:[],links:[]};
  }

  const evList=arr(evidence);
  const candList=arr(candidates);
  if(evList.length<1||evList.length>100)throw new Error('SOCIAL_THREAD_EVIDENCE_COUNT_INVALID');
  if(candList.length<1||candList.length>5)throw new Error('SOCIAL_THREAD_CANDIDATE_COUNT_INVALID');

  const normalizedEvidence=evList.map(normalizeThreadEvidence);
  const keys=new Set(normalizedEvidence.map(x=>x.evidence_key));
  if(keys.size!==normalizedEvidence.length)throw new Error('SOCIAL_THREAD_EVIDENCE_KEY_DUPLICATE');
  const normalizedCandidates=candList.map((x,i)=>normalizeThreadCandidate(x,i+1,keys));

  const plan=await planWrite('READY');
  const resetCandidates=await supabase.from('social_thread_candidates').delete().eq('plan_id',plan.id).in('status',['CANDIDATE','REJECTED']);
  if(resetCandidates.error)throw new Error('SOCIAL_THREAD_CANDIDATE_RESET_FAILED');
  const resetEvidence=await supabase.from('social_thread_evidence').delete().eq('plan_id',plan.id);
  if(resetEvidence.error)throw new Error('SOCIAL_THREAD_EVIDENCE_RESET_FAILED');

  const ev=await supabase.from('social_thread_evidence').insert(normalizedEvidence.map(x=>({plan_id:plan.id,...x}))).select('*');
  if(ev.error)throw new Error('SOCIAL_THREAD_EVIDENCE_INSERT_FAILED');
  const byKey=new Map((ev.data||[]).map(x=>[x.evidence_key,x]));

  const cand=await supabase.from('social_thread_candidates').insert(
    normalizedCandidates.map(x=>({plan_id:plan.id,...x.row}))
  ).select('*');
  if(cand.error)throw new Error('SOCIAL_THREAD_CANDIDATE_INSERT_FAILED');

  const links=[];
  for(let i=0;i<(cand.data||[]).length;i++){
    for(const link of normalizedCandidates[i].links){
      const e=byKey.get(link.key);
      if(e)links.push({candidate_id:cand.data[i].id,evidence_id:e.id,evidence_role:link.role});
    }
  }
  const linked=links.length?await supabase.from('social_thread_candidate_evidence').insert(links).select('*'):{data:[],error:null};
  if(linked.error)throw new Error('SOCIAL_THREAD_EVIDENCE_LINK_INSERT_FAILED');
  return {plan,evidence:ev.data||[],candidates:cand.data||[],links:linked.data||[]};
}

export async function chooseThreadCandidate({supabase,targetDate,candidateNo}){
  const current=await pollThreadPlan({supabase,targetDate});
  if(!current.plan)throw new Error('SOCIAL_THREAD_PLAN_NOT_FOUND');
  const selected=current.candidates.find(x=>x.candidate_no===Number(candidateNo));
  if(!selected)throw new Error('SOCIAL_THREAD_CANDIDATE_NOT_FOUND');
  if(selected.qc_decision!=='READY_FOR_APPROVAL'||selected.evidence_strength==='UNGROUNDED'){
    throw new Error('SOCIAL_THREAD_CANDIDATE_NOT_APPROVABLE');
  }
  const now=new Date().toISOString();
  const reject=await supabase.from('social_thread_candidates').update({status:'REJECTED'})
    .eq('plan_id',current.plan.id).neq('id',selected.id).in('status',['CANDIDATE','REJECTED']);
  if(reject.error)throw new Error('SOCIAL_THREAD_CANDIDATE_REJECT_FAILED');
  const chosen=await supabase.from('social_thread_candidates').update({status:'SELECTED',selected_at:now})
    .eq('id',selected.id).select('*').single();
  if(chosen.error)throw new Error('SOCIAL_THREAD_CANDIDATE_SELECT_FAILED');
  const plan=await supabase.from('social_thread_daily_plans').update({
    status:'SELECTED',selected_candidate_id:selected.id,updated_at:now
  }).eq('id',current.plan.id).select('*').single();
  if(plan.error)throw new Error('SOCIAL_THREAD_PLAN_SELECT_FAILED');
  return {plan:plan.data,selected:chosen.data};
}

export async function listThreadPlans({supabase,days=30,limit=60}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const since=new Date(Date.now()-Math.max(1,Math.min(Number(days)||30,365))*86400000).toISOString().slice(0,10);
  const r=await supabase.from('social_thread_daily_plans').select('*').gte('target_date',since)
    .order('target_date',{ascending:false}).limit(Math.max(1,Math.min(Number(limit)||60,200)));
  if(r.error)throw new Error('SOCIAL_THREAD_PLAN_READ_FAILED');
  const out=[];
  for(const p of r.data||[])out.push(await pollThreadPlan({supabase,targetDate:p.target_date}));
  return out;
}

export async function linkVerifiedThreadPublication({supabase,targetDate,candidateNo,platformMediaId,platform='THREADS'}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const media=t(platformMediaId,300);
  if(!media)throw new Error('SOCIAL_MEDIA_ID_REQUIRED');
  const current=await pollThreadPlan({supabase,targetDate});
  if(!current.plan)throw new Error('SOCIAL_THREAD_PLAN_NOT_FOUND');
  const candidate=current.candidates.find(x=>x.candidate_no===Number(candidateNo));
  if(!candidate)throw new Error('SOCIAL_THREAD_CANDIDATE_NOT_FOUND');

  const post=await supabase.from('social_published_posts').select('*')
    .eq('platform',t(platform,40).toUpperCase()).eq('platform_media_id',media).maybeSingle();
  if(post.error)throw new Error('SOCIAL_HISTORY_READ_FAILED');
  if(!post.data)throw new Error('SOCIAL_PUBLISHED_EVIDENCE_REQUIRED');

  const linked=await supabase.from('social_published_posts').update({
    thread_candidate_id:candidate.id,last_synced_at:new Date().toISOString()
  }).eq('id',post.data.id).select('*').single();
  if(linked.error)throw new Error('SOCIAL_THREAD_PUBLICATION_LINK_FAILED');

  const c=await supabase.from('social_thread_candidates').update({status:'PUBLISHED_VERIFIED'})
    .eq('id',candidate.id).select('*').single();
  if(c.error)throw new Error('SOCIAL_THREAD_STATUS_UPDATE_FAILED');
  const p=await supabase.from('social_thread_daily_plans').update({
    status:'PUBLISHED_VERIFIED',selected_candidate_id:candidate.id,updated_at:new Date().toISOString()
  }).eq('id',current.plan.id).select('*').single();
  if(p.error)throw new Error('SOCIAL_THREAD_PLAN_UPDATE_FAILED');
  return {plan:p.data,candidate:c.data,post:linked.data};
}

export async function getThreadsRuntimeContext({supabase,days=90}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const d=Math.max(7,Math.min(Number(days)||90,365));
  const [customer_signals,thread_plans]=await Promise.all([
    listCustomerSignals({supabase,days:d,limit:120}),
    listThreadPlans({supabase,days:d,limit:60})
  ]);
  const since=new Date(Date.now()-d*86400000).toISOString();
  const posts=await supabase.from('social_published_posts').select('*').eq('platform','THREADS')
    .gte('published_at',since).order('published_at',{ascending:false}).limit(100);
  if(posts.error)throw new Error('SOCIAL_HISTORY_READ_FAILED');
  const ids=(posts.data||[]).map(x=>x.id);
  const latest={};
  if(ids.length){
    const m=await supabase.from('social_post_metrics').select('*').in('post_id',ids).order('observed_at',{ascending:false});
    if(m.error)throw new Error('SOCIAL_METRIC_READ_FAILED');
    for(const row of m.data||[])if(!latest[row.post_id])latest[row.post_id]=row;
  }
  return {customer_signals,thread_plans,published_threads:(posts.data||[]).map(x=>({...x,latest_metrics:latest[x.id]||null}))};
}
