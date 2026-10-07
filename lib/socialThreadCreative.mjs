// Research guides discovery; only retrieved sources ground assertions.
// Uses existing plan.source_context / candidate.evidence_packet JSON, no new store.
const text=(v,n=6000)=>String(v??'').trim().slice(0,n);
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const key=v=>text(v).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export const THREAD_CREATIVE_VERSION='THREADS_CREATIVE_REASONING_V1';
const HUMAN_SOURCES=new Set(['OPERATOR_FIRST_PARTY','STORE_EVENT']);
const brandJudgment=e=>e?.source_type==='FACT_REGISTRY'&&e.metadata?.verified_brand_judgment===true&&e.metadata?.status==='VERIFIED';
const STRUCTURES=new Set(['OBSERVATION_FIRST','JUDGMENT_FIRST','SMALL_STORY','FACT_TO_VIEW','UNFINISHED_THOUGHT','REPLY_CONTINUATION','LIGHT_NOTE','PROMOTION_WITH_CONTEXT']);
const ENDINGS=new Set(['CLOSED','OPEN','OBSERVATION','QUESTION','ACTION','NO_CONCLUSION']);
const DIMENSIONS=new Set(['NOTICE','CARE','DISCOMFORT','HESITATION','CHOOSE','DECLINE','JUDGMENT']);
const fail=code=>{throw new Error(`SOCIAL_THREAD_${code}`);};
function required(v,code){const s=text(v);if(!s)fail(code);return s;}
function refs(v,byKey,code){
  const keys=[...new Set(arr(v).map(x=>text(x,300)).filter(Boolean))];
  if(!keys.length||keys.some(k=>!byKey.has(k)||!text(byKey.get(k).source_ref)))fail(code);
  return keys;
}
function grams(value){const s=key(value);return new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3)));}
export function threadClaimSimilarity(a,b){
  if(!key(a)||!key(b))return 0;
  if(key(a)===key(b))return 1;
  if(Math.min(key(a).length,key(b).length)<12)return 0;
  const x=grams(a),y=grams(b);
  if(!x.size||!y.size)return 0;
  return [...x].filter(g=>y.has(g)).length/Math.min(x.size,y.size);
}
function sameEvidence(a,b){
  if(a.evidence_key===b.evidence_key)return true;
  // Identical source rows or near-identical excerpts cannot evade the gate by renaming a key.
  return (key(a.source_ref)&&key(a.source_ref)===key(b.source_ref))
    || threadClaimSimilarity(a.evidence_text,b.evidence_text)>=0.85;
}
export function threadCreativeRequired(ctx={},rows=[]){
  return ctx.threads_creative_required===true||ctx.threads_creative_version===THREAD_CREATIVE_VERSION
    ||arr(rows).some(x=>x.evidence_packet?.creative_reasoning?.version===THREAD_CREATIVE_VERSION);
}

