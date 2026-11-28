const t=(v,n=12000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const bounded=(v,min,max,fallback)=>{
  const n=Number(v);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
};

const PRIORITY_SIGNALS=new Set(['PROMOTE','NEUTRAL','DEMOTE','REVIEW']);
const PORTFOLIO_SIGNALS=new Set(['KNOWLEDGE_HEAVY','STORE_HEAVY','BALANCED','SPARSE','UNKNOWN']);

function dateBounds(targetDate){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const end=new Date(`${targetDate}T23:59:59.999+09:00`);
  const start14=new Date(`${targetDate}T00:00:00+09:00`);
  const start30=new Date(`${targetDate}T00:00:00+09:00`);
  start14.setUTCDate(start14.getUTCDate()-13);
  start30.setUTCDate(start30.getUTCDate()-29);
  return {start14:start14.toISOString(),start30:start30.toISOString(),end:end.toISOString()};
}

function postText(post){
  return [
    post.title,post.topic,post.angle,post.hook,post.main_claim,post.caption,
    post.content_lane,post.territory
  ].filter(Boolean).join(' ').toLowerCase();
}

const INVENTORY_PATTERNS={
  PERSONAL_TRAINING:[/パーソナルジム/i,/パーソナルトレーニング/i,/the rev\.のパーソナル/i],
  BOXING:[/ボクシング/i,/ミット/i,/パンチ/i,/構え/i,/足運び/i],
  OXYGEN_ROOM:[/酸素ルーム/i,/o2\s*box/i],
  DENBA:[/denba/i,/電場/i],
  TRAINER_JUDGMENT:[/予定回数/i,/フォームが崩/i,/回数より/i,/負荷を調整/i,/その日の状態/i,/個別対応/i],
  STORE_SPACE_EQUIPMENT:[/店内/i,/設備/i,/ラック/i,/evolgear/i,/店舗/i,/照明/i],
  FIRST_VISIT_EXPERIENCE:[/初回体験/i,/何を準備/i,/初めて.*パーソナル/i,/カウンセリング/i],
  ACCESS_CONVENIENCE:[/シャワー/i,/更衣/i,/通いやす/i,/仕事帰り/i,/アクセス/i,/営業時間/i],
  RECOVERY_CONDITIONING:[/コンディショニング/i,/回復/i,/休養/i,/何もしない時間/i,/休む時間/i],
  SESSION_PROCESS:[/30分/i,/ルーティン/i,/メニューは/i,/内容を変え/i,/セッション/i]
};

export function classifyPublishedPostPortfolio(post={},inventory=[]){
  const text=postText(post);
  const matched=[];
  for(const item of inventory){
    const patterns=INVENTORY_PATTERNS[item.inventory_key]||[];
    const hits=patterns.filter(re=>re.test(text)).length;
    if(!hits)continue;
    matched.push({
      inventory_key:item.inventory_key,
      hit_count:hits,
      confidence:Math.min(0.98,0.68+(hits-1)*0.1)
    });
  }
  return matched.sort((a,b)=>b.confidence-a.confidence||b.hit_count-a.hit_count);
}

function latestMetricByPost(metrics=[]){
  const out=new Map();
  for(const row of metrics){
    const prev=out.get(row.post_id);
    if(!prev||new Date(row.observed_at)>new Date(prev.observed_at))out.set(row.post_id,row);
  }
  return out;
}

function performanceSummary(posts,metricMap){
  const values=[];
  for(const post of posts){
    const m=metricMap.get(post.id);
    if(!m)continue;
    values.push(m);
  }
  const avg=key=>{
    const xs=values.map(x=>Number(x[key])).filter(Number.isFinite);
    return xs.length?Math.round(xs.reduce((s,x)=>s+x,0)/xs.length*100)/100:null;
  };
  return {
    observed_posts:values.length,
    avg_reach:avg('reach'),
    avg_views:avg('views'),
    avg_saves:avg('saves'),
    avg_shares:avg('shares'),
    note:'Performance is a probability signal, not a quota or permanent rule.'
  };
}

function laneSignal(posts14){
  const knowledge=posts14.filter(p=>String(p.content_lane||'').includes('KNOWLEDGE')||p.territory==='KNOWLEDGE').length;
  const store=posts14.filter(p=>{
    const lane=String(p.content_lane||'');
    const territory=String(p.territory||'');
    return lane.startsWith('STORE_')||territory.startsWith('STORE_')||territory==='SERVICE_EXPERIENCE'||territory==='FIRST_VISIT_PROCESS';
  }).length;
  const total=posts14.length;
  let signal='UNKNOWN';
  if(total<4)signal='SPARSE';
  else if(knowledge>=4&&knowledge>=Math.max(1,store)*2)signal='KNOWLEDGE_HEAVY';
  else if(store>=4&&store>=Math.max(1,knowledge)*2)signal='STORE_HEAVY';
  else signal='BALANCED';
  return {signal,total,knowledge,store};
}

export function buildSocialPortfolioSnapshot({
  targetDate,businessPhase='STORE_AWARENESS_BUILD',inventory=[],posts=[],metrics=[]
}){
  const {start14,start30,end}=dateBounds(targetDate);
  const inWindow=(post,start)=>post.published_at&&new Date(post.published_at)>=new Date(start)&&new Date(post.published_at)<=new Date(end);
  const posts30=posts.filter(p=>inWindow(p,start30));
  const posts14=posts30.filter(p=>inWindow(p,start14));
  const metricMap=latestMetricByPost(metrics);
  const lane=laneSignal(posts14);

  const mapped=new Map(inventory.map(x=>[x.inventory_key,[]]));
  for(const post of posts30){
    for(const match of classifyPublishedPostPortfolio(post,inventory)){
      if(!mapped.has(match.inventory_key))mapped.set(match.inventory_key,[]);
      mapped.get(match.inventory_key).push({...post,_portfolio_match:match});
    }
  }

  const items=inventory.map(item=>{
    const source=(mapped.get(item.inventory_key)||[]).sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));
    const source14=source.filter(p=>inWindow(p,start14));
    const count14=source14.length;
    const count30=source.length;
    let exposure='UNKNOWN';
    if(count30===0)exposure='ABSENT_30D';
    else if(count14===0)exposure='ABSENT_14D';
    else if(count14>=3)exposure='FREQUENT_14D';
    else exposure='RECENT';

    const strategicSignal=
      exposure==='ABSENT_30D'
        ?'Strong underexposure signal. Retrieve canonical Fact / First-party before creating an Opportunity.'
        :exposure==='ABSENT_14D'
          ?'Underexposed recently. Consider if it fits the business phase and actual evidence.'
          :exposure==='FREQUENT_14D'
            ?'Recently frequent. Do not repeat unless the Job / Angle / Visual is materially different.'
            :'Recently represented. Treat as available, not mandatory.';

    return {
      inventory_key:item.inventory_key,
      count_14d:count14,
      count_30d:count30,
      last_published_at:source[0]?.published_at||null,
      exposure_signal:exposure,
      recent_angles:[...new Set(source14.map(x=>x.angle||x.topic||x.title).filter(Boolean))].slice(0,8),
      recent_formats:[...new Set(source14.map(x=>x.format||x.media_type).filter(Boolean))].slice(0,8),
      source_post_ids:source.slice(0,20).map(x=>x.id),
      performance_summary:performanceSummary(source14,metricMap),
      strategic_signal:strategicSignal,
      confidence:source.length?Math.max(...source.map(x=>x._portfolio_match?.confidence||0.5)):0.8,
      metadata:{label:item.label,inventory_type:item.inventory_type,priority_band:item.priority_band,evidence_policy:item.evidence_policy}
    };
  });

  const underexposed=items
    .filter(x=>['ABSENT_30D','ABSENT_14D'].includes(x.exposure_signal))
    .sort((a,b)=>{
      const rank=x=>x.exposure_signal==='ABSENT_30D'?0:1;
      return rank(a)-rank(b)||String(a.inventory_key).localeCompare(String(b.inventory_key));
    })
    .map(x=>x.inventory_key);

  const frequent=items.filter(x=>x.exposure_signal==='FREQUENT_14D').map(x=>x.inventory_key);

  return {
    target_date:targetDate,
    business_phase:businessPhase,
    portfolio_signal:PORTFOLIO_SIGNALS.has(lane.signal)?lane.signal:'UNKNOWN',
    summary:{
      window_14d:{start:start14,end,posts:lane.total,knowledge_posts:lane.knowledge,store_experience_posts:lane.store},
      window_30d:{start:start30,end,posts:posts30.length},
      underexposed_inventory:underexposed,
      frequent_inventory:frequent
    },
    recommendation:{
      strategic_rule:'Portfolio signals influence Opportunity priority; they never replace Evidence or force a fixed content quota.',
      current_phase:businessPhase,
      portfolio_signal:lane.signal,
      evidence_retrieval_targets:items
        .filter(x=>['ABSENT_30D','ABSENT_14D'].includes(x.exposure_signal))
        .map(x=>({
          inventory_key:x.inventory_key,
          exposure_signal:x.exposure_signal,
          evidence_policy:x.metadata.evidence_policy,
          instruction:'Retrieve canonical Fact / First-party only if this inventory item could solve the current marketing problem.'
        }))
    },
    items
  };
}

