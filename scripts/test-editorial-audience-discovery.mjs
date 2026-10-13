import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {audienceMode,audienceMetadata,auditAudienceScores,evaluateAudienceCandidate,selectAudienceCandidates} from '../lib/editorialAudienceDiscovery.mjs';
import {prepareTopicProposal,approvedQueue,chooseTopic,answerInterview,topicNotification} from '../lib/editorialTopicApproval.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('../editorial/audience-discovery-v08-fixtures.json',import.meta.url),'utf8'));
const date=new Date('2026-10-13T08:00:00+09:00');
const oldHistory=fixture.items.filter(x=>x.id.startsWith('OLD')).flatMap(x=>x.nearest_content_ids.map(id=>({content_id:id,title:'history-'+id})));
function candidate(row,i) {
  const meta={
    audience_stage:row.stage,psychological_hook:row.hook||'COMPARISON',
    reader_scene:row.scene||'サービスを探し比較している生活上の困りごとの場面',
    reader_job:row.question||'複数の選択肢を比較し自分で判断する',
    reader_question:row.question||'どのように選べば良いか',
    new_reader_takeaway:row.new_takeaway||'既存記事の内容を踏まえ、自分で適切な選択ができる考え方を整理する',
    incremental_answer:row.incremental_answer||'前回には含まれない理由と実用的な判断基準を提示する',
    natural_service_fit:row.service_fit||'TRAINING: 読者が実生活で判断できるよう専門性を活用する',
    content_action:row.id==='OLD-1'||row.id==='OLD-3'?'UPDATE_EXISTING':'NEW_ARTICLE',
    search_signal_type:'QUERY_HYPOTHESIS',evidence_items:[{kind:'RESEARCH_INTERPRETATION',source:'Research article with scope limitations'}],
    nearest_content_ids:row.nearest_content_ids,same_answer_as_existing:row.id==='OLD-1'||row.id==='OLD-3',
    unverified_health_claim:false
  };
  return {
    candidate_id:row.id,generated_at:date.toISOString(),week_start:date.toISOString(),rank:i+1,
    topic:row.title,title_candidate:row.title,primary_query:row.search_query_hypothesis||('想定検索 ' + row.question),
    status:'CANDIDATE',route_lane:'WEB_BLOG',decision:'PUBLISH',total_score:88-i,portfolio_final_score:88-i,
    editorial_lane: row.service_fit==='BOXING'?'BOXING':row.service_fit==='OXYGEN_ROOM_OPTIONAL'?'OXYGEN_ROOM':'TRAINING',
    content_cluster:row.service_fit==='BOXING'?'BOXING':row.service_fit==='OXYGEN_ROOM_OPTIONAL'?'RECOVERY':'TRAINING',
    why_now:meta.reader_scene+'を理解してもらうため',audience_question:meta.reader_question,
    unique_angle:meta.incremental_answer,notes:'AUDIENCE_V08:'+JSON.stringify(meta),
    audience_v08:meta
  };
}
const n=fixture.items.filter(x=>x.id.startsWith('NEW')).map(candidate);
const olds=fixture.items.filter(x=>x.id.startsWith('OLD')).map((x,i)=>candidate(x,i+3));
const history=oldHistory;
const defaults={settings:{daily_editorial_cadence:'DAILY'},rows:[],articleHistory:history,outputRows:[],now:date};
function withMode(mode,fn){const before=process.env.THE_REV_AUDIENCE_DISCOVERY_MODE;process.env.THE_REV_AUDIENCE_DISCOVERY_MODE=mode;try{return fn();}finally{if(before==null)delete process.env.THE_REV_AUDIENCE_DISCOVERY_MODE;else process.env.THE_REV_AUDIENCE_DISCOVERY_MODE=before;}}

