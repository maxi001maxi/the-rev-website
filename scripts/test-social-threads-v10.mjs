import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeThreadEvidence,normalizeThreadCandidate} from '../lib/socialThreadModel.mjs';
import {THREAD_CREATIVE_VERSION as version,validateThreadCreativePlan,getThreadRecentContent} from '../lib/socialThreadCreative.mjs';
import {prepareThreadPlan,chooseThreadCandidate,linkVerifiedThreadPublication} from '../lib/socialThreads.mjs';

export function fixture(){
  const evidence=[
    normalizeThreadEvidence({key:'fp-life',source_type:'OPERATOR_FIRST_PARTY',source_ref:'interview:life:row1',evidence_text:'家のソファで休むと再出発しにくいので、仕事帰りの直行や準備負担まで一緒に考える。',allowed_use:'PARAPHRASE_OK'}),
    normalizeThreadEvidence({key:'research-voice',source_type:'RESEARCH_CANON',source_ref:'drive:voice-canon',evidence_text:'Human Voiceは口語ではなく、実際の観察や選択、判断から取り出す。',allowed_use:'INTERNAL_REASONING'})
  ];
  const sourceContext={threads_creative_required:true,threads_creative_version:version,
    current_context_summary:'予約制ジムの店舗理解を増やす段階。',source_health_summary:'顧客Signal未取得、Threads実公開履歴なし。',
    research_lenses:[{evidence_key:'research-voice',source_ref:'drive:voice-canon',principle:'判断や選択から人間味を出す',application:'来店準備で何を見るかを短く残す',limitation:'フォロー増加の実証ではない'}],
    divergent_opportunities:[
      {opportunity_key:'life',angle:'家に帰る前の動線',decision:'SELECT',evidence_keys:['fp-life'],selection_reason:'回数判断と異なる生活への視点'},
      {opportunity_key:'note',angle:'店内の小さな準備風景',decision:'RETRIEVE',evidence_keys:[],selection_reason:'実際の現場素材が不足'},
      {opportunity_key:'reply',angle:'知りたい来店前の疑問を聞く',decision:'REJECT',evidence_keys:[],selection_reason:'今日はStoriesが同じLearning Jobを担う'}
    ],feed_balance_reason:'専門知識へ偏らせず生活動線の視点を候補化する。'};
  const raw={title:'帰る前に寄る',content_job:'PERSPECTIVE_JUDGMENT',why_now:'今日の専門判断案と別の生活動線を見せる',evidence_strength:'GROUNDED',confidence:'MEDIUM',qc_decision:'READY_FOR_APPROVAL',draft_text:'通う時間だけでなく、家に帰る前に寄れるかまで一緒に考えます。',evidence_links:[{key:'fp-life',role:'PRIMARY'},{key:'research-voice',role:'CORROBORATING'}],evidence_packet:{creative_reasoning:{version,opportunity_key:'life',main_claim:'来店時刻や準備負担を生活動線まで含めて考える',angle:'来店前の生活への目線',structure_type:'OBSERVATION_FIRST',ending_type:'OBSERVATION',person_model_residue:'運動時間の外側にある準備や移動も気にする店',future_follow_value:'身体と生活をどうつなぐかという見方を次も読める',difference_from_recent:'8回で止める専門判断から生活の動線へ変える',why_now_evidence_keys:['fp-life'],why_now_signal:'過去インタビューに準備負担への着眼があり、専門判断以外を提示できる',human_voice_source:{source_key:'fp-life',dimension:'NOTICE',detail:'家に帰った後に再出発しづらいところまで見る'},counterevidence_search:{searched_evidence_keys:['fp-life'],result:'全員に直行が合うという証拠はない',limitation:'顧客自身の声がなく、来店増加は仮説'},claims:[{text:'生活動線も一緒に考える',kind:'OBSERVATION',evidence_keys:['fp-life']}]}}};
  return {evidence,sourceContext,raw,candidates:[normalizeThreadCandidate(raw,1,new Set(evidence.map(x=>x.evidence_key))).row],targetDate:'2026-10-07'};
}
const check=f=>validateThreadCreativePlan(f);
test('creative-only directions remain free while selected output uses source-grounded human judgment',()=>{
  const result=check(fixture());assert.equal(result.version,version);assert.equal(result.divergent_opportunity_count,3);
});
test('declared research must point to retrieved research, not model prior',()=>{
  const f=fixture();f.sourceContext.research_lenses[0].source_ref='invented';assert.throws(()=>check(f),/RESEARCH_LENS_PROVENANCE_INVALID/);
});
test('a scalar divergence count cannot replace real considered directions',()=>{
  const f=fixture();delete f.sourceContext.divergent_opportunities;f.sourceContext.divergent_direction_count=10;assert.throws(()=>check(f),/DIVERGENCE_REQUIRED/);
});
test('limited source pool permits fewer directions with an honest reason',()=>{
  const f=fixture();f.sourceContext.divergent_opportunities=f.sourceContext.divergent_opportunities.slice(0,1);
  assert.throws(()=>check(f),/DIVERGENCE_LIMIT_REASON_REQUIRED/);f.sourceContext.divergence_limit_reason='実際のFirst-party素材が一つしかない';assert.equal(check(f).candidate_count,1);
});
test('casual voice without first-party fails and internal material cannot leak into assertions',()=>{
  const f=fixture();f.candidates[0].evidence_packet.creative_reasoning.human_voice_source.source_key='research-voice';assert.throws(()=>check(f),/HUMAN_VOICE_SOURCE_INVALID/);
  const g=fixture();g.evidence[0].allowed_use='INTERNAL_REASONING';assert.throws(()=>check(g),/CLAIM_USE_NOT_PUBLIC/);
});
test('claim refs and why-now must stay inside the actual candidate lineage',()=>{
  const f=fixture();f.candidates[0].evidence_packet.creative_reasoning.claims[0].evidence_keys=['missing'];assert.throws(()=>check(f),/CLAIM_SOURCE_REQUIRED/);
  const g=fixture();g.candidates[0].evidence_packet.creative_reasoning.counterevidence_search.result='';assert.throws(()=>check(g),/COUNTEREVIDENCE_RESULT_REQUIRED/);
});
test('renamed evidence keys cannot evade same-day cross-channel reuse',()=>{
  const f=fixture();f.recentContent=[{ref:'reel:1',channel:'REEL',target_date:f.targetDate,main_claim:'別の主張',evidence:[{...f.evidence[0],evidence_key:'alias'}]}];assert.throws(()=>check(f),/CROSS_CHANNEL_REUSE_BLOCKED/);
});
test('a documented reuse exception requires changed value and never permits repeated claim',()=>{
  const f=fixture();f.recentContent=[{ref:'reel:1',channel:'REEL',target_date:f.targetDate,main_claim:'別の主張',evidence:[f.evidence[0]]}];
  f.candidates[0].evidence_packet.creative_reasoning.reuse_exception={allowed:true,reason:'キャンペーンで視覚の実例と、来店の準備に関する会話を補完するため',content_refs:['reel:1'],changed_value:'同じ実例に含まれる生活動線の判断だけを会話へ展開する'};
  assert.equal(check(f).findings[0].exception,true);
  f.recentContent[0].main_claim=f.candidates[0].evidence_packet.creative_reasoning.main_claim;assert.throws(()=>check(f),/CROSS_CHANNEL_REUSE_BLOCKED/);
});
test('QA runs do not become creative history and novel claims pass',()=>{
  const f=fixture();f.recentContent=[{ref:'qa:1',channel:'REEL',target_date:f.targetDate,run_mode:'ACCEPTANCE',main_claim:f.candidates[0].title,evidence:f.evidence}];assert.equal(check(f).findings.length,0);
});
test('duplicate batch claims cannot masquerade as different jobs or endings',()=>{
  const f=fixture();f.candidates.push(structuredClone(f.candidates[0]));f.candidates[1].content_job='HUMAN_TEXTURE';f.candidates[1].evidence_packet.creative_reasoning.ending_type='OPEN';assert.throws(()=>check(f),/CANDIDATE_CLAIM_DUPLICATE/);
});
test('exploratory content stays review-required and generalization cannot self-promote',()=>{
  const f=fixture();f.candidates[0].evidence_strength='EXPLORATORY';assert.throws(()=>check(f),/CREATIVE_READY_REQUIRES_GROUNDED_QC/);f.candidates[0].qc_decision='REVIEW_REQUIRED';assert.equal(check(f).candidate_count,1);
});

