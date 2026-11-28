import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { freshDailyShortlist } from '../lib/editorialFreshDailyTopics.mjs';
const when=new Date('2026-10-14T10:40:00+09:00');
const meta=role=>({editorial_role:role,editorial_role_reason:'読者の問いに具体的な判断を与える',audience_stage:'PROBLEM_AWARE',psychological_hook:'RECOGNITION',reader_scene:'一人で初めて運動施設を使う前に迷っている生活場面',reader_job:'具体的な利用方法が知りたい',reader_question:'本当はどう使えばよいのだろう',new_reader_takeaway:'具体的な理解と選択肢を整理する',incremental_answer:'既存の記事とは異なる新しい疑問を説明する',natural_service_fit:'体験の安心につながる場合だけサービスを紹介する',content_action:'NEW_ARTICLE',search_signal_type:'QUERY_HYPOTHESIS',unverified_health_claim:false,evidence_items:[{kind:'HYPOTHESIS',source:'research needed'}]});
const make=(prefix,i,role)=>({candidate_id:prefix+i,title_candidate:'読者の実際の生活上の疑問 '+i,notes:'AUDIENCE_V08:'+JSON.stringify(meta(role)),why_now:'読者が体験する前に不安を持つため',score_breakdown:{reader:78},generated_at:'2026/10/14 11:00'});
test('one-time live five replace legacy and manually curated lists',()=>{
 const live=Array.from({length:5},(_,i)=>make('BT-20261014-AUD08-LIVE-',i+1,['KNOWLEDGE','SERVICE_EXPERIENCE','FACILITY_AND_TRUST','COMPARISON_DECISION','COMMUNITY_STORY'][i]));
 const manual=Array.from({length:5},(_,i)=>make('BT-20261014-AUD08-',i+1,'KNOWLEDGE'));
 const p=freshDailyShortlist([...manual,...live],when);
 assert.equal(p.source,'TODAY_VERIFIED_GAS_AUD08_LIVE');
 assert.deepEqual(p.candidates.map(c=>c.candidate_id),live.map(c=>c.candidate_id));
});
test('partial real batch fails closed with no old-manual fallback',()=>{
 const p=freshDailyShortlist([make('BT-20261014-AUD08-',1,'KNOWLEDGE'),make('BT-20261014-AUD08-LIVE-',1,'SERVICE_EXPERIENCE')],when);
 assert.equal(p.source,'TODAY_VERIFIED_GAS_AUD08_LIVE');
 assert.equal(p.candidates.length,1);
});
test('one-time GAS calls existing model exactly once, validates and writes five',()=>{
 const source=fs.readFileSync(new URL('../editorial/gas/manual/RunTodayAudienceV08_20261014.gs',import.meta.url),'utf8');
 let generated=0,reads=0;
 const rows=[],props={THE_REV_AUDIENCE_DISCOVERY_MODE:'ENFORCE'};
 const roles=['KNOWLEDGE','SERVICE_EXPERIENCE','FACILITY_AND_TRUST','COMPARISON_DECISION','COMMUNITY_STORY'];
 const env={
   LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
   PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v;}})},
   v069TodayKey_:()=> '2026-10-14',getTargetWeekStart_:()=>new Date(),
   ss_:()=>({getSheetByName:name=>({name})}),getObjectsWithRow_:sh=>sh.name==='23_BLOG_TOPIC_SHORTLIST'?rows:[],
   buildM6Context_:()=>({weekly_editorial_brief:{research:'existing'}}),v080AudienceDirection_:()=> 'Please use role spread',
   generateBlogTopicCandidates_:()=>{generated++;return roles.map((role,i)=>make('BT-20261014-AUD08-LIVE-',i+1,role));},
   appendObjectRow_:(_,row)=>rows.push(row),Logger:{log:()=>{}},
   String,Boolean,Number,JSON,Array,Object,Date,Math,Error
 };
 vm.createContext(env);vm.runInContext(source,env);
 assert.equal(env.runTodayEditorialAudienceV08Once().status,'GENERATED_AND_VERIFIED');
 assert.equal(generated,1);assert.equal(rows.length,5);assert.equal(props.THE_REV_AUDIENCE_LIVE_RUN_20261014,'SUCCESS');
 assert.equal(env.runTodayEditorialAudienceV08Once().status,'ALREADY_SAVED');
 assert.equal(generated,1);
});
test('invalid model notes never write even first row',()=>{
 const code=fs.readFileSync(new URL('../editorial/gas/manual/RunTodayAudienceV08_20261014.gs',import.meta.url),'utf8');
 let written=0;const roles=['KNOWLEDGE','SERVICE_EXPERIENCE','FACILITY_AND_TRUST','COMPARISON_DECISION','COMMUNITY_STORY'];
 const env={LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='THE_REV_AUDIENCE_DISCOVERY_MODE'?'ENFORCE':undefined,setProperty:()=>{}})},
 v069TodayKey_:()=> '2026-10-14',getTargetWeekStart_:()=>new Date(),ss_:()=>({getSheetByName:name=>({name})}),getObjectsWithRow_:()=>[],
 buildM6Context_:()=>({weekly_editorial_brief:'test'}),v080AudienceDirection_:()=> 'brief',
 generateBlogTopicCandidates_:()=>roles.map((role,i)=>({...make('BT-20261014-AUD08-LIVE-',i+1,role),notes:i===4?'INVALID':'AUDIENCE_V08:'+JSON.stringify(meta(role))})),
 appendObjectRow_:()=>{written++;},Logger:{log:()=>{}},String,Boolean,Number,JSON,Array,Object,Date,Math,Error};
 vm.createContext(env);vm.runInContext(code,env);
 assert.throws(()=>env.runTodayEditorialAudienceV08Once(),/AUDIENCE_V08_NOTES_MISSING/);
 assert.equal(written,0);
});