test('OFF default and modes',()=>{
  assert.equal(audienceMode(undefined),'OFF');assert.equal(audienceMode('SHADOW'),'SHADOW');
  assert.equal(audienceMode('ENFORCE'),'ENFORCE');assert.equal(audienceMode('BROKEN'),'OFF');
});
test('Sheet notes contract can be read without schema migration',()=>{
  assert.equal(audienceMetadata({notes:n[0].notes}).audience_stage,'PROBLEM_AWARE');
  assert.equal(audienceMetadata({notes:'foo'}),null);
  assert.equal(audienceMetadata({notes:'AUDIENCE_V08:{broken'}),null);
});
test('score arithmetic rejects caps, NaNs and mismatch',()=>{
  const okay={reader_relevance:25,novelty:25,seo_intent:20,service_fit:15,evidence_readiness:15,total_score:100};
  assert.equal(auditAudienceScores(okay).pass,true);
  assert.equal(auditAudienceScores({...okay,novelty:26}).pass,false);
  assert.equal(auditAudienceScores({...okay,total_score:99}).pass,false);
  assert.equal(auditAudienceScores({...okay,seo_intent:NaN}).pass,false);
});
test('unverified search stays a hypothesis',()=>{
  const audit=evaluateAudienceCandidate(n[0],{history});
  assert.equal(audit.eligible,true);assert.equal(audit.search_measured,false);assert.equal(audit.measured_impressions,null);
  assert.equal(audit.scores.seo_intent,12);assert(audit.notices.includes('SEARCH_VOLUME_UNVERIFIED'));
});
test('only server-supplied GSC source can raise measured section',()=>{
  const q=n[0].primary_query;
  assert.equal(evaluateAudienceCandidate(n[0],{history,gscEvidenceByQuery:{[q]:{verified:true,source:'AI_ESTIMATE',impressions:999}}}).scores.seo_intent,12);
  assert.equal(evaluateAudienceCandidate(n[0],{history,gscEvidenceByQuery:{[q]:{verified:true,source:'GOOGLE_SEARCH_CONSOLE',impressions:1}}}).scores.seo_intent,20);
});
test('model cannot self-certify first-party sources without trusted collector evidence',()=>{
  const altered={...n[0],audience_v08:{...n[0].audience_v08,evidence_items:[{kind:'FIRST_PARTY_VERIFIED',source:'unverified invented source'}]}};
  const untrusted=evaluateAudienceCandidate(altered,{history});
  assert.equal(untrusted.scores.evidence_readiness,8);
  assert(untrusted.notices.includes('SOURCE_CLAIM_NOT_VERIFIED_BY_COLLECTOR'));
  const verified=evaluateAudienceCandidate(altered,{history,trustedEvidenceRefs:['unverified invented source']});
  assert.equal(verified.scores.evidence_readiness,15);
});
test('missing metadata fails closed for ENFORCE but is valid for legacy',()=>{
  const without={...n[0],audience_v08:undefined,notes:'ordinary notes'};
  assert.equal(evaluateAudienceCandidate(without,{history}).eligible,false);
  withMode('OFF',()=>assert.equal(prepareTopicProposal({...defaults,shortlist:[without,n[1],n[2]]}).proposal.options.length,3));
});
test('existing article rewrites and unsupported health claims never qualify',()=>{
  assert.equal(olds.filter(x=>!evaluateAudienceCandidate(x,{history}).eligible).length>=2,true);
  assert(evaluateAudienceCandidate({...n[0],title_candidate:'肩こりが治る酸素ルーム'},{history}).errors.some(x=>x.includes('UNVERIFIED_HEALTH_CLAIM')));
  assert(evaluateAudienceCandidate({...n[0],audience_v08:{...n[0].audience_v08,unverified_health_claim:true}},{history}).errors.includes('UNVERIFIED_HEALTH_CLAIM'));
});
test('same search intent in historic article is blocked',()=>{
  const past={content_id:'EXACT',title:n[0].title_candidate,primary_query:n[0].primary_query};
  assert(evaluateAudienceCandidate(n[0],{history:[...history,past]}).errors.some(x=>x.startsWith('ANSWER_ALREADY_EXISTS')));
});
test('three different reader jobs, not only lane labels',()=>{
  const batch=n.map(x=>({candidate:x,candidate_id:x.candidate_id,eligible:true,score:90}));
  const result=selectAudienceCandidates(batch,{history});
  assert.equal(result.selected.length,3);
  assert.equal(new Set(result.selected.map(x=>x.audience.meta.reader_job)).size,3);
});
test('ENFORCE selects three audience-first options and enriches LINE notice',()=>{
  withMode('ENFORCE',()=>{
    const p=prepareTopicProposal({...defaults,shortlist:[...olds,...n]});
    assert.equal(p.status,'TOPIC_SELECTION_WAITING');
    assert.equal(p.proposal.options.length,3);
    assert(p.proposal.options.every(o=>o.candidate_id.startsWith('NEW-')));
    const notice=topicNotification(p.proposal);
    assert(notice.includes('想定読者'));assert(notice.includes('検索根拠: 検索語の仮説'));
    assert(notice.length<7000);
    assert.equal(approvedQueue(p.proposal,{...defaults,shortlist:[...olds,...n]}).queue_row,null);
  });
});
test('owner approval retains revalidation before queue creation',()=>{
  withMode('ENFORCE',()=>{
    const p=prepareTopicProposal({...defaults,shortlist:n}).proposal;
    const chosen=p.options.find(o=>o.candidate_id==='NEW-3');
    assert(chosen);
    const approved={...p,...chooseTopic(p,{candidateId:chosen.candidate_id,source:'GPT',actor:'test-owner',now:date})};
    const interviewed=approved.status==='INTERVIEW_WAITING'?{...approved,...answerInterview(approved,{answers:['安全に実施できる具体的な説明をします。','必要な調整をして無理なく進めます。'],source:'GPT',actor:'test-owner',now:date})}:approved;
    assert.equal(approvedQueue(interviewed,defaults).status,'READY_TO_CREATE');
    const bad={...interviewed,options:interviewed.options.map(o=>o.candidate_id!==chosen.candidate_id?o:{...o,candidate:{...o.candidate,audience_v08:{...o.candidate.audience_v08,content_action:'REJECT'}}})};
    assert.equal(approvedQueue(bad,defaults).status,'CANDIDATE_NO_LONGER_ELIGIBLE');
  });
});
test('SHADOW preserves option ranking and human choice',()=>{
  const off=withMode('OFF',()=>prepareTopicProposal({...defaults,shortlist:n}).proposal.options.map(o=>o.candidate_id));
  const shadow=withMode('SHADOW',()=>prepareTopicProposal({...defaults,shortlist:n}).proposal.options.map(o=>o.candidate_id));
  assert.deepEqual(shadow,off);
});
test('GAS generation prompt only enabled by script property',()=>{
  const source=fs.readFileSync(new URL('../editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs',import.meta.url),'utf8');
  const context={V069_STATUS_URL:'https://example.invalid',PropertiesService:{getScriptProperties:()=>({getProperty:key=>'ENFORCE'})}};
  vm.createContext(context);vm.runInContext(source,context);
  const live=context.v080AudienceDirection_({getProperty:()=> 'ENFORCE'});
  const off=context.v080AudienceDirection_({getProperty:()=> 'OFF'});
  assert(live.includes('AUDIENCE_V08:'));assert(!off.includes('AUDIENCE_V08:'));
  assert.equal(context.v080AudienceDirection_({getProperty:()=> 'SHADOW'}),off);
  assert(source.includes('var candidates = generateBlogTopicCandidates_(ctx,5)'));
});
