const t=(v,n=12000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const bounded=(v,min,max,fallback)=>{
  const n=Number(v);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
};

export const SOCIAL_EVIDENCE_TYPES=new Set([
  'CUSTOMER_SIGNAL','PERFORMANCE','OPERATOR_FIRST_PARTY','STORE_EVENT',
  'FACT_REGISTRY','RESEARCH_CANON','RAW_RESEARCH','LOCAL_SIGNAL',
  'TREND_SIGNAL','PRODUCTION_LEARNING'
]);
export const SOCIAL_CHANNELS=new Set(['REEL','STORIES','THREADS','SHARED']);

const AUTHORITY={
  CUSTOMER_SIGNAL:6,
  PERFORMANCE:5,
  OPERATOR_FIRST_PARTY:6,
  STORE_EVENT:6,
  FACT_REGISTRY:6,
  RESEARCH_CANON:4,
  RAW_RESEARCH:3,
  LOCAL_SIGNAL:4,
  TREND_SIGNAL:2,
  PRODUCTION_LEARNING:4
};

function normalizeChannels(value){
  const channels=arr(value).map(x=>t(x,40).toUpperCase()).filter(x=>SOCIAL_CHANNELS.has(x));
  return [...new Set(channels.length?channels:['SHARED'])];
}

export function normalizeSharedEvidence(input={}){
  const evidence_key=t(input.evidence_key||input.key,300);
  const source_type=t(input.source_type,80).toUpperCase();
  const evidence_text=t(input.evidence_text||input.summary||input.text,8000);
  if(!evidence_key)throw new Error('SOCIAL_EVIDENCE_KEY_REQUIRED');
  if(!SOCIAL_EVIDENCE_TYPES.has(source_type))throw new Error('SOCIAL_EVIDENCE_SOURCE_INVALID');
  if(!evidence_text)throw new Error('SOCIAL_EVIDENCE_TEXT_REQUIRED');

  const privacy_scope=t(input.privacy_scope||'INTERNAL',40).toUpperCase();
  const allowed_use=t(input.allowed_use||'INTERNAL_REASONING',80).toUpperCase();
  if(!['PUBLIC','INTERNAL','CONFIDENTIAL'].includes(privacy_scope))throw new Error('SOCIAL_EVIDENCE_PRIVACY_INVALID');
  if(!['INTERNAL_REASONING','PARAPHRASE_OK','PUBLIC_QUOTE_OK'].includes(allowed_use))throw new Error('SOCIAL_EVIDENCE_USE_INVALID');

  return {
    evidence_key,
    source_type,
    source_ref:nt(input.source_ref,1200),
    source_date:input.source_date||null,
    freshness:nt(input.freshness,80),
    audience_state:nt(input.audience_state,120),
    topic:nt(input.topic,500),
    signal:nt(input.signal,2500),
    evidence_text,
    business_relevance:nt(input.business_relevance,1000),
    channel_relevance:normalizeChannels(input.channel_relevance),
    truth_authority:bounded(input.truth_authority,1,6,AUTHORITY[source_type]||3),
    decision_relevance:bounded(input.decision_relevance,1,8,4),
    confidence:bounded(input.confidence,0,1,0.5),
    privacy_scope,
    allowed_use,
    tags:arr(input.tags).map(x=>t(x,120)).filter(Boolean).slice(0,30),
    metadata:obj(input.metadata)
  };
}

function dateWindow(targetDate,days){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const end=new Date(`${targetDate}T00:00:00+09:00`);
  end.setUTCDate(end.getUTCDate()+1);
  const start=new Date(end.getTime()-Math.max(1,Math.min(Number(days)||30,180))*86400000);
  return {start:start.toISOString(),end:end.toISOString()};
}

function signalText(row){
  return [
    row.tension&&`Tension: ${row.tension}`,
    row.question&&`Question: ${row.question}`,
    row.desired_outcome&&`Desired outcome: ${row.desired_outcome}`,
    row.decision_barrier&&`Decision barrier: ${row.decision_barrier}`,
    row.attraction&&`Attraction: ${row.attraction}`,
    row.anonymized_quote&&`Anonymized quote: ${row.anonymized_quote}`
  ].filter(Boolean).join(' / ');
}

function metricText(post,metric){
  const pairs=[
    ['reach',metric.reach],['views',metric.views],['likes',metric.likes],
    ['saves',metric.saves],['shares',metric.shares],['comments',metric.comments],
    ['profile_visits',metric.profile_visits],['website_clicks',metric.website_clicks],
    ['follows',metric.follows]
  ].filter(([,v])=>v!==null&&v!==undefined);
  return [
    `Published ${post.platform||'UNKNOWN'} ${post.format||post.media_type||'content'}`,
    post.title||post.topic||post.main_claim||'untitled',
    pairs.map(([k,v])=>`${k}=${v}`).join(', ')
  ].filter(Boolean).join(' / ');
}

export async function collectNativeSocialEvidence({supabase,targetDate,days=30,limit=80}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const {start,end}=dateWindow(targetDate,days);
  const l=Math.max(10,Math.min(Number(limit)||80,200));
  const evidence=[];
  const coverage={
    customer_signals:0,
    performance_posts:0,
    production_learnings:0
  };

  const signals=await supabase.from('social_customer_signals').select('*')
    .gte('observed_at',start).lt('observed_at',end)
    .order('observed_at',{ascending:false}).limit(l);
  if(signals.error)throw new Error('SOCIAL_EVIDENCE_CUSTOMER_READ_FAILED');
  for(const row of signals.data||[]){
    const text=signalText(row);
    if(!text)continue;
    const consent=t(row.consent_scope,80).toUpperCase();
    evidence.push(normalizeSharedEvidence({
      evidence_key:`customer:${row.id}`,
      source_type:'CUSTOMER_SIGNAL',
      source_ref:row.source_ref||`social_customer_signals:${row.id}`,
      source_date:row.observed_at,
      audience_state:row.audience_state,
      topic:'CUSTOMER_SIGNAL',
      signal:row.decision_barrier||row.tension||row.question||row.attraction,
      evidence_text:text,
      business_relevance:'Observed THE REV. customer/prospect experience, perception, question or decision barrier.',
      channel_relevance:['SHARED'],
      confidence:row.confidence,
      privacy_scope:'INTERNAL',
      allowed_use:consent==='EXPLICIT_PUBLIC'?'PUBLIC_QUOTE_OK':consent==='ANONYMIZED_SOCIAL'?'PARAPHRASE_OK':'INTERNAL_REASONING',
      tags:row.tags,
      metadata:{source_table:'social_customer_signals',consent_scope:row.consent_scope}
    }));
  }
  coverage.customer_signals=evidence.filter(x=>x.source_type==='CUSTOMER_SIGNAL').length;

  const posts=await supabase.from('social_published_posts').select('*')
    .gte('published_at',start).lt('published_at',end)
    .order('published_at',{ascending:false}).limit(l);
  if(posts.error)throw new Error('SOCIAL_EVIDENCE_HISTORY_READ_FAILED');
  const postIds=(posts.data||[]).map(x=>x.id);
  const latestByPost={};
  if(postIds.length){
    const metrics=await supabase.from('social_post_metrics').select('*')
      .in('post_id',postIds).order('observed_at',{ascending:false});
    if(metrics.error)throw new Error('SOCIAL_EVIDENCE_METRIC_READ_FAILED');
    for(const row of metrics.data||[]){
      if(!latestByPost[row.post_id])latestByPost[row.post_id]=row;
    }
  }
  for(const post of posts.data||[]){
    const metric=latestByPost[post.id];
    if(!metric)continue;
    evidence.push(normalizeSharedEvidence({
      evidence_key:`performance:${post.id}:${metric.id}`,
      source_type:'PERFORMANCE',
      source_ref:post.permalink||post.source_ref||`social_published_posts:${post.id}`,
      source_date:metric.observed_at,
      topic:post.topic||post.title||post.main_claim,
      signal:'Observed performance of a verified published THE REV. social post.',
      evidence_text:metricText(post,metric),
      business_relevance:'Own-channel performance changes probabilities; it does not create universal rules.',
      channel_relevance:[post.platform==='THREADS'?'THREADS':'REEL','SHARED'],
      truth_authority:5,
      decision_relevance:6,
      confidence:0.9,
      privacy_scope:'INTERNAL',
      allowed_use:'INTERNAL_REASONING',
      tags:['performance',String(post.platform||'unknown').toLowerCase(),String(post.format||post.media_type||'unknown').toLowerCase()],
      metadata:{source_table:'social_post_metrics',post_id:post.id,metric_id:metric.id,platform:post.platform,format:post.format}
    }));
  }
  coverage.performance_posts=evidence.filter(x=>x.source_type==='PERFORMANCE').length;

  const learnings=await supabase.from('social_production_learnings').select('*')
    .in('status',['ACTIVE','CANDIDATE'])
    .order('reuse_weight',{ascending:false}).order('updated_at',{ascending:false}).limit(l);
  if(learnings.error)throw new Error('SOCIAL_EVIDENCE_LEARNING_READ_FAILED');
  for(const row of learnings.data||[]){
    evidence.push(normalizeSharedEvidence({
      evidence_key:`learning:${row.id}`,
      source_type:'PRODUCTION_LEARNING',
      source_ref:`social_production_learnings:${row.learning_key}`,
      source_date:row.last_observed_at||row.updated_at,
      topic:row.learning_type,
      signal:row.statement,
      evidence_text:row.statement,
      business_relevance:'Reusable production/strategy learning derived from THE REV. operations.',
      channel_relevance:['SHARED'],
      truth_authority:4,
      decision_relevance:row.status==='ACTIVE'?6:4,
      confidence:row.confidence,
      privacy_scope:'INTERNAL',
      allowed_use:'INTERNAL_REASONING',
      tags:['production_learning',String(row.status||'').toLowerCase(),String(row.scope||'').toLowerCase()],
      metadata:{source_table:'social_production_learnings',learning_key:row.learning_key,status:row.status,observation_count:row.observation_count}
    }));
  }
  coverage.production_learnings=evidence.filter(x=>x.source_type==='PRODUCTION_LEARNING').length;

  return {
    target_date:targetDate,
    evidence,
    coverage,
    external_sources_required:[
      'OPERATOR_FIRST_PARTY',
      'FACT_REGISTRY',
      'RESEARCH_CANON',
      'STORE_EVENT_OR_CURRENT_TRUTH'
    ],
    rule:'Native evidence is only one layer. External canonical sources must be retrieved when relevant before Opportunity generation.'
  };
}

export async function pollSocialEvidencePool({supabase,targetDate}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const pool=await supabase.from('social_evidence_daily_pools').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(pool.error)throw new Error('SOCIAL_EVIDENCE_POOL_READ_FAILED');
  if(!pool.data)return {pool:null,evidence:[]};
  const rows=await supabase.from('social_evidence_items').select('*')
    .eq('pool_id',pool.data.id)
    .order('decision_relevance',{ascending:false})
    .order('confidence',{ascending:false});
  if(rows.error)throw new Error('SOCIAL_EVIDENCE_ITEM_READ_FAILED');
  return {pool:pool.data,evidence:rows.data||[]};
}

export async function prepareSocialEvidencePool({
  supabase,targetDate,evidence=[],sourceContext={},holdReason,replaceOpen=false
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');

  const existing=await supabase.from('social_evidence_daily_pools').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_EVIDENCE_POOL_READ_FAILED');
  const status=t(existing.data?.status,40).toUpperCase();
  if(existing.data&&['READY','HOLD'].includes(status))return pollSocialEvidencePool({supabase,targetDate});
  if(existing.data&&status==='OPEN'&&replaceOpen!==true){
    const current=await pollSocialEvidencePool({supabase,targetDate});
    if(current.evidence.length)return current;
  }

  const list=arr(evidence);
  if(!holdReason&&list.length<1)throw new Error('SOCIAL_EVIDENCE_REQUIRED');

  const pool=await supabase.from('social_evidence_daily_pools').upsert({
    target_date:targetDate,
    status:holdReason?'HOLD':'OPEN',
    source_context:obj(sourceContext),
    hold_reason:holdReason?t(holdReason,4000):null,
    updated_at:new Date().toISOString()
  },{onConflict:'target_date'}).select('*').single();
  if(pool.error||!pool.data)throw new Error('SOCIAL_EVIDENCE_POOL_UPSERT_FAILED');

  const reset=await supabase.from('social_evidence_items').delete().eq('pool_id',pool.data.id);
  if(reset.error)throw new Error('SOCIAL_EVIDENCE_ITEM_RESET_FAILED');

  if(holdReason)return {pool:{...pool.data,status:'HOLD'},evidence:[]};

  const seen=new Set();
  const normalized=[];
  for(const item of list){
    const row=normalizeSharedEvidence(item);
    if(seen.has(row.evidence_key))throw new Error('SOCIAL_EVIDENCE_KEY_DUPLICATE');
    seen.add(row.evidence_key);
    normalized.push({pool_id:pool.data.id,...row});
  }
  const inserted=await supabase.from('social_evidence_items').insert(normalized).select('*');
  if(inserted.error)throw new Error('SOCIAL_EVIDENCE_ITEM_INSERT_FAILED');

  const ready=await supabase.from('social_evidence_daily_pools').update({
    status:'READY',hold_reason:null,updated_at:new Date().toISOString()
  }).eq('id',pool.data.id).select('*').single();
  if(ready.error)throw new Error('SOCIAL_EVIDENCE_POOL_UPSERT_FAILED');
  return {pool:ready.data,evidence:inserted.data||[]};
}
