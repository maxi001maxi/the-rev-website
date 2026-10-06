const t=(v,n=12000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const arr=v=>Array.isArray(v)?v:[];

const EVENT_TYPES=new Set(['FINALIZED','CREATED','SHOT','FEEDBACK','PUBLISHED_VERIFIED']);
const LEARNING_TYPES=new Set(['USER_PREFERENCE','CREATIVE','EDITORIAL','QC','PERFORMANCE','BRAND']);
const LEARNING_SCOPES=new Set(['SHARED','STRATEGIST','CREATIVE_DIRECTOR','EDITOR','QC']);
const LEARNING_STATUSES=new Set(['CANDIDATE','ACTIVE','SUPERSEDED','RETIRED']);

function bounded01(v,fallback=0.5){
  const n=Number(v);
  if(!Number.isFinite(n))return fallback;
  return Math.max(0,Math.min(1,n));
}

async function getBatchAndCandidate({supabase,targetDate,candidateNo,candidateId}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(candidateId){
    const c=await supabase.from('social_reel_candidates').select('*').eq('id',candidateId).maybeSingle();
    if(c.error)throw new Error('SOCIAL_CANDIDATE_READ_FAILED');
    if(!c.data)throw new Error('SOCIAL_CANDIDATE_NOT_FOUND');
    const b=await supabase.from('social_reel_candidate_batches').select('*').eq('id',c.data.batch_id).maybeSingle();
    if(b.error)throw new Error('SOCIAL_BATCH_READ_FAILED');
    if(!b.data)throw new Error('SOCIAL_BATCH_NOT_FOUND');
    return {batch:b.data,candidate:c.data};
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const b=await supabase.from('social_reel_candidate_batches').select('*').eq('target_date',targetDate).maybeSingle();
  if(b.error)throw new Error('SOCIAL_BATCH_READ_FAILED');
  if(!b.data)throw new Error('SOCIAL_BATCH_NOT_FOUND');
  const no=Number(candidateNo);
  const c=await supabase.from('social_reel_candidates').select('*')
    .eq('batch_id',b.data.id).eq('candidate_no',no).maybeSingle();
  if(c.error)throw new Error('SOCIAL_CANDIDATE_READ_FAILED');
  if(!c.data)throw new Error('SOCIAL_CANDIDATE_NOT_FOUND');
  return {batch:b.data,candidate:c.data};
}

function normalizeLearning(input={}){
  const learningType=t(input.learning_type||input.type,80).toUpperCase();
  const scope=t(input.scope||'SHARED',80).toUpperCase();
  const statement=t(input.statement,8000);
  if(!LEARNING_TYPES.has(learningType))throw new Error('SOCIAL_LEARNING_TYPE_INVALID');
  if(!LEARNING_SCOPES.has(scope))throw new Error('SOCIAL_LEARNING_SCOPE_INVALID');
  if(!statement)throw new Error('SOCIAL_LEARNING_STATEMENT_REQUIRED');
  const key=t(input.learning_key||input.key,300);
  if(!key)throw new Error('SOCIAL_LEARNING_KEY_REQUIRED');
  const requested=t(input.status||'CANDIDATE',40).toUpperCase();
  if(!LEARNING_STATUSES.has(requested))throw new Error('SOCIAL_LEARNING_STATUS_INVALID');
  return {
    learning_key:key,
    learning_type:learningType,
    scope,
    statement,
    status:requested,
    confidence:bounded01(input.confidence,0.5),
    reuse_weight:bounded01(input.reuse_weight,0.5),
    source_candidate_id:input.source_candidate_id||null,
    source_post_id:input.source_post_id||null,
    evidence:obj(input.evidence)
  };
}

export async function upsertProductionLearning({supabase,learning}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const row=normalizeLearning(learning);
  const existing=await supabase.from('social_production_learnings').select('*')
    .eq('learning_key',row.learning_key).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_LEARNING_READ_FAILED');
  const now=new Date().toISOString();
  if(!existing.data){
    const ins=await supabase.from('social_production_learnings').insert({
      ...row,first_observed_at:now,last_observed_at:now,updated_at:now
    }).select('*').single();
    if(ins.error)throw new Error('SOCIAL_LEARNING_INSERT_FAILED');
    return ins.data;
  }

  const count=Number(existing.data.observation_count||1)+1;
  let status=existing.data.status;
  if(row.status==='ACTIVE' && !['SUPERSEDED','RETIRED'].includes(status))status='ACTIVE';
  if(
    status==='CANDIDATE' &&
    row.learning_type==='PERFORMANCE' &&
    count>=2 &&
    row.confidence>=0.65
  ) status='ACTIVE';

  const update=await supabase.from('social_production_learnings').update({
    statement:row.statement,
    status,
    confidence:Math.max(Number(existing.data.confidence||0),row.confidence),
    reuse_weight:Math.max(Number(existing.data.reuse_weight||0),row.reuse_weight),
    source_candidate_id:row.source_candidate_id||existing.data.source_candidate_id,
    source_post_id:row.source_post_id||existing.data.source_post_id,
    evidence:{...obj(existing.data.evidence),...row.evidence},
    observation_count:count,
    last_observed_at:now,
    updated_at:now
  }).eq('id',existing.data.id).select('*').single();
  if(update.error)throw new Error('SOCIAL_LEARNING_UPDATE_FAILED');
  return update.data;
}

export async function listProductionLearnings({supabase,status='ACTIVE',scopes=[],limit=100}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const l=Math.max(1,Math.min(Number(limit)||100,300));
  let q=supabase.from('social_production_learnings').select('*')
    .order('reuse_weight',{ascending:false}).order('updated_at',{ascending:false}).limit(l);
  const st=t(status,40).toUpperCase();
  if(st && st!=='ALL'){
    if(!LEARNING_STATUSES.has(st))throw new Error('SOCIAL_LEARNING_STATUS_INVALID');
    q=q.eq('status',st);
  }
  const scopeList=arr(scopes).map(x=>t(x,80).toUpperCase()).filter(x=>LEARNING_SCOPES.has(x));
  if(scopeList.length)q=q.in('scope',scopeList);
  const rows=await q;
  if(rows.error)throw new Error('SOCIAL_LEARNING_READ_FAILED');
  return rows.data||[];
}

async function writeEvent({supabase,candidateId,eventType,payload={},source='CHATGPT',idempotencyKey}){
  const type=t(eventType,80).toUpperCase();
  if(!EVENT_TYPES.has(type))throw new Error('SOCIAL_PRODUCTION_EVENT_INVALID');
  const key=t(idempotencyKey||`${type}:${candidateId}`,300);
  const event=await supabase.from('social_production_events').upsert({
    candidate_id:candidateId,
    event_type:type,
    event_at:new Date().toISOString(),
    source:t(source||'CHATGPT',120)||'CHATGPT',
    idempotency_key:key,
    payload:obj(payload)
  },{onConflict:'idempotency_key'}).select('*').single();
  if(event.error)throw new Error('SOCIAL_PRODUCTION_EVENT_WRITE_FAILED');
  return event.data;
}

export async function finalizeSocialProduction({
  supabase,targetDate,candidateNo,candidateId,productionPlan,learningCandidates=[],source='CHATGPT'
}){
  const {batch,candidate}=await getBatchAndCandidate({supabase,targetDate,candidateNo,candidateId});
  const plan=obj(productionPlan);
  if(!Object.keys(plan).length)throw new Error('SOCIAL_PRODUCTION_PLAN_REQUIRED');
  const now=new Date().toISOString();

  const reject=await supabase.from('social_reel_candidates').update({status:'REJECTED'})
    .eq('batch_id',batch.id).neq('id',candidate.id)
    .in('status',['CANDIDATE','SELECTED','READY','REJECTED']);
  if(reject.error)throw new Error('SOCIAL_CANDIDATE_REJECT_FAILED');

  const learnings=[];
  for(const l of arr(learningCandidates)){
    learnings.push(await upsertProductionLearning({
      supabase,
      learning:{...l,source_candidate_id:candidate.id}
    }));
  }

  const updated=await supabase.from('social_reel_candidates').update({
    status:'READY',
    production_plan:plan,
    production_finalized_at:now,
    production_updated_at:now,
    selected_at:candidate.selected_at||now,
    learning_summary:{
      learning_keys:learnings.map(x=>x.learning_key),
      active_count:learnings.filter(x=>x.status==='ACTIVE').length,
      candidate_count:learnings.filter(x=>x.status==='CANDIDATE').length
    }
  }).eq('id',candidate.id).select('*').single();
  if(updated.error)throw new Error('SOCIAL_PRODUCTION_FINALIZE_FAILED');

  const batchUpdate=await supabase.from('social_reel_candidate_batches').update({
    status:'READY',
    selected_candidate_id:candidate.id,
    updated_at:now
  }).eq('id',batch.id).select('*').single();
  if(batchUpdate.error)throw new Error('SOCIAL_BATCH_FINALIZE_FAILED');

  const event=await writeEvent({
    supabase,candidateId:candidate.id,eventType:'FINALIZED',source,
    idempotencyKey:`FINALIZED:${candidate.id}`,
    payload:{title:candidate.title,learning_keys:learnings.map(x=>x.learning_key)}
  });
  return {batch:batchUpdate.data,candidate:updated.data,event,learnings};
}

export async function recordSocialProductionEvent({
  supabase,targetDate,candidateNo,candidateId,eventType,payload={},source='CHATGPT',idempotencyKey
}){
  const type=t(eventType,80).toUpperCase();
  if(type==='PUBLISHED_VERIFIED')throw new Error('USE_SOCIAL_PUBLICATION_LINK');
  const {candidate}=await getBatchAndCandidate({supabase,targetDate,candidateNo,candidateId});
  const event=await writeEvent({
    supabase,candidateId:candidate.id,eventType:type,payload,source,
    idempotencyKey:idempotencyKey||`${type}:${candidate.id}`
  });
  let status=candidate.status;
  if(type==='CREATED')status='CREATED';
  if(type==='SHOT')status='SHOT';
  if(status!==candidate.status){
    const up=await supabase.from('social_reel_candidates').update({
      status,production_updated_at:new Date().toISOString()
    }).eq('id',candidate.id);
    if(up.error)throw new Error('SOCIAL_PRODUCTION_STATUS_UPDATE_FAILED');
  }
  return {candidate_id:candidate.id,status,event};
}

export async function linkVerifiedPublication({
  supabase,candidateId,targetDate,candidateNo,platform='INSTAGRAM',platformMediaId,source='METRICOOL'
}){
  const media=t(platformMediaId,300);
  if(!media)throw new Error('SOCIAL_MEDIA_ID_REQUIRED');
  const {candidate}=await getBatchAndCandidate({supabase,targetDate,candidateNo,candidateId});
  const post=await supabase.from('social_published_posts').select('*')
    .eq('platform',t(platform,40).toUpperCase()).eq('platform_media_id',media).maybeSingle();
  if(post.error)throw new Error('SOCIAL_HISTORY_READ_FAILED');
  if(!post.data)throw new Error('SOCIAL_PUBLISHED_EVIDENCE_REQUIRED');

  const linked=await supabase.from('social_published_posts').update({
    candidate_id:candidate.id,last_synced_at:new Date().toISOString()
  }).eq('id',post.data.id).select('*').single();
  if(linked.error)throw new Error('SOCIAL_PUBLICATION_LINK_FAILED');

  const up=await supabase.from('social_reel_candidates').update({
    status:'PUBLISHED',production_updated_at:new Date().toISOString()
  }).eq('id',candidate.id).select('*').single();
  if(up.error)throw new Error('SOCIAL_PRODUCTION_STATUS_UPDATE_FAILED');

  const event=await writeEvent({
    supabase,candidateId:candidate.id,eventType:'PUBLISHED_VERIFIED',source,
    idempotencyKey:`PUBLISHED_VERIFIED:${candidate.id}:${post.data.id}`,
    payload:{post_id:post.data.id,platform_media_id:media,permalink:post.data.permalink||null}
  });
  return {candidate:up.data,post:linked.data,event};
}

export async function getProductionLearningContext({supabase,days=90,learningLimit=120}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const d=Math.max(7,Math.min(Number(days)||90,365));
  const since=new Date(Date.now()-d*86400000).toISOString();
  const learnings=await listProductionLearnings({supabase,status:'ALL',limit:learningLimit});

  const posts=await supabase.from('social_published_posts').select('*')
    .not('candidate_id','is',null).gte('published_at',since)
    .order('published_at',{ascending:false}).limit(100);
  if(posts.error)throw new Error('SOCIAL_HISTORY_READ_FAILED');
  const postIds=(posts.data||[]).map(x=>x.id);
  const metricsByPost={};
  if(postIds.length){
    const metrics=await supabase.from('social_post_metrics').select('*')
      .in('post_id',postIds).order('observed_at',{ascending:true});
    if(metrics.error)throw new Error('SOCIAL_METRIC_READ_FAILED');
    for(const m of metrics.data||[]){
      if(!metricsByPost[m.post_id])metricsByPost[m.post_id]=[];
      metricsByPost[m.post_id].push(m);
    }
  }

  const published=(posts.data||[]).map(p=>{
    const ms=metricsByPost[p.id]||[];
    return {
      post:p,
      baseline_metrics:ms[0]||null,
      latest_metrics:ms.length?ms[ms.length-1]:null,
      metric_observations:ms.length
    };
  });
  return {
    active_learnings:learnings.filter(x=>x.status==='ACTIVE'),
    candidate_learnings:learnings.filter(x=>x.status==='CANDIDATE'),
    published_productions:published
  };
}