function db(tables={}){
  const writes=[];
  return {writes,from(table){let rows=structuredClone(tables[table]||[]),one=false;
    const q={select(){return q},eq(k,v){rows=rows.filter(x=>x[k]===v);return q},neq(k,v){rows=rows.filter(x=>x[k]!==v);return q},in(k,v){rows=rows.filter(x=>v.includes(x[k]));return q},gte(k,v){rows=rows.filter(x=>x[k]>=v);return q},lte(k,v){rows=rows.filter(x=>x[k]<=v);return q},order(){return q},limit(n){rows=rows.slice(0,n);return q},maybeSingle(){one=true;return q},single(){one=true;return q},delete(){writes.push(table);return q},update(){writes.push(table);return q},insert(){writes.push(table);return q},upsert(){writes.push(table);return q},then(resolve){resolve({data:one?rows[0]||null:rows,error:null})}};return q;
  }};
}
test('prepare fails before any persistence if creative packet is incomplete',async()=>{
  const f=fixture(),supabase=db();delete f.raw.evidence_packet.creative_reasoning.future_follow_value;
  await assert.rejects(()=>prepareThreadPlan({supabase,targetDate:f.targetDate,evidence:f.evidence,candidates:[f.raw],sourceContext:f.sourceContext}),/FUTURE_FOLLOW_VALUE_REQUIRED/);assert.equal(supabase.writes.length,0);
});
test('new cross-channel assignment between drafting and choosing blocks approval before writes',async()=>{
  const f=fixture();const supabase=db({social_thread_daily_plans:[{id:'plan',target_date:f.targetDate,status:'READY',source_context:f.sourceContext}],social_thread_candidates:[{...f.candidates[0],id:'candidate',plan_id:'plan'}],social_thread_evidence:f.evidence.map(x=>({...x,plan_id:'plan'})),social_director_daily_plans:[{id:'director',target_date:f.targetDate,run_mode:'PRODUCTION'}],social_director_channel_assignments:[{id:'reel',plan_id:'director',channel:'REEL',claim_focus:'違う主張',evidence_keys:['fp-life'],qc_decision:'READY'}],social_evidence_items:f.evidence});
  await assert.rejects(()=>chooseThreadCandidate({supabase,targetDate:f.targetDate,candidateNo:1}),/CROSS_CHANNEL_REUSE_BLOCKED/);assert.equal(supabase.writes.length,0);
});
test('publication evidence cannot bypass human selection',async()=>{
  const f=fixture(),supabase=db({social_thread_daily_plans:[{id:'plan',target_date:f.targetDate}],social_thread_candidates:[{...f.candidates[0],plan_id:'plan',id:'candidate',status:'CANDIDATE'}]});
  await assert.rejects(()=>linkVerifiedThreadPublication({supabase,targetDate:f.targetDate,candidateNo:1,platformMediaId:'post'}),/HUMAN_APPROVAL_REQUIRED/);assert.equal(supabase.writes.length,0);
});
test('recent retrieval excludes acceptance threads, labels proposals, and reads actual sources',async()=>{
  const f=fixture();const supabase=db({social_thread_daily_plans:[{id:'qa',target_date:f.targetDate,source_context:{run_mode:'ACCEPTANCE'}}],social_thread_candidates:[{id:'qa-c',plan_id:'qa'}],social_director_daily_plans:[{id:'director',target_date:f.targetDate,run_mode:'SHADOW'}],social_director_channel_assignments:[{id:'story',plan_id:'director',channel:'STORIES',claim_focus:'実店内',evidence_keys:['fp-life'],qc_decision:'READY'}],social_evidence_items:f.evidence});
  const rows=await getThreadRecentContent({supabase,targetDate:f.targetDate});assert.equal(rows.length,1);assert.equal(rows[0].status,'PROPOSED');assert.equal(rows[0].evidence[0].source_ref,'interview:life:row1');
});
