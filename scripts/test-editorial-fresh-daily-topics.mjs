import test from 'node:test';
import assert from 'node:assert/strict';
import {freshDailyShortlist,shouldReplaceWaitingProposal,isDismissedTopic} from '../lib/editorialFreshDailyTopics.mjs';
const when=new Date('2026-10-14T08:20:00+09:00');
function candidate(id,title){return{candidate_id:id,title_candidate:title,generated_at:'2026/10/14 5:01:44',week_start:'2026/10/14',status:'CANDIDATE',route_lane:'WEB_BLOG',decision:'PUBLISH',primary_query:title,why_now:title,unique_angle:'読者の期待とは異なる研究可能な視点で答えを提示する',total_score:80,editorial_lane:'TRAINING'};}
const old=candidate('BT-20261008-DAILY-1','パーソナルジムは何で選ぶ？初心者が「きつさ」より先に確認したい5つのこと');
const rejected=candidate('BT-20261014-DAILY-1','パーソナルジムは何で選ぶ？結果の前に確認したい「無理をさせない」5つのポイント');
const newTwo=candidate('BT-20261014-DAILY-2','体力が落ちたと感じたら、運動は何から始める？最初の1週間で決めたいこと');
const newFour=candidate('BT-20261014-DAILY-4','運動後のサウナで回復した気がするのはなぜ？');
const seed=candidate('IDEA-V070-001','ミット打ちで肩に力が入るとき、最初に見直すこと');
const meta={audience_stage:'PROBLEM_AWARE',psychological_hook:'RECOGNITION',reader_scene:'日常の体力低下を自覚している会社員の生活場面',reader_job:'自分で始められる方法を判断する',reader_question:'何をすべきなのか',new_reader_takeaway:'生活と運動の量の組み立て方を理解する',incremental_answer:'既存記事より別の問題に実用的に答える',content_action:'NEW_ARTICLE',evidence_items:[{kind:'HYPOTHESIS',source:'research pending'}]};
for(const c of [newTwo,newFour])c.notes='AUDIENCE_V08:'+JSON.stringify(meta);

test('real Oct14 shortlist blocks rejected and earlier higher-rated records',()=>{
 const p=freshDailyShortlist([old,seed,rejected,newTwo,newFour],when);
 assert.equal(p.strict,true);assert.equal(p.source,'TODAY_DAILY_AUDIENCE_CONTRACT_REQUIRED');
 assert.deepEqual(p.candidates.map(c=>c.candidate_id),['BT-20261014-DAILY-2','BT-20261014-DAILY-4']);
});
test('no today daily pool never quietly backfills old daily or v07 seeds',()=>{
 const p=freshDailyShortlist([old,seed],when);assert.equal(p.strict,true);assert.equal(p.candidates.length,0);
});
test('proper changes do not unexpectedly reject distinct new research questions',()=>{
 assert.equal(isDismissedTopic(newFour),false);
 assert.equal(isDismissedTopic({title_candidate:'DENBA Healthと睡眠の関係はどこまで調べられている？'}),false);
 assert.equal(isDismissedTopic({title_candidate:'パーソナルジム 選び方 初心者'}),true);
});
test('waiting target must refresh when it contains dismissed, missing-day, or ineligible options',()=>{
 const newFive=candidate('BT-20261014-DAILY-5','新しい運動比較');newFive.notes='AUDIENCE_V08:'+JSON.stringify(meta);
 const pool=freshDailyShortlist([old,rejected,newTwo,newFour,newFive],when);
 const stale={options:[{candidate_id:old.candidate_id,candidate:old},{candidate_id:seed.candidate_id,candidate:seed},{candidate_id:newTwo.candidate_id,candidate:newTwo}]};
 assert(shouldReplaceWaitingProposal(stale,pool,[{eligible:true},{eligible:true},{eligible:true}]));
 const fresh={options:pool.candidates.slice(0,3).map(c=>({candidate_id:c.candidate_id,candidate:c}))};
 assert.equal(shouldReplaceWaitingProposal(fresh,pool,[{eligible:true},{eligible:true},{eligible:true}]),false);
});
test('manual test fixtures remain supported without a daily pool',()=>{
 const a=[candidate('TEST-1','モデルテストテーマA'),candidate('TEST-2','モデルテストテーマB')];
 const p=freshDailyShortlist(a,when);assert.equal(p.strict,false);assert.equal(p.candidates.length,2);
});

test('today legacy GAS pool lacking Audience v0.8 reader contract must not be sent as a fresh LINE proposal',()=>{
 const legacy=candidate('BT-20261014-DAILY-8','全く新しいが旧方式で作った候補');
 const p=freshDailyShortlist([old,legacy],when);
 assert.equal(p.strict,true);assert.equal(p.candidates.length,0);
});
test('independent audited topic batch supersedes v0.7 daily regardless of legacy score',()=>{
 const audited=candidate('BT-20261014-AUD08-1','生活者が好きになる新しい記事');
 audited.notes='AUDIENCE_V08:'+JSON.stringify(meta);
 const p=freshDailyShortlist([old,newTwo,audited],when);
 assert.equal(p.source,'TODAY_AUDIENCE08_ONLY');
 assert.deepEqual(p.candidates.map(x=>x.candidate_id),[audited.candidate_id]);
});
