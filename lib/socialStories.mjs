const t=(v,n=12000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const arr=v=>Array.isArray(v)?v:[];

const INTERACTIONS=new Set(['NONE','POLL','QUESTION','QUIZ','LINK','DM']);
const ITEM_STATUSES=new Set(['PLANNED','CREATED','POSTED_VERIFIED','HOLD']);

function normalizeStoryItem(input={},slotNo){
  const role=t(input.role||input.story_role||'REAL_MOMENT',120).toUpperCase();
  const interaction=t(input.interaction||'NONE',40).toUpperCase();
  if(!INTERACTIONS.has(interaction))throw new Error('SOCIAL_STORY_INTERACTION_INVALID');
  const textValue=t(input.frame_text||input.text||input.copy,4000);
  const hook=t(input.hook,2000);
  const assetPlan=t(input.asset_plan,3000);
  if(!textValue&&!hook&&!assetPlan)throw new Error('SOCIAL_STORY_CONTENT_REQUIRED');
  return {
    slot_no:slotNo,
    role,
    pattern:nt(input.pattern,120),
    interaction,
    business_job:nt(input.business_job,120),
    audience_state:nt(input.audience_state,120),
    title:nt(input.title,500),
    hook:hook||null,
    frame_text:textValue||null,
    asset_plan:assetPlan||null,
    posting_window:nt(input.posting_window,120),
    related_reel_candidate_id:input.related_reel_candidate_id||null,
    status:'PLANNED'
  };
}

export async function listStoryPlans({supabase,days=14,limit=60}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const d=Math.max(1,Math.min(Number(days)||14,120));
  const l=Math.max(1,Math.min(Number(limit)||60,200));
  const since=new Date(Date.now()-d*86400000).toISOString().slice(0,10);
  const plans=await supabase.from('social_story_daily_plans').select('*')
    .gte('target_date',since).order('target_date',{ascending:false}).limit(l);
  if(plans.error)throw new Error('SOCIAL_STORY_PLAN_READ_FAILED');
  const ids=(plans.data||[]).map(x=>x.id);
  const itemsByPlan={};
  if(ids.length){
    const items=await supabase.from('social_story_items').select('*')
      .in('plan_id',ids).order('slot_no',{ascending:true});
    if(items.error)throw new Error('SOCIAL_STORY_ITEM_READ_FAILED');
    for(const item of items.data||[]){
      if(!itemsByPlan[item.plan_id])itemsByPlan[item.plan_id]=[];
      itemsByPlan[item.plan_id].push(item);
    }
  }
  return (plans.data||[]).map(p=>({...p,items:itemsByPlan[p.id]||[]}));
}

export async function prepareDailyStories({
  supabase,targetDate,stories=[],primaryTheme,sourceContext={},holdReason
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');

  const existing=await supabase.from('social_story_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_STORY_PLAN_READ_FAILED');
  if(existing.data){
    const current=await listStoryPlans({supabase,days:120,limit:200});
    const match=current.find(x=>x.id===existing.data.id);
    if(match&&(match.status==='READY'||match.status==='HOLD'))return {plan:match,items:match.items||[]};
  }

  const list=arr(stories);
  if(holdReason){
    const plan=await supabase.from('social_story_daily_plans').upsert({
      target_date:targetDate,status:'HOLD',primary_theme:nt(primaryTheme,500),
      source_context:obj(sourceContext),hold_reason:t(holdReason,4000),updated_at:new Date().toISOString()
    },{onConflict:'target_date'}).select('*').single();
    if(plan.error)throw new Error('SOCIAL_STORY_PLAN_UPSERT_FAILED');
    return {plan:plan.data,items:[]};
  }
  if(list.length<1||list.length>3)throw new Error('SOCIAL_STORY_COUNT_INVALID');

  const plan=await supabase.from('social_story_daily_plans').upsert({
    target_date:targetDate,status:'READY',primary_theme:nt(primaryTheme,500),
    source_context:obj(sourceContext),hold_reason:null,updated_at:new Date().toISOString()
  },{onConflict:'target_date'}).select('*').single();
  if(plan.error||!plan.data)throw new Error('SOCIAL_STORY_PLAN_UPSERT_FAILED');

  const reset=await supabase.from('social_story_items').delete()
    .eq('plan_id',plan.data.id).in('status',['PLANNED','HOLD']);
  if(reset.error)throw new Error('SOCIAL_STORY_ITEM_RESET_FAILED');

  const rows=list.map((x,i)=>({plan_id:plan.data.id,...normalizeStoryItem(x,i+1)}));
  const ins=await supabase.from('social_story_items').insert(rows).select('*');
  if(ins.error)throw new Error('SOCIAL_STORY_ITEM_INSERT_FAILED');
  return {plan:plan.data,items:ins.data||[]};
}

export async function markStoryCreated({supabase,targetDate,slotNo}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const plan=await supabase.from('social_story_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(plan.error)throw new Error('SOCIAL_STORY_PLAN_READ_FAILED');
  if(!plan.data)throw new Error('SOCIAL_STORY_PLAN_NOT_FOUND');
  const no=Number(slotNo);
  const row=await supabase.from('social_story_items').update({
    status:'CREATED',updated_at:new Date().toISOString()
  }).eq('plan_id',plan.data.id).eq('slot_no',no).select('*').single();
  if(row.error)throw new Error('SOCIAL_STORY_STATUS_UPDATE_FAILED');
  return row.data;
}

export async function linkVerifiedStoryPublication({
  supabase,targetDate,slotNo,platformMediaId,platform='INSTAGRAM'
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const media=t(platformMediaId,300);
  if(!media)throw new Error('SOCIAL_MEDIA_ID_REQUIRED');
  const plan=await supabase.from('social_story_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(plan.error)throw new Error('SOCIAL_STORY_PLAN_READ_FAILED');
  if(!plan.data)throw new Error('SOCIAL_STORY_PLAN_NOT_FOUND');
  const story=await supabase.from('social_story_items').select('*')
    .eq('plan_id',plan.data.id).eq('slot_no',Number(slotNo)).maybeSingle();
  if(story.error)throw new Error('SOCIAL_STORY_ITEM_READ_FAILED');
  if(!story.data)throw new Error('SOCIAL_STORY_ITEM_NOT_FOUND');

  const post=await supabase.from('social_published_posts').select('*')
    .eq('platform',t(platform,40).toUpperCase()).eq('platform_media_id',media).maybeSingle();
  if(post.error)throw new Error('SOCIAL_HISTORY_READ_FAILED');
  if(!post.data)throw new Error('SOCIAL_PUBLISHED_EVIDENCE_REQUIRED');

  const updated=await supabase.from('social_story_items').update({
    status:'POSTED_VERIFIED',
    published_post_id:post.data.id,
    platform_media_id:media,
    published_verified_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  }).eq('id',story.data.id).select('*').single();
  if(updated.error)throw new Error('SOCIAL_STORY_PUBLICATION_LINK_FAILED');
  return {story:updated.data,post:post.data};
}

export function summarizeStorySequence(history=[]){
  const flat=[];
  for(const plan of arr(history)){
    for(const item of arr(plan.items)){
      flat.push({
        target_date:plan.target_date,
        slot_no:item.slot_no,
        role:item.role,
        pattern:item.pattern,
        interaction:item.interaction,
        status:item.status
      });
    }
  }
  return flat.slice(0,24);
}
