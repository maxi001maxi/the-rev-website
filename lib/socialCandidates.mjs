const t=(v,n=4000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const num=v=>v===''||v===null||v===undefined?null:(Number.isFinite(Number(v))?Number(v):null);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

function normalizeCandidate(input={},no){
  const title=t(input.title||input.title_candidate,500);
  if(!title)throw new Error('SOCIAL_CANDIDATE_TITLE_REQUIRED');
  return {
    candidate_no:no,
    title,
    territory:t(input.territory||'WILDCARD',120)||'WILDCARD',
    business_job:nt(input.business_job,120),
    audience_state:nt(input.audience_state,120),
    hook:nt(input.hook,2000),
    why_now:nt(input.why_now,4000),
    difference_from_history:nt(input.difference_from_history||input.unique_angle,4000),
    asset_plan:nt(input.asset_plan,2000),
    estimated_shoot_minutes:num(input.estimated_shoot_minutes),
    score:num(input.score),
    status:'CANDIDATE',
    production_plan:obj(input.production_plan)
  };
}

export async function prepareSocialCandidates({supabase,targetDate,phase='STORE_AWARENESS_BUILD',candidates=[],sourceContext={}}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  if(!Array.isArray(candidates)||candidates.length!==5)throw new Error('SOCIAL_FIVE_CANDIDATES_REQUIRED');

  const existing=await supabase.from('social_reel_candidate_batches').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_BATCH_READ_FAILED');
  if(['SELECTED','READY','CREATED','SHOT','PUBLISHED'].includes(String(existing.data?.status||'').toUpperCase())){
    return pollSocialCandidates({supabase,targetDate});
  }

  const batch=await supabase.from('social_reel_candidate_batches').upsert({
    target_date:targetDate,phase:t(phase,120)||'STORE_AWARENESS_BUILD',status:'OPEN',
    source_context:obj(sourceContext),updated_at:new Date().toISOString()
  },{onConflict:'target_date'}).select('*').single();
  if(batch.error||!batch.data)throw new Error('SOCIAL_BATCH_UPSERT_FAILED');

  const reset=await supabase.from('social_reel_candidates').delete()
    .eq('batch_id',batch.data.id).neq('status','SELECTED');
  if(reset.error)throw new Error('SOCIAL_CANDIDATE_RESET_FAILED');

  const rows=candidates.map((c,i)=>({batch_id:batch.data.id,...normalizeCandidate(c,i+1)}));
  const inserted=await supabase.from('social_reel_candidates').insert(rows).select('*');
  if(inserted.error)throw new Error('SOCIAL_CANDIDATE_INSERT_FAILED');
  return {batch:batch.data,candidates:inserted.data||[]};
}

export async function pollSocialCandidates({supabase,targetDate}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const batch=await supabase.from('social_reel_candidate_batches').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(batch.error)throw new Error('SOCIAL_BATCH_READ_FAILED');
  if(!batch.data)return {batch:null,candidates:[]};
  const candidates=await supabase.from('social_reel_candidates').select('*')
    .eq('batch_id',batch.data.id).order('candidate_no',{ascending:true});
  if(candidates.error)throw new Error('SOCIAL_CANDIDATE_READ_FAILED');
  return {batch:batch.data,candidates:candidates.data||[]};
}

export async function chooseSocialCandidate({supabase,targetDate,candidateNo}){
  const current=await pollSocialCandidates({supabase,targetDate});
  if(!current.batch)throw new Error('SOCIAL_BATCH_NOT_FOUND');
  const no=Number(candidateNo);
  const selected=current.candidates.find(x=>x.candidate_no===no);
  if(!selected)throw new Error('SOCIAL_CANDIDATE_NOT_FOUND');
  const now=new Date().toISOString();

  const reject=await supabase.from('social_reel_candidates').update({status:'REJECTED'})
    .eq('batch_id',current.batch.id).neq('id',selected.id);
  if(reject.error)throw new Error('SOCIAL_CANDIDATE_REJECT_FAILED');

  const chosen=await supabase.from('social_reel_candidates')
    .update({status:'SELECTED',selected_at:now}).eq('id',selected.id).select('*').single();
  if(chosen.error)throw new Error('SOCIAL_CANDIDATE_SELECT_FAILED');

  const batch=await supabase.from('social_reel_candidate_batches')
    .update({status:'SELECTED',selected_candidate_id:selected.id,updated_at:now})
    .eq('id',current.batch.id).select('*').single();
  if(batch.error)throw new Error('SOCIAL_BATCH_SELECT_FAILED');
  return {batch:batch.data,selected:chosen.data};
}

export async function acknowledgeSocialCandidateNotification({supabase,targetDate,status}){
  const row=await supabase.from('social_reel_candidate_batches').update({
    notification_status:t(status||'UNKNOWN',80),notified_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq('target_date',targetDate).select('*').single();
  if(row.error)throw new Error('SOCIAL_NOTIFICATION_ACK_FAILED');
  return row.data;
}