export function validateThreadCreativePlan({sourceContext={},evidence=[],candidates=[],recentContent=[],targetDate}={}){
  if(!threadCreativeRequired(sourceContext,candidates))return {required:false};
  const ctx=obj(sourceContext),byKey=new Map(evidence.map(x=>[x.evidence_key,x]));
  if(ctx.threads_creative_version!==THREAD_CREATIVE_VERSION)fail('CREATIVE_VERSION_REQUIRED');
  required(ctx.current_context_summary,'CURRENT_CONTEXT_REQUIRED');
  required(ctx.source_health_summary,'SOURCE_HEALTH_REQUIRED');
  const lenses=arr(ctx.research_lenses);
  if(!lenses.length)fail('RESEARCH_LENS_REQUIRED');
  for(const lens of lenses){
    required(lens.principle,'RESEARCH_PRINCIPLE_REQUIRED');
    required(lens.application,'RESEARCH_APPLICATION_REQUIRED');
    required(lens.source_ref,'RESEARCH_SOURCE_REQUIRED');
    const research=byKey.get(lens.evidence_key);
    if(!research||!['RESEARCH_CANON','RAW_RESEARCH'].includes(research.source_type)||research.source_ref!==lens.source_ref)fail('RESEARCH_LENS_PROVENANCE_INVALID');
    required(lens.limitation,'RESEARCH_LIMITATION_REQUIRED');
  }
  const directions=arr(ctx.divergent_opportunities);
  if(!directions.length||directions.length>12)fail('DIVERGENCE_REQUIRED');
  const directionMap=new Map();
  for(const d of directions){
    const id=required(d.opportunity_key,'OPPORTUNITY_KEY_REQUIRED');
    if(directionMap.has(id))fail('OPPORTUNITY_KEY_DUPLICATE');
    required(d.angle,'OPPORTUNITY_ANGLE_REQUIRED');
    required(d.selection_reason,'OPPORTUNITY_SELECTION_REASON_REQUIRED');
    if(!['SELECT','REJECT','RETRIEVE','HOLD'].includes(d.decision))fail('OPPORTUNITY_DECISION_INVALID');
    // Creative-only ideas are explicitly allowed, but cannot become facts or selected output.
    if(d.decision==='SELECT')refs(d.evidence_keys,byKey,'OPPORTUNITY_GROUNDING_REQUIRED');
    directionMap.set(id,d);
  }
  if(new Set(directions.map(x=>key(x.angle))).size<Math.min(3,directions.length))fail('DIVERGENCE_ANGLES_DUPLICATE');
  if(directions.length<3&&!text(ctx.divergence_limit_reason))fail('DIVERGENCE_LIMIT_REASON_REQUIRED');
  required(ctx.feed_balance_reason,'FEED_BALANCE_REASON_REQUIRED');
  const findings=[];
  const summaries=[];
  for(const c of candidates){
    const p=obj(c.evidence_packet),r=obj(p.creative_reasoning);
    if(r.version!==THREAD_CREATIVE_VERSION)fail('CANDIDATE_CREATIVE_PACKET_REQUIRED');
    const d=directionMap.get(r.opportunity_key);
    if(!d||d.decision!=='SELECT')fail('CANDIDATE_OPPORTUNITY_NOT_SELECTED');
    required(r.main_claim,'MAIN_CLAIM_REQUIRED');
    required(r.angle,'CREATIVE_ANGLE_REQUIRED');
    if(!STRUCTURES.has(r.structure_type)||!ENDINGS.has(r.ending_type))fail('VOICE_STRUCTURE_INVALID');
    required(r.person_model_residue,'PERSON_MODEL_RESIDUE_REQUIRED');
    required(r.future_follow_value,'FUTURE_FOLLOW_VALUE_REQUIRED');
    required(r.difference_from_recent,'RECENT_DIFFERENCE_REQUIRED');
    const linked=new Set(arr(p.primary_keys).concat(arr(p.corroborating_keys),arr(p.counterevidence_keys)));
    if(!arr(d.evidence_keys).some(k=>linked.has(k)))fail('OPPORTUNITY_LINEAGE_MISMATCH');
    const primary=arr(p.primary_keys).map(k=>byKey.get(k)).filter(Boolean);
    if(!primary.length||primary.some(e=>!text(e.source_ref)))fail('PRIMARY_PROVENANCE_REQUIRED');
    if(c.evidence_strength==='GROUNDED'&&!primary.some(e=>!['RESEARCH_CANON','RAW_RESEARCH','TREND_SIGNAL','PRODUCTION_LEARNING'].includes(e.source_type)))fail('GROUNDED_OWN_SOURCE_REQUIRED');
    const whyKeys=refs(r.why_now_evidence_keys,byKey,'WHY_NOW_GROUNDING_REQUIRED');
    if(whyKeys.some(k=>!linked.has(k)))fail('WHY_NOW_OUTSIDE_LINEAGE');
    required(r.why_now_signal,'WHY_NOW_SIGNAL_REQUIRED');
    const search=obj(r.counterevidence_search);
    refs(search.searched_evidence_keys,byKey,'COUNTEREVIDENCE_SEARCH_REQUIRED');
    required(search.result,'COUNTEREVIDENCE_RESULT_REQUIRED');
    required(search.limitation,'COUNTEREVIDENCE_LIMITATION_REQUIRED');
    const claims=arr(r.claims);
    if(!claims.length)fail('CLAIM_PACKET_REQUIRED');
    for(const claim of claims){
      required(claim.text,'CLAIM_TEXT_REQUIRED');
      if(!['FACT','OBSERVATION','INTERPRETATION','HYPOTHESIS'].includes(claim.kind))fail('CLAIM_KIND_INVALID');
      const keys=refs(claim.evidence_keys,byKey,'CLAIM_SOURCE_REQUIRED');
      if(keys.some(k=>!linked.has(k)))fail('CLAIM_OUTSIDE_LINEAGE');
      for(const k of keys){
        const e=byKey.get(k);
        if(e.privacy_scope==='CONFIDENTIAL'||e.allowed_use==='INTERNAL_REASONING')fail('CLAIM_USE_NOT_PUBLIC');
      }
      if(['FACT','OBSERVATION'].includes(claim.kind)){
        if(keys.every(k=>['PRODUCTION_LEARNING','TREND_SIGNAL'].includes(byKey.get(k).source_type)))fail('CLAIM_AUTHORITY_INSUFFICIENT');
        if(claim.kind==='OBSERVATION'&&!keys.some(k=>HUMAN_SOURCES.has(byKey.get(k).source_type)||byKey.get(k).source_type==='CUSTOMER_SIGNAL'))fail('OBSERVATION_SOURCE_INVALID');
      }
    }
    const human=obj(r.human_voice_source);
    if(human.source_key){
      const e=byKey.get(human.source_key);
      if(!e||!linked.has(human.source_key)||(!HUMAN_SOURCES.has(e.source_type)&&!brandJudgment(e)))fail('HUMAN_VOICE_SOURCE_INVALID');
      if(['FIELD_NOTE_OBSERVATION','HUMAN_TEXTURE'].includes(c.content_job)&&!HUMAN_SOURCES.has(e.source_type))fail('REAL_EVENT_SOURCE_REQUIRED');
      if(!DIMENSIONS.has(human.dimension))fail('HUMAN_VOICE_DIMENSION_INVALID');
      required(human.detail,'HUMAN_VOICE_DETAIL_REQUIRED');
    }else if(['HUMAN_TEXTURE','FIELD_NOTE_OBSERVATION','PERSPECTIVE_JUDGMENT','MINI_KNOWLEDGE_THROUGH_JUDGMENT'].includes(c.content_job))fail('HUMAN_VOICE_SOURCE_REQUIRED');
    if(c.content_job==='MINI_KNOWLEDGE_THROUGH_JUDGMENT'&&!arr(p.primary_keys).concat(arr(p.corroborating_keys)).some(k=>['FACT_REGISTRY','RAW_RESEARCH','RESEARCH_CANON'].includes(byKey.get(k)?.source_type)))fail('KNOWLEDGE_FACT_REQUIRED');
    if(c.content_job==='CONVERSATION')required(r.conversation_learning_question,'CONVERSATION_PURPOSE_REQUIRED');
    if(c.content_job==='LOCAL_CONTEXT'){
      refs([r.local_context_source_key],byKey,'LOCAL_CONTEXT_SOURCE_REQUIRED');
      if(!linked.has(r.local_context_source_key))fail('LOCAL_CONTEXT_OUTSIDE_LINEAGE');
    }
    if(c.content_job==='LIGHT_PROMOTION'&&!primary.some(e=>e.source_type==='FACT_REGISTRY'&&e.source_date===targetDate))fail('CURRENT_OFFER_REQUIRED');
    if(c.qc_decision==='READY_FOR_APPROVAL'&&(c.generalization_flags.length||c.evidence_strength!=='GROUNDED'))fail('CREATIVE_READY_REQUIRES_GROUNDED_QC');
    if(c.qc_decision==='READY_FOR_APPROVAL'&&!text(c.draft_text))fail('READY_DRAFT_REQUIRED');
    const exception=obj(r.reuse_exception);
    for(const prev of recentContent){
      if(prev.status==='REJECTED'||prev.run_mode==='ACCEPTANCE')continue;
      const overlap=primary.filter(a=>arr(prev.evidence).some(b=>sameEvidence(a,b)));
      const repeated=threadClaimSimilarity(r.main_claim,prev.main_claim||prev.claim_focus||prev.draft_text)>=0.72;
      if(overlap.length||repeated){
        const sameDayOther=prev.target_date===targetDate&&prev.channel!=='THREADS';
        const allowed=exception.allowed===true&&text(exception.reason).length>=20
          &&arr(exception.content_refs).includes(prev.ref)&&text(exception.changed_value).length>=12
          &&!repeated;
        const finding={code:sameDayOther?'CROSS_CHANNEL_REUSE':'RECENT_REUSE',ref:prev.ref,evidence_keys:overlap.map(x=>x.evidence_key),claim_similarity:threadClaimSimilarity(r.main_claim,prev.main_claim||prev.claim_focus||prev.draft_text),exception:allowed};
        findings.push(finding);
        if(!allowed&&c.qc_decision==='READY_FOR_APPROVAL')fail(sameDayOther?'CROSS_CHANNEL_REUSE_BLOCKED':'RECENT_REUSE_REVIEW_REQUIRED');
      }
    }
    if(summaries.some(s=>threadClaimSimilarity(s.main_claim,r.main_claim)>=0.72))fail('CANDIDATE_CLAIM_DUPLICATE');
    if(summaries.some(s=>key(s.angle)===key(r.angle)&&s.structure_type===r.structure_type))fail('CANDIDATE_DIRECTION_DUPLICATE');
    summaries.push({candidate_no:c.candidate_no,main_claim:r.main_claim,angle:r.angle,structure_type:r.structure_type,ending_type:r.ending_type,content_job:c.content_job});
  }
  if(summaries.length>1&&new Set(summaries.map(x=>x.structure_type)).size===1&&!text(ctx.same_structure_reason))fail('STRUCTURE_VARIATION_REQUIRED');
  return {required:true,version:THREAD_CREATIVE_VERSION,checked_recent_count:recentContent.length,divergent_opportunity_count:directions.length,candidate_count:candidates.length,findings,summaries,limits:'Semantic checks are heuristic. Source meaning, writer faithfulness, privacy and medical claims still require independent QC and human approval.'};
}

