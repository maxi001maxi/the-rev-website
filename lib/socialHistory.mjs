const MAX_POSTS=200;

const t=(v,n=20000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const num=v=>v===''||v===null||v===undefined?null:(Number.isFinite(Number(v))?Math.trunc(Number(v)):null);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

export function parseLegacyPerformanceSummary(summary=''){
  const out={};
  for(const part of String(summary||'').split(';')){
    const m=part.trim().match(/^([a-z_]+)\s*=\s*(-?\d+(?:\.\d+)?)$/i);
    if(m)out[m[1].toLowerCase()]=Number(m[2]);
  }
  return out;
}

function metricShape(v={}){
  return {
    reach:num(v.reach),views:num(v.views),likes:num(v.likes),saves:num(v.saves),
    shares:num(v.shares),comments:num(v.comments),profile_visits:num(v.profile_visits),
    website_clicks:num(v.website_clicks),follows:num(v.follows)
  };
}

export function normalizePublishedPost(input={}){
  const id=t(input.platform_media_id||input.post_id,300);
  if(!id)throw new Error('SOCIAL_MEDIA_ID_REQUIRED');
  return {
    platform:t(input.platform||'INSTAGRAM',40).toUpperCase(),
    platform_account_id:nt(input.platform_account_id,300),
    platform_media_id:id,
    permalink:nt(input.permalink||input.post_url,2000),
    published_at:input.published_at||input.publish_date||null,
    media_type:nt(input.media_type,80),
    format:nt(input.format,80),
    title:nt(input.title,500),
    topic:nt(input.topic,500),
    angle:nt(input.angle,2000),
    hook:nt(input.hook,2000),
    main_claim:nt(input.main_claim,4000),
    caption:nt(input.caption||input.caption_or_script,30000),
    content_lane:nt(input.content_lane,120),
    territory:nt(input.territory,120),
    ownership:nt(input.ownership,80),
    source:t(input.source||'UNKNOWN',120)||'UNKNOWN',
    source_ref:nt(input.source_ref,500),
    semantic_status:t(input.semantic_status||'RAW',40).toUpperCase(),
    raw_json:obj(input.raw_json),
    last_synced_at:new Date().toISOString()
  };
}

export async function upsertSocialHistory({supabase,posts=[]}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!Array.isArray(posts)||!posts.length)throw new Error('SOCIAL_POSTS_REQUIRED');
  if(posts.length>MAX_POSTS)throw new Error('SOCIAL_POST_LIMIT_EXCEEDED');
  const saved=[];
  for(const input of posts){
    const post=normalizePublishedPost(input);
    const row=await supabase.from('social_published_posts')
      .upsert(post,{onConflict:'platform,platform_media_id'})
      .select('id,platform,platform_media_id,published_at').single();
    if(row.error||!row.data)throw new Error('SOCIAL_HISTORY_UPSERT_FAILED');

    const metrics=metricShape(input.metrics||{});
    if(Object.values(metrics).some(v=>v!==null)){
      const source=t(input.metrics?.source||input.metric_source||post.source,120)||'UNKNOWN';
      const latest=await supabase.from('social_post_metrics')
        .select('reach,views,likes,saves,shares,comments,profile_visits,website_clicks,follows')
        .eq('post_id',row.data.id).eq('source',source)
        .order('observed_at',{ascending:false}).limit(1).maybeSingle();
      if(latest.error)throw new Error('SOCIAL_METRIC_READ_FAILED');
      const same=latest.data&&Object.keys(metrics).every(k=>(latest.data[k]??null)===(metrics[k]??null));
      if(!same){
        const ins=await supabase.from('social_post_metrics').insert({
          post_id:row.data.id,observed_at:input.metrics?.observed_at||new Date().toISOString(),
          ...metrics,source,raw_json:obj(input.metrics?.raw_json)
        });
        if(ins.error)throw new Error('SOCIAL_METRIC_INSERT_FAILED');
      }
    }
    saved.push(row.data);
  }
  return {count:saved.length,rows:saved};
}

export async function listSocialHistory({supabase,days=120,limit=100}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const d=Math.max(1,Math.min(Number(days)||120,730));
  const l=Math.max(1,Math.min(Number(limit)||100,MAX_POSTS));
  const since=new Date(Date.now()-d*86400000).toISOString();
  const posts=await supabase.from('social_published_posts').select('*')
    .gte('published_at',since).order('published_at',{ascending:false}).limit(l);
  if(posts.error)throw new Error('SOCIAL_HISTORY_READ_FAILED');
  const ids=(posts.data||[]).map(x=>x.id);
  const latest={};
  if(ids.length){
    const metrics=await supabase.from('social_post_metrics').select('*')
      .in('post_id',ids).order('observed_at',{ascending:false});
    if(metrics.error)throw new Error('SOCIAL_METRIC_READ_FAILED');
    for(const m of metrics.data||[])if(!latest[m.post_id])latest[m.post_id]=m;
  }
  return (posts.data||[]).map(x=>({...x,latest_metrics:latest[x.id]||null}));
}
