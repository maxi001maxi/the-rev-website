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
test('real Oct14 shortlist blocks rejected and earlier higher-rated records',()=>{
 const p=freshDailyShortlist([old,seed,rejected,newTwo,newFour],when);
 assert.equal(p.strict,true);assert.equal(p.source,'TODAY_DAILY_ONLY');
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
 const pool=freshDailyShortlist([old,rejected,newTwo,newFour,candidate('BT-20261014-DAILY-5','新しい運動比較')],when);
 const stale={options:[{candidate_id:old.candidate_id,candidate:old},{candidate_id:seed.candidate_id,candidate:seed},{candidate_id:newTwo.candidate_id,candidate:newTwo}]};
 assert(shouldReplaceWaitingProposal(stale,pool,[{eligible:true},{eligible:true},{eligible:true}]));
 const fresh={options:pool.candidates.slice(0,3).map(c=>({candidate_id:c.candidate_id,candidate:c}))};
 assert.equal(shouldReplaceWaitingProposal(fresh,pool,[{eligible:true},{eligible:true},{eligible:true}]),false);
});
test('manual test fixtures remain supported without a daily pool',()=>{
 const a=[candidate('TEST-1','モデルテストテーマA'),candidate('TEST-2','モデルテストテーマB')];
 const p=freshDailyShortlist(a,when);assert.equal(p.strict,false);assert.equal(p.candidates.length,2);
});
