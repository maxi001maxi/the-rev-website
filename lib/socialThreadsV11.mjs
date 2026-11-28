import {THREADS_V11,validateThreadsOperationsV11} from './socialThreadParticipationV11.mjs';

const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const text=v=>String(v??'').trim();
const mode=v=>{
  const m=text(v||'SHADOW').toUpperCase();
  if(!['SHADOW','PRODUCTION'].includes(m))throw new Error('SOCIAL_THREADS_V11_RUN_MODE_INVALID');
  return m;
};
const storageKey=m=>m==='PRODUCTION'?'threads_v11':'threads_v11_shadow';

function normalizeDecision(decision={},runMode){
  return {
    ...obj(decision),
    version:THREADS_V11,
    run_mode:runMode,
    measurement_windows:[7,30],
    one_post_rule_promotion:false,
    human_approval_required:true,
    auto_reply:false,
    auto_publish:false
  };
}

export async function prepareThreadsV11Decision({supabase,targetDate,decision={},runMode='SHADOW'}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const m=mode(runMode);
  const normalized=normalizeDecision(decision,m);
  const validation=validateThreadsOperationsV11(normalized);
  const packet={...normalized,validation,prepared_at:new Date().toISOString()};

  if(m==='SHADOW'){
    const receipt=await supabase.from('social_ai_runs').select('*')
      .eq('run_date',targetDate).eq('run_mode','PRODUCTION').maybeSingle();
    if(receipt.error)throw new Error('SOCIAL_THREADS_V11_RUN_RECEIPT_READ_FAILED');
    if(!receipt.data)throw new Error('SOCIAL_THREADS_V11_RUN_RECEIPT_REQUIRED');
    const runMemory={...obj(receipt.data.run_memory),[storageKey(m)]:packet};
    const updated=await supabase.from('social_ai_runs').update({
      run_memory:runMemory,updated_at:new Date().toISOString()
    }).eq('id',receipt.data.id).select('*').single();
    if(updated.error||!updated.data)throw new Error('SOCIAL_THREADS_V11_SHADOW_PERSIST_FAILED');
    return {decision:packet,storage:'social_ai_runs.run_memory.threads_v11_shadow',receipt:updated.data};
  }

  const existing=await supabase.from('social_thread_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_THREADS_V11_PLAN_READ_FAILED');

  const prior=obj(existing.data?.source_context);
  const protectedState=['SELECTED','PUBLISHED_VERIFIED'].includes(String(existing.data?.status||'').toUpperCase());
  if(protectedState&&obj(prior.threads_v11).version===THREADS_V11){
    return {decision:prior.threads_v11,storage:'social_thread_daily_plans.source_context.threads_v11',plan:existing.data,reused:true};
  }

  const status=normalized.daily_mode==='HOLD'?'HOLD':'READY';
  const sourceContext={...prior,threads_v11:packet};
  const row={
    target_date:targetDate,
    status:protectedState?existing.data.status:status,
    primary_theme:existing.data?.primary_theme||text(normalized.primary_theme)||'Threads v1.1 daily participation decision',
    source_context:sourceContext,
    hold_reason:protectedState?existing.data.hold_reason:(normalized.daily_mode==='HOLD'?text(normalized.hold_reason):null),
    selected_candidate_id:existing.data?.selected_candidate_id||null,
    updated_at:new Date().toISOString()
  };
  const saved=await supabase.from('social_thread_daily_plans').upsert(row,{onConflict:'target_date'}).select('*').single();
  if(saved.error||!saved.data)throw new Error('SOCIAL_THREADS_V11_PLAN_PERSIST_FAILED');
  return {decision:packet,storage:'social_thread_daily_plans.source_context.threads_v11',plan:saved.data,reused:false};
}

export async function pollThreadsV11Decision({supabase,targetDate,runMode='SHADOW'}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const m=mode(runMode);
  if(m==='SHADOW'){
    const receipt=await supabase.from('social_ai_runs').select('*')
      .eq('run_date',targetDate).eq('run_mode','PRODUCTION').maybeSingle();
    if(receipt.error)throw new Error('SOCIAL_THREADS_V11_RUN_RECEIPT_READ_FAILED');
    return {decision:obj(receipt.data?.run_memory)[storageKey(m)]||null,receipt:receipt.data||null};
  }
  const plan=await supabase.from('social_thread_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(plan.error)throw new Error('SOCIAL_THREADS_V11_PLAN_READ_FAILED');
  return {decision:obj(plan.data?.source_context)[storageKey(m)]||null,plan:plan.data||null};
}

export async function approveThreadsV11Participation({supabase,targetDate,opportunityKey}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const current=await pollThreadsV11Decision({supabase,targetDate,runMode:'PRODUCTION'});
  if(!current.plan||!current.decision)throw new Error('SOCIAL_THREADS_V11_DECISION_NOT_FOUND');
  const key=text(opportunityKey);
  const selected=(Array.isArray(current.decision.participation_opportunities)?current.decision.participation_opportunities:[])
    .find(x=>text(x?.opportunity_key)===key&&text(x?.decision)==='SELECT');
  if(!selected)throw new Error('SOCIAL_THREADS_V11_PARTICIPATION_NOT_SELECTED');
  if(current.decision.conversation_source_status!=='FRESH')throw new Error('SOCIAL_THREADS_V11_FRESH_SOURCE_REQUIRED');

  const now=new Date().toISOString();
  const packet={
    ...current.decision,
    human_approval:{
      status:'APPROVED',
      opportunity_key:key,
      approved_at:now
    }
  };
  const sourceContext={...obj(current.plan.source_context),threads_v11:packet};
  const updated=await supabase.from('social_thread_daily_plans').update({
    source_context:sourceContext,updated_at:now
  }).eq('id',current.plan.id).select('*').single();
  if(updated.error||!updated.data)throw new Error('SOCIAL_THREADS_V11_APPROVAL_PERSIST_FAILED');
  return {plan:updated.data,decision:packet,approved:selected,send_performed:false};
}