// Server reads, not a client boolean, determine overlap context. Proposed work is
// labeled separately from verified published work; QA runs never become history.
export async function getThreadRecentContent({supabase,targetDate,excludePlanId=null}){
  const since=new Date(`${targetDate}T00:00:00Z`);since.setUTCDate(since.getUTCDate()-14);
  const from=since.toISOString().slice(0,10),recent=[];
  async function read(table,configure){const q=configure(supabase.from(table).select('*'));const r=await q;if(r.error)fail('RECENT_CONTENT_READ_FAILED');return r.data||[];}
  const plans=await read('social_thread_daily_plans',q=>q.gte('target_date',from).lte('target_date',targetDate).order('target_date',{ascending:false}).limit(30));
  for(const plan of plans){
    if(plan.id===excludePlanId||plan.source_context?.run_mode==='ACCEPTANCE')continue;
    const evidence=await read('social_thread_evidence',q=>q.eq('plan_id',plan.id));
    const candidates=await read('social_thread_candidates',q=>q.eq('plan_id',plan.id));
    for(const c of candidates)if(c.status!=='REJECTED')recent.push({ref:`thread:${c.id}`,channel:'THREADS',target_date:plan.target_date,status:c.status,main_claim:c.evidence_packet?.creative_reasoning?.main_claim||c.title,draft_text:c.draft_text,evidence:evidence.filter(e=>arr(c.evidence_packet?.primary_keys).includes(e.evidence_key))});
  }
  const directorPlans=await read('social_director_daily_plans',q=>q.eq('target_date',targetDate).in('run_mode',['PRODUCTION','SHADOW']));
  for(const plan of directorPlans){
    const assignments=await read('social_director_channel_assignments',q=>q.eq('plan_id',plan.id));
    const keys=[...new Set(assignments.flatMap(x=>arr(x.evidence_keys)))];
    const evidenceItems=keys.length?await read('social_evidence_items',q=>q.in('evidence_key',keys)):[];
    const evidenceMap=new Map(evidenceItems.map(x=>[x.evidence_key,x]));
    for(const a of assignments)if(a.channel!=='THREADS'&&!['BLOCKED','HOLD'].includes(a.qc_decision))recent.push({ref:`assignment:${a.id}`,channel:a.channel,target_date:targetDate,status:'PROPOSED',run_mode:plan.run_mode,main_claim:a.claim_focus,evidence:arr(a.evidence_keys).map(k=>evidenceMap.get(k)).filter(Boolean)});
  }
  for(const [table,dateTable,idKey,channel,textKey] of [
    ['social_reel_candidates','social_reel_candidate_batches','batch_id','REEL','hook'],
    ['social_story_items','social_story_daily_plans','plan_id','STORIES','frame_text']
  ]){
    const batches=await read(dateTable,q=>q.eq('target_date',targetDate));
    for(const batch of batches){
      if(batch.source_context?.run_mode==='ACCEPTANCE')continue;
      const rows=await read(table,q=>q.eq(idKey,batch.id));
      for(const c of rows)if(c.status!=='REJECTED')recent.push({ref:`${channel.toLowerCase()}:${c.id}`,channel,target_date:targetDate,status:'PROPOSED',main_claim:c.main_claim||c[textKey]||c.title,evidence:[]});
    }
  }
  for(const [table,runTable,channel,textKey] of [
    ['social_reel_evidence_candidates','social_reel_evidence_runs','REEL','core_message'],
    ['social_story_evidence_items','social_story_evidence_runs','STORIES','frame_text']
  ]){
    const runs=await read(runTable,q=>q.eq('target_date',targetDate).in('run_mode',['PRODUCTION','SHADOW']));
    for(const run of runs){
      const rows=await read(table,q=>q.eq('run_id',run.id));
      const keys=[...new Set(rows.flatMap(x=>arr(x.claim_refs).map(r=>typeof r==='string'?r:r.evidence_key)))].filter(Boolean);
      const items=keys.length?await read('social_evidence_items',q=>q.in('evidence_key',keys)):[];
      for(const c of rows)if(c.status!=='REJECTED'&&!['BLOCKED','HOLD'].includes(c.qc_decision)){
        const refs=new Set(arr(c.claim_refs).map(r=>typeof r==='string'?r:r.evidence_key));
        recent.push({ref:`${channel.toLowerCase()}-evidence:${c.id}`,channel,target_date:targetDate,status:'PROPOSED',run_mode:run.run_mode,main_claim:c[textKey]||c.title,evidence:items.filter(e=>refs.has(e.evidence_key))});
      }
    }
  }
  const posts=await read('social_published_posts',q=>q.gte('published_at',since.toISOString()).order('published_at',{ascending:false}).limit(80));
  for(const post of posts)recent.push({ref:`published:${post.id}`,channel:post.platform==='THREADS'?'THREADS':'INSTAGRAM',target_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(post.published_at)),status:'PUBLISHED_VERIFIED',main_claim:post.caption,evidence:[]});
  const blog=await supabase.from('admin_article_drafts')
    .select('id,title,description,body_markdown,published,publish_status,publish_verified_at,published_url,status')
    .gte('published',from).order('published',{ascending:false}).limit(30);
  if(blog.error)fail('RECENT_CONTENT_READ_FAILED');
  for(const article of blog.data||[]){
    const verified=article.publish_status==='PUBLISHED'&&article.publish_verified_at&&article.published_url;
    if(!verified&&['ARCHIVED','REJECTED'].includes(article.status))continue;
    recent.push({ref:`blog:${article.id}`,channel:'BLOG',target_date:article.published,status:verified?'PUBLISHED_VERIFIED':'PROPOSED',
      main_claim:`${article.title||''} ${article.description||''}`,evidence:[{evidence_key:`blog-body:${article.id}`,source_ref:article.published_url||`admin_article_drafts:${article.id}`,evidence_text:text(article.body_markdown,12000)}]});
  }
  return recent;
}
