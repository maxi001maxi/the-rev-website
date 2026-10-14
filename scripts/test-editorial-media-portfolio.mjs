import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEditorialRole,editorialPortfolioSnapshot,selectEditorialPortfolio,publishedMediaHistory,EDITORIAL_ROLES } from '../lib/editorialMediaPortfolio.mjs';
import { proposalOptions,topicNotification,prepareTopicProposal } from '../lib/editorialTopicApproval.mjs';
const titles=[
 '運動前のストレッチは何分？ 筋トレ・ボクシングで変わる準備の順番',
 '新大宮で初心者がジムを選ぶなら｜24時間ジム・パーソナルジム・ボクシングの違い',
 '座り仕事は30分ごとに立つべき？',
 'ボクシングは怖そう…運動初心者でも始められる？ミット打ちの前に知りたいこと',
 '健康診断で血圧が高めと言われたら筋トレはしていい？',
 'DENBAの電位空間とは？ 電波・EMSとの違い',
 '筋トレ初心者は種目が少なくても効果はある？',
 '新大宮で完全予約制のパーソナルジムを探す方へ｜THE REV.の設備と過ごし方',
 '酸素ルームの中では何をする？｜横になって過ごす時間の使い方',
 '運動を始めたい。でも疲れそうで続かない人へ',
 '新大宮でジムを選ぶなら｜設備・通いやすさ・使い方で見る5つのポイント',
 '健康診断の結果を見て運動を始める前に'
];
const history=titles.map((title,i)=>({editorial_content_id:'BLOG-'+i,title,category:'training',publish_status:'PUBLISHED',published_at:new Date(Date.UTC(2026,9,14-i)).toISOString()}));
test('last 12 real-title replay yields distinct role counts 7/2/2/1',()=>{
 const p=editorialPortfolioSnapshot(history);
 assert.equal(p.observed,12);
 assert.deepEqual([p.counts.KNOWLEDGE,p.counts.COMPARISON_DECISION,p.counts.SERVICE_EXPERIENCE,p.counts.FACILITY_AND_TRUST],[7,2,2,1]);
 assert.equal(p.deficits.FACILITY_AND_TRUST,1);
 assert.equal(p.deficits.SERVICE_EXPERIENCE,1);
 assert.equal(p.articles.length,12);
});
test('do not count drafts, merely committed pages, queue entries or canonical pages without CMS status',()=>{
 const more=[...history, {...history[0],editorial_content_id:'draft1',publish_status:'NOT_PUBLISHED'},
  {...history[0],editorial_content_id:'committed1',publish_status:'PUBLISH_COMMITTED'},
  {content_id:'no-status',title:'THE REV.を紹介',published_at:'2026-10-15'}];
 assert.equal(editorialPortfolioSnapshot(more).observed,12);
 assert.equal(publishedMediaHistory(more,20).length,12);
});
test('different roles are preferred even if 3 knowledge candidates have slightly higher raw scores',()=>{
 const rows=[
 ['k1','KNOWLEDGE',92],['k2','KNOWLEDGE',90],['k3','KNOWLEDGE',88],
 ['facility','FACILITY_AND_TRUST',86],['service','SERVICE_EXPERIENCE',85],
 ['story','COMMUNITY_STORY',81]
 ].map(([candidate_id,role,score])=>({candidate_id,score,eligible:true,candidate:{candidate_id,title_candidate:'No repeated answer '+candidate_id,editorial_role:role,audience_question:'Different question '+candidate_id}}));
 const p=selectEditorialPortfolio(rows,{history});
 assert.equal(p.selected.length,3);
 const roles=new Set(p.selected.map(e=>e.editorial_role));
 assert(roles.has('FACILITY_AND_TRUST'));
 assert(roles.has('SERVICE_EXPERIENCE'));
 assert.equal(roles.size,3);
 assert.equal(p.projected.FACILITY_AND_TRUST,2);
 assert(p.selected.every(e=>e.media_priority-e.score<=12));
});
test('facility article role differs from its topic and story lane remains available',()=>{
 assert.equal(classifyEditorialRole({editorial_role:'FACILITY_AND_TRUST',content_cluster:'BOXING'}).role,'FACILITY_AND_TRUST');
 assert.equal(classifyEditorialRole({title:'奈良の人インタビュー：運動を始めた理由'}).role,'COMMUNITY_STORY');
 assert.equal(classifyEditorialRole({title:'DENBAの電位空間とは？'}).role,'KNOWLEDGE');
 assert.equal(EDITORIAL_ROLES.COMMUNITY_STORY.target,0);
});
test('legacy proposal human approval and final publishing gates remain unchanged',()=>{
 const now=new Date('2026-10-14T08:00:00+09:00');
 const s=[
 {candidate_id:'t1',title_candidate:'仕事帰りの筋トレの意義を考える',editorial_role:'KNOWLEDGE'},
 {candidate_id:'t2',title_candidate:'THE REV.の店内で体験時は何が起こるか',editorial_role:'FACILITY_AND_TRUST'},
 {candidate_id:'t3',title_candidate:'初めて酸素ルームを使う一日',editorial_role:'SERVICE_EXPERIENCE'},
 {candidate_id:'t4',title_candidate:'地域のトレーナーの一日インタビュー',editorial_role:'COMMUNITY_STORY'}
 ].map((c,i)=>({...c,topic:c.title_candidate,primary_query:'query '+i,status:'CANDIDATE',generated_at:now.toISOString(),total_score:90-i,route_lane:'WEB_BLOG',decision:'PUBLISH',audience_question:'読者が知りたいテーマ'+i,why_now:'詳しい第一者の利用情報が必要なため'+i,unique_angle:'未回答の質問を取材する'+i,editorial_lane:['TRAINING','FACILITY_THE_REV','OXYGEN_ROOM','BOXING'][i]}));
 const chosen=proposalOptions({now,shortlist:s,articleHistory:history,rows:[],outputRows:[],settings:{daily_editorial_cadence:'DAILY'}});
 assert.equal(chosen.length,3);
 assert(chosen.some(o=>o.editorial_role==='FACILITY_AND_TRUST'));
 assert(chosen.every(o=>o.portfolio&&o.role&&o.candidate));
 const proposal={id:'TP-20261015',target_date:'2026-10-15',status:'TOPIC_SELECTION_WAITING',notification_kind:'TOPICS',options:chosen};
 assert(topicNotification(proposal).includes('ブログ編成:'));
 assert(topicNotification(proposal).includes('記事の役割'));
 assert(!topicNotification(proposal).includes('公開済み'));
});