export async function collectSocialPortfolioContext({
  supabase,targetDate,businessPhase='STORE_AWARENESS_BUILD'
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const {start30,end}=dateBounds(targetDate);
  const inventory=await supabase.from('social_marketing_inventory').select('*')
    .eq('status','ACTIVE').order('inventory_key',{ascending:true});
  if(inventory.error)throw new Error('SOCIAL_PORTFOLIO_INVENTORY_READ_FAILED');

  const posts=await supabase.from('social_published_posts').select('*')
    .eq('platform','INSTAGRAM')
    .gte('published_at',start30).lte('published_at',end)
    .order('published_at',{ascending:false});
  if(posts.error)throw new Error('SOCIAL_PORTFOLIO_HISTORY_READ_FAILED');

  const ids=(posts.data||[]).map(x=>x.id);
  let metrics=[];
  if(ids.length){
    const r=await supabase.from('social_post_metrics').select('*').in('post_id',ids)
      .order('observed_at',{ascending:false});
    if(r.error)throw new Error('SOCIAL_PORTFOLIO_METRIC_READ_FAILED');
    metrics=r.data||[];
  }

  return buildSocialPortfolioSnapshot({
    targetDate,businessPhase,
    inventory:inventory.data||[],
    posts:posts.data||[],
    metrics
  });
}

export async function pollSocialPortfolioSnapshot({supabase,targetDate}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const snapshot=await supabase.from('social_portfolio_daily_snapshots').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(snapshot.error)throw new Error('SOCIAL_PORTFOLIO_SNAPSHOT_READ_FAILED');
  if(!snapshot.data)return {snapshot:null,items:[],rankings:[]};

  const items=await supabase.from('social_portfolio_snapshot_items').select('*')
    .eq('snapshot_id',snapshot.data.id).order('inventory_key',{ascending:true});
  if(items.error)throw new Error('SOCIAL_PORTFOLIO_ITEMS_READ_FAILED');

  const rankings=await supabase.from('social_opportunity_portfolio_rankings').select('*')
    .eq('snapshot_id',snapshot.data.id).order('created_at',{ascending:true});
  if(rankings.error)throw new Error('SOCIAL_PORTFOLIO_RANKINGS_READ_FAILED');

  return {snapshot:snapshot.data,items:items.data||[],rankings:rankings.data||[]};
}

export async function prepareSocialPortfolioSnapshot({
  supabase,targetDate,businessPhase='STORE_AWARENESS_BUILD',sourceContext={},replaceExisting=false
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const existing=await supabase.from('social_portfolio_daily_snapshots').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(existing.error)throw new Error('SOCIAL_PORTFOLIO_SNAPSHOT_READ_FAILED');
  if(existing.data&&existing.data.status==='READY'&&!replaceExisting){
    return pollSocialPortfolioSnapshot({supabase,targetDate});
  }

  const built=await collectSocialPortfolioContext({supabase,targetDate,businessPhase});
  const snapshot=await supabase.from('social_portfolio_daily_snapshots').upsert({
    target_date:targetDate,
    business_phase:businessPhase,
    status:'OPEN',
    portfolio_signal:built.portfolio_signal,
    summary:built.summary,
    recommendation:built.recommendation,
    source_context:obj(sourceContext),
    hold_reason:null,
    updated_at:new Date().toISOString()
  },{onConflict:'target_date'}).select('*').single();
  if(snapshot.error||!snapshot.data)throw new Error('SOCIAL_PORTFOLIO_SNAPSHOT_UPSERT_FAILED');

  const reset=await supabase.from('social_portfolio_snapshot_items').delete()
    .eq('snapshot_id',snapshot.data.id);
  if(reset.error)throw new Error('SOCIAL_PORTFOLIO_ITEMS_RESET_FAILED');

  if(built.items.length){
    const inserted=await supabase.from('social_portfolio_snapshot_items').insert(
      built.items.map(x=>({snapshot_id:snapshot.data.id,...x}))
    );
    if(inserted.error)throw new Error('SOCIAL_PORTFOLIO_ITEMS_INSERT_FAILED');
  }

  const ready=await supabase.from('social_portfolio_daily_snapshots').update({
    status:'READY',updated_at:new Date().toISOString()
  }).eq('id',snapshot.data.id).select('*').single();
  if(ready.error)throw new Error('SOCIAL_PORTFOLIO_SNAPSHOT_UPSERT_FAILED');

  return pollSocialPortfolioSnapshot({supabase,targetDate});
}

export function normalizeOpportunityPortfolioRanking(input={},opportunityMap,inventoryKeys){
  const opportunityId=t(input.opportunity_id,80);
  const op=opportunityMap.get(opportunityId);
  if(!op)throw new Error('SOCIAL_PORTFOLIO_OPPORTUNITY_INVALID');

  const priority=t(input.priority_signal||'NEUTRAL',40).toUpperCase();
  if(!PRIORITY_SIGNALS.has(priority))throw new Error('SOCIAL_PORTFOLIO_PRIORITY_INVALID');

  const keys=[...new Set(arr(input.inventory_keys).map(x=>t(x,100)).filter(Boolean))];
  for(const key of keys){
    if(!inventoryKeys.has(key))throw new Error('SOCIAL_PORTFOLIO_INVENTORY_KEY_INVALID');
  }
  const rationale=t(input.rationale,5000);
  if(!rationale)throw new Error('SOCIAL_PORTFOLIO_RATIONALE_REQUIRED');

  return {
    opportunity_id:opportunityId,
    inventory_keys:keys,
    priority_signal:priority,
    phase_fit:nt(input.phase_fit,1200),
    recent_saturation:nt(input.recent_saturation,1200),
    underexposure_signal:nt(input.underexposure_signal,1200),
    editorial_collision:nt(input.editorial_collision,1200),
    performance_prior:nt(input.performance_prior,1200),
    asset_feasibility:nt(input.asset_feasibility,1200),
    rationale,
    confidence:bounded(input.confidence,0,1,0.5),
    metadata:{
      ...obj(input.metadata),
      evidence_strength:op.evidence_strength,
      opportunity_qc_decision:op.qc_decision,
      guard:'Portfolio priority never upgrades Evidence Strength or QC state.'
    }
  };
}

export async function prepareOpportunityPortfolioRankings({
  supabase,targetDate,rankings=[],replaceExisting=false
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const current=await pollSocialPortfolioSnapshot({supabase,targetDate});
  if(!current.snapshot||current.snapshot.status!=='READY')throw new Error('SOCIAL_PORTFOLIO_SNAPSHOT_NOT_READY');

  if(current.rankings.length&&!replaceExisting)return current;

  const plan=await supabase.from('social_opportunity_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(plan.error||!plan.data||plan.data.status!=='READY')throw new Error('SOCIAL_OPPORTUNITY_PLAN_NOT_READY');

  const ops=await supabase.from('social_opportunities').select('*').eq('plan_id',plan.data.id);
  if(ops.error)throw new Error('SOCIAL_OPPORTUNITY_READ_FAILED');
  const opMap=new Map((ops.data||[]).map(x=>[x.id,x]));

  const inventory=await supabase.from('social_marketing_inventory').select('inventory_key').eq('status','ACTIVE');
  if(inventory.error)throw new Error('SOCIAL_PORTFOLIO_INVENTORY_READ_FAILED');
  const inventoryKeys=new Set((inventory.data||[]).map(x=>x.inventory_key));

  const list=arr(rankings);
  if(list.length!==(ops.data||[]).length)throw new Error('SOCIAL_PORTFOLIO_RANKING_COVERAGE_REQUIRED');

  const normalized=list.map(x=>normalizeOpportunityPortfolioRanking(x,opMap,inventoryKeys));
  if(new Set(normalized.map(x=>x.opportunity_id)).size!==normalized.length){
    throw new Error('SOCIAL_PORTFOLIO_RANKING_DUPLICATE_OPPORTUNITY');
  }

  const reset=await supabase.from('social_opportunity_portfolio_rankings').delete()
    .eq('snapshot_id',current.snapshot.id);
  if(reset.error)throw new Error('SOCIAL_PORTFOLIO_RANKINGS_RESET_FAILED');

  const inserted=await supabase.from('social_opportunity_portfolio_rankings').insert(
    normalized.map(x=>({
      snapshot_id:current.snapshot.id,
      ...x,
      updated_at:new Date().toISOString()
    }))
  ).select('*');
  if(inserted.error)throw new Error('SOCIAL_PORTFOLIO_RANKINGS_INSERT_FAILED');

  return {...current,rankings:inserted.data||[]};
}

export function normalizePortfolioDecision(input={},availableInventoryKeys=new Set()){
  const considered=[...new Set(arr(input.considered_inventory_keys).map(x=>t(x,100)).filter(Boolean))];
  if(!considered.length)throw new Error('SOCIAL_PORTFOLIO_DECISION_INVENTORY_REQUIRED');
  for(const key of considered){
    if(!availableInventoryKeys.has(key))throw new Error('SOCIAL_PORTFOLIO_DECISION_INVENTORY_INVALID');
  }
  const marketingRationale=t(input.marketing_rationale,6000);
  const storeDecision=t(input.why_store_service_now_or_not,6000);
  const recentBalance=t(input.recent_balance,3000);
  if(!marketingRationale||!storeDecision||!recentBalance){
    throw new Error('SOCIAL_PORTFOLIO_DECISION_RATIONALE_REQUIRED');
  }
  return {
    considered_inventory_keys:considered,
    selected_mix:obj(input.selected_mix),
    recent_balance:recentBalance,
    why_store_service_now_or_not:storeDecision,
    marketing_rationale:marketingRationale,
    note:'This is a strategic portfolio judgment, not a fixed content quota.'
  };
}
