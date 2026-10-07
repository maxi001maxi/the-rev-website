import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { Readable } from 'node:stream';
import { prepareTopicProposal, chooseTopic, answerInterview, approvedQueue, verifyLineSignature, parseTopicReply, topicNotification } from '../lib/editorialTopicApproval.mjs';
import { planDailyCreation } from '../lib/dailyEditorialCreator.mjs';
import { topicSeeds } from '../lib/editorialTopicSeeds.mjs';
import { topicResponse } from '../lib/editorialTopicApi.mjs';
import lineHandler, { receiveLineEvents } from '../lib/editorialLineWebhook.mjs';
import { changeProposal } from '../lib/editorialTopicStore.mjs';
import { evaluateArticleOverlap } from '../lib/editorialArticleOverlap.mjs';
import editorialHandler, {readEditorialJson, topicStuckFindings} from '../api/integrations/editorial-status.mjs';

const now = new Date('2026-10-04T05:00:00+09:00');
const shortlist = ['DENBA','BOXING','OXYGEN_ROOM','DENBA'].map((lane,i) => ({
  candidate_id:'TEST-'+i, topic:`独立した記事テーマ ${i}`, title_candidate:`候補 ${i}`, primary_query:`独立検索語${i}`, generated_at:now.toISOString(), week_start:now.toISOString(),
  status:'CANDIDATE', route_lane:'WEB_BLOG', decision:'PUBLISH', total_score:90-i,
  editorial_lane:lane, content_cluster:lane, audience_question:`対象の質問${i}`, why_now:`読者に役立つ理由${i}`, unique_angle:`既存記事とは別の切り口${i}`
}));
const args = { now, rows:[], shortlist, settings:{daily_editorial_cadence:'DAILY'}, articleHistory:[], outputRows:[] };
const proposal = () => prepareTopicProposal(args).proposal;
const approve = (p, id=p.options[0].candidate_id) => ({...p,...chooseTopic(p,{candidateId:id,source:'GPT',actor:'owner',now})});

// A PostgREST-shaped in-memory store tests durable snapshots, compare-and-set,
// redelivery, and outbox acknowledgements through the real API service code.
function memoryDb(initial=[]) {
  const tables = {editorial_topic_proposals:structuredClone(initial),editorial_line_receipts:[],editorial_gpt_operator_requests:[]};
  return {tables,from(table) {
    let filters=[], op='select', patch, conflict, single=false, max=Infinity;
    const q={
      select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},order(){return q;},limit(n){max=n;return q;},
      or(){filters.push(r=>r.status!=='QUEUE_CREATED'||r.notification_status!=='SENT');return q;},
      maybeSingle(){single=true;return q;},update(p){op='update';patch=p;return q;},
      upsert(p,c){op='upsert';patch=p;conflict=c;return q;},
      then(resolve,reject) {try {
        let rows=tables[table].filter(r=>filters.every(f=>f(r))).slice(0,max);
        if(op==='upsert') {
          const key=conflict.onConflict, found=tables[table].find(r=>r[key]===patch[key]);
          if(!found) tables[table].push(structuredClone(patch));
          else if(!conflict.ignoreDuplicates) Object.assign(found,structuredClone(patch));
          rows=[];
        }
        if(op==='update') rows.forEach(r=>Object.assign(r,structuredClone(patch)));
        resolve({data:single ? structuredClone(rows[0]||null):structuredClone(rows),error:null});
      }catch(e){reject(e);}}
    };return q;
  }};
}
const deps = {historyCollector:async()=>[],evidenceCollector:async()=>({byContentId:{},checked:[]})};


test('Topic Approval keeps canonical Stuck Detection active',()=>{
  const t=new Date('2026-10-05T08:00:00+09:00');
  const old=(minutes)=>new Date(t.getTime()-minutes*60000).toISOString();
  const stuck=topicStuckFindings({
    now:t.toISOString(),
    settings:{daily_editorial_stuck_timeout_minutes:10,daily_editorial_image_stuck_hours:6},
    rows:[
      {content_id:'draft',queue_status:'DRAFTING',draft_status:'NOT_STARTED',updated_at:old(11)},
      {content_id:'qc',queue_status:'QC',draft_status:'QC',updated_at:old(31)},
      {content_id:'image',queue_status:'IMAGE_PREPARING',updated_at:old(361)},
      {content_id:'human',queue_status:'INTERVIEW_WAITING',updated_at:old(24*60)},
      {content_id:'topic',queue_status:'TOPIC_SELECTION_WAITING',updated_at:old(24*60)},
      {content_id:'err',queue_status:'ERROR',updated_at:old(1)}
    ]
  });
  assert.deepEqual(stuck.map(x=>x.content_id),['draft','qc','image','err']);
  assert.deepEqual(stuck.map(x=>x.reason),['SUPERVISOR_NOT_PICKING_UP','STAGE_STALLED','IMAGE_STALLED','ERROR_STATE']);
});

test('v0.7 GAS forwards Topic API stuck findings to the existing de-duped alert path',()=>{
  const source=fs.readFileSync(new URL('../editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs',import.meta.url),'utf8');
  const calls=[];
  const sandbox={
    V069_STATUS_URL:'x',String,JSON,Array,Number,Object,Boolean,Date,
    v069TargetKey_:()=> '2026-10-06',
    v069cStuckAlerts_:(stuck,target)=>{calls.push({stuck,target});return stuck.map(x=>({content_id:x.content_id,notification:'SENT'}));}
  };
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox);
  const out=sandbox.v070StuckAlerts_({stuck:[{content_id:'BLOG-X',reason:'STAGE_STALLED'}]});
  assert.equal(calls.length,1);
  assert.equal(calls[0].target,'2026-10-06');
  assert.equal(calls[0].stuck[0].content_id,'BLOG-X');
  assert.equal(out[0].notification,'SENT');
});

test('three different lanes include an interview topic; no drafting before choice',()=>{
  const p=proposal(); assert.equal(p.target_date,'2026-10-05'); assert.equal(p.options.length,3);
  assert.equal(new Set(p.options.map(o=>o.candidate.editorial_lane)).size,3);
  assert(p.options.find(o=>o.candidate.editorial_lane==='BOXING').interview_required);
  assert.equal(approvedQueue(p,args).queue_row,null);
  assert(topicNotification(p).includes('既存記事との違い')); assert(topicNotification(p).length<5000);
});
test('old creator and connector cannot bypass the topic gate',()=>{
  const r=planDailyCreation({...args,settings:{...args.settings,daily_editorial_topic_approval_required:true}});
  assert.equal(r.creation.status,'TOPIC_SELECTION_WAITING'); assert.equal(r.creation.queue_row,undefined);
});
test('only the selected article resumes after midnight, with target date intact',()=>{
  const p=approve(proposal());
  const r=approvedQueue(p,{...args,now:new Date('2026-10-06T23:00:00+09:00')});
  assert.equal(r.status,'READY_TO_CREATE'); assert.equal(r.queue_row.topic_candidate_id,p.selected_candidate_id);
  assert.equal(r.queue_row.target_date,'2026/10/05'); assert.equal(r.queue_row.run_date,'2026/10/06');
  assert(JSON.parse(r.queue_row.knowledge_context_json).topic_approval.approved_at);
});
test('same choice is idempotent, changing an accepted choice conflicts',()=>{
  const p=approve(proposal());
  assert.equal(chooseTopic(p,{candidateId:p.selected_candidate_id,source:'LINE',actor:'owner'}),null);
  assert.throws(()=>chooseTopic(p,{candidateId:p.options[1].candidate_id,source:'LINE',actor:'owner'}),/LOCKED/);
  const q=approvedQueue(p,args).queue_row;
  assert.equal(approvedQueue(p,{...args,rows:[q]}).status,'ALREADY_CREATED');
});
test('interview answers are necessary and preserved verbatim before generation',()=>{
  let p=approve(proposal(),'TEST-1'); assert.equal(p.status,'INTERVIEW_WAITING');
  assert.equal(approvedQueue(p,args).queue_row,null);
  assert.throws(()=>answerInterview(p,{answers:['不明','不明'],source:'GPT',actor:'owner'}),/EVIDENCE_MISSING/);
  assert.throws(()=>answerInterview(p,{answers:['一つだけ'],source:'GPT',actor:'owner'}),/ALL_INTERVIEW/);
  p={...p,...answerInterview(p,{answers:['まず肩の力を抜いて、ゆっくり短く打ちます。','急いで強く打とうとする場合はテンポを落とします。'],source:'GPT',actor:'owner',now})};
  const q=approvedQueue(p,args).queue_row;
  assert(q); assert(JSON.parse(q.knowledge_context_json).main_claim.includes(p.interview_answers[0]));
  assert(JSON.parse(q.topic_gate_json).notes.includes('一次情報Interview'));
});
test('newly published overlap and full capacity prevent approved generation',()=>{
  const p=approve(proposal());
  const overlap=[{content_id:'OLD',title:p.options[0].title,primary_query:p.options[0].search_query}];
  assert.equal(approvedQueue(p,{...args,articleHistory:overlap}).status,'CANDIDATE_NO_LONGER_ELIGIBLE');
  assert.equal(approvedQueue(p,{...args,rows:Array.from({length:5},(_,i)=>({content_id:'OLD'+i,queue_status:'REVIEW_READY',target_date:'2026/09/20'}))}).status,'ACTIVE_CAP_REACHED');
});
test('changing the number of progress signs does not make a duplicate article new',()=>{
  const candidate={title:'筋トレしているのに変わらない…体重以外で見直す5つのこと'};
  const history=[{slug:'existing',title:'筋肉量が増えない＝筋トレは無駄？体重計に出ない3つの進歩'}];
  assert(evaluateArticleOverlap(candidate,history).overlap);
  assert(!evaluateArticleOverlap({title:'筋肉量が増えないときの食事量とタンパク質を確認する'},history).overlap);
});
test('held duplicate is retained until choice; changed old state cannot be archived',()=>{
  const old={content_id:'HELD',target_date:'2026/10/05',queue_status:'REVIEW_REQUIRED',failed_stage:'ARTICLE_OVERLAP'};
  const p=prepareTopicProposal({...args,rows:[old]}).proposal;
  assert.deepEqual(p.replaces_content_ids,['HELD']); assert.equal(old.queue_status,'REVIEW_REQUIRED');
  assert.equal(approvedQueue(approve(p),{...args,rows:[old]}).status,'READY_TO_CREATE');
  assert.equal(approvedQueue(approve(p),{...args,rows:[{...old,queue_status:'PUBLISHED'}]}).status,'TARGET_ALREADY_OCCUPIED');
});
test('too few reasoned candidates fail closed; curated ideas never invent local facts',()=>{
  assert.equal(prepareTopicProposal({...args,shortlist:shortlist.slice(0,2)}).status,'POOL_REFRESH_REQUIRED');
  const seeds=topicSeeds(now); assert(seeds.length>10);
  const p=prepareTopicProposal({...args,shortlist:seeds}).proposal;
  assert(p.options.every(o=>o.interview_required));
});
test('signature uses exact raw bytes and rejects missing/wrong/modified signatures',()=>{
  const raw=Buffer.from('{"events": []}'), secret='channel-secret';
  const sig=crypto.createHmac('sha256',secret).update(raw).digest('base64');
  assert(verifyLineSignature(raw,sig,secret)); assert(!verifyLineSignature(Buffer.from('{"events":[]}'),sig,secret));
  assert(!verifyLineSignature(raw,sig,'wrong')); assert(!verifyLineSignature(raw,'',secret));
});
test('dated reply parsing cannot approve ambiguous numbers or acknowledgements',()=>{
  assert.equal(parseTopicReply('1'),null); assert.equal(parseTopicReply('返答しました'),null);
  assert.deepEqual(parseTopicReply('TP-20261005 2'),{action:'choose',proposal_id:'TP-20261005',number:2});
  assert.deepEqual(parseTopicReply('TP-20261005 回答\n1: 実際の対応\n2: 注意点').answers,['実際の対応','注意点']);
});
test('owner-only LINE events and redelivery create one durable approval',async()=>{
  const p=proposal(),db=memoryDb([p]);
  const event={webhookEventId:'event-1',type:'message',source:{type:'user',userId:'owner'},message:{type:'text',text:`${p.id} 1`}};
  await receiveLineEvents([{...event,source:{type:'user',userId:'stranger'}}],db,'owner');
  assert.equal(db.tables.editorial_topic_proposals[0].status,'TOPIC_SELECTION_WAITING');
  await receiveLineEvents([event,event],db,'owner');
  assert.equal(db.tables.editorial_topic_proposals[0].status,'APPROVED'); assert.equal(db.tables.editorial_line_receipts.length,1);
});
test('HTTP webhook rejects unsigned bytes before any database call',async()=>{
  const saved={secret:process.env.THE_REV_LINE_CHANNEL_SECRET,owner:process.env.THE_REV_LINE_USER_ID};
  process.env.THE_REV_LINE_CHANNEL_SECRET='secret';process.env.THE_REV_LINE_USER_ID='owner';
  try {
    const req=Readable.from([Buffer.from('{"events":[]}')]);req.method='POST';req.headers={};
    const res={setHeader(){},status(n){this.code=n;return this;},json(p){this.payload=p;return this;}};
    await lineHandler(req,res); assert.equal(res.code,401);assert.equal(res.payload.error,'invalid_signature');
  } finally { for(const [key,value] of [['THE_REV_LINE_CHANNEL_SECRET',saved.secret],['THE_REV_LINE_USER_ID',saved.owner]]) {if(value==null)delete process.env[key];else process.env[key]=value;} }
});
test('combined API preserves streamed Bridge JSON and does not authenticate LINE as a Bridge caller',async()=>{
  const req=Readable.from([Buffer.from('{"action":"daily_'),Buffer.from('plan","rows":[]}')]);
  assert.deepEqual(await readEditorialJson(req),{action:'daily_plan',rows:[]});
  await assert.rejects(()=>readEditorialJson(Readable.from([Buffer.from('broken')])),SyntaxError);
  const secret=process.env.THE_REV_LINE_CHANNEL_SECRET,owner=process.env.THE_REV_LINE_USER_ID;
  process.env.THE_REV_LINE_CHANNEL_SECRET='test-secret';process.env.THE_REV_LINE_USER_ID='owner';
  try {
    const line=Readable.from([Buffer.from('{"events":[]}')]);line.query={mode:'line_webhook'};line.method='POST';line.headers={};
    const res={setHeader(){},status(n){this.code=n;return this;},json(p){this.payload=p;return this;}};
    await editorialHandler(line,res);assert.equal(res.code,401);assert.equal(res.payload.error,'invalid_signature');
  }finally{
    if(secret==null)delete process.env.THE_REV_LINE_CHANNEL_SECRET;else process.env.THE_REV_LINE_CHANNEL_SECRET=secret;
    if(owner==null)delete process.env.THE_REV_LINE_USER_ID;else process.env.THE_REV_LINE_USER_ID=owner;
  }
});
test('prepare is immutable, no-approval poll does not read GitHub, and notification failure cannot approve',async()=>{
  const db=memoryDb(),body={...args,action:'prepare'};
  // Test date must be explicit because the HTTP API uses the actual server clock.
  body.target_date='2026-10-05';
  const r=await topicResponse(body,db,deps);assert.equal(r.preparation.proposal.options.length,3);assert.equal(r.ready.length,0);
  const before=structuredClone(db.tables.editorial_topic_proposals[0].options);
  await topicResponse({...body,shortlist:[]},db,deps);assert.deepEqual(db.tables.editorial_topic_proposals[0].options,before);
  const snapshot=await topicResponse({...body,action:'poll'},db,{historyCollector:()=>{throw new Error('should not read');}});assert.equal(snapshot.ready.length,0);
  await topicResponse({action:'notification_ack',proposal_id:r.preparation.proposal.id,kind:'TOPICS',status:'ERROR'},db);
  assert.equal(db.tables.editorial_topic_proposals[0].status,'TOPIC_SELECTION_WAITING');
  await topicResponse({action:'notification_ack',proposal_id:r.preparation.proposal.id,kind:'TOPICS',status:'SENT'},db);
  assert.equal(db.tables.editorial_topic_proposals[0].notification_status,'SENT');
});
test('GPT operator inbox applies interview answers only through canonical validation/state machine',async()=>{
  const base=proposal();
  const waiting={...base,...chooseTopic(base,{candidateId:'TEST-1',source:'GPT',actor:'owner',now})};
  assert.equal(waiting.status,'INTERVIEW_WAITING');
  const db=memoryDb([waiting]);
  db.tables.editorial_gpt_operator_requests.push({
    id:'req-1',
    request_key:'chat-20261007-answer-1',
    proposal_id:waiting.id,
    action:'answer',
    number:null,
    answers:['現在地を知り、無理なく続けられる方法から始めます。','最初から頑張りすぎず、その日の状態に合わせて強度を調整します。'],
    status:'PENDING',
    created_at:now.toISOString()
  });

  const response=await topicResponse({...args,action:'poll'},db,deps);
  assert.equal(db.tables.editorial_gpt_operator_requests[0].status,'APPLIED');
  assert.equal(db.tables.editorial_topic_proposals[0].status,'APPROVED');
  assert.equal(db.tables.editorial_topic_proposals[0].interview_answers[0],'現在地を知り、無理なく続けられる方法から始めます。');
  assert.equal(response.gpt_operator[0].resulting_status,'APPROVED');
  assert.equal(response.ready.length,1);
  assert.match(JSON.parse(response.ready[0].queue_row.knowledge_context_json).main_claim,/現在地を知り/);
});

test('GPT operator inbox rejects invalid owner evidence instead of mutating proposal directly',async()=>{
  const base=proposal();
  const waiting={...base,...chooseTopic(base,{candidateId:'TEST-1',source:'GPT',actor:'owner',now})};
  const db=memoryDb([waiting]);
  db.tables.editorial_gpt_operator_requests.push({
    id:'req-2',
    request_key:'chat-20261007-answer-invalid',
    proposal_id:waiting.id,
    action:'answer',
    number:null,
    answers:['不明','不明'],
    status:'PENDING',
    created_at:now.toISOString()
  });

  const response=await topicResponse({...args,action:'poll'},db,deps);
  assert.equal(db.tables.editorial_gpt_operator_requests[0].status,'REJECTED');
  assert.match(db.tables.editorial_gpt_operator_requests[0].error,/EVIDENCE_MISSING/);
  assert.equal(db.tables.editorial_topic_proposals[0].status,'INTERVIEW_WAITING');
  assert.equal(response.ready.length,0);
});

test('store compare-and-set and approved poll do not create before queue read-back',async()=>{
  const p=proposal(),db=memoryDb([p]);
  await changeProposal(db,p.id,'choose',{candidateId:p.options[0].candidate_id,source:'GPT',actor:'owner'});
  const response=await topicResponse({...args,action:'poll'},db,deps);
  assert.equal(response.ready.length,1);assert.equal(db.tables.editorial_topic_proposals[0].status,'APPROVED');
  await assert.rejects(()=>topicResponse({...args,action:'queue_ack',proposal_id:p.id,content_id:'made-up'},db,deps),/READBACK/);
  const q=response.ready[0].queue_row;
  await topicResponse({...args,action:'queue_ack',proposal_id:p.id,content_id:q.content_id,rows:[q]},db,deps);
  assert.equal(db.tables.editorial_topic_proposals[0].status,'QUEUE_CREATED');
});
test('queue read-back accepts Sheets midnight as UTC and rejects the wrong JST date',async()=>{
  const p=proposal(),db=memoryDb([p]);
  await changeProposal(db,p.id,'choose',{candidateId:p.options[0].candidate_id,source:'GPT',actor:'owner'});
  const response=await topicResponse({...args,action:'poll'},db,deps),q=response.ready[0].queue_row;
  await assert.rejects(()=>topicResponse({...args,action:'queue_ack',proposal_id:p.id,content_id:q.content_id,rows:[{...q,target_date:'2026-10-03T15:00:00.000Z'}]},db,deps),/READBACK/);
  await topicResponse({...args,action:'queue_ack',proposal_id:p.id,content_id:q.content_id,rows:[{...q,target_date:'2026-10-04T15:00:00.000Z'}]},db,deps);
  assert.equal(db.tables.editorial_topic_proposals[0].status,'QUEUE_CREATED');
});
test('Standard body range reaches writer/editor and failed length has one bounded editing retry',()=>{
  let calls=0,last;
  const sandbox={V069_STATUS_URL:'x',String,JSON,Array,Number,
    getSettings_:()=>({blog_standard_min_chars:1600,blog_standard_max_chars:2400}),
    openAIRequest_:(_endpoint,payload)=>{last=payload;return payload;},
    finalizeWebBlog_:()=>{calls++;return {_editor_decision:'READY',_fact_check_status:'PASS',body_markdown:'short'};},
    v065LengthGate_:()=>({pass:false})};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(new URL('../editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs',import.meta.url),'utf8'),sandbox);
  for(const name of ['web_blog_draft_v1','web_blog_final_editor_v1']){
    const payload={text:{format:{name}},input:[{content:[{text:'old'}]},{content:[{text:JSON.stringify({topic_gate:{article_type:'STANDARD'}})}]}]};
    sandbox.openAIRequest_('responses',payload);assert.match(last.input[0].content[1].text,/body_markdown alone/);assert.match(last.input[0].content[1].text,/1600–2400/);
  }
  const other={text:{format:{name:'other'}}};sandbox.openAIRequest_('responses',other);assert.equal(last,other);
  sandbox.finalizeWebBlog_({article_type:'STANDARD'},{});assert.equal(calls,2);
  calls=0;sandbox.finalizeWebBlog_({article_type:'QUICK_ANSWER'},{});assert.equal(calls,1);
});
test('GAS keeps approved interview verbatim in writer and final-editor context',()=>{
  const sandbox={V069_STATUS_URL:'https://example.test',generateWebBlogDraft_:(ctx,gate)=>({ctx,gate}),Array,String,Error};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(new URL('../editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs',import.meta.url),'utf8'),sandbox);
  const ctx={},gate={candidate_id:'topic',knowledge_context:{topic_approval:{proposal_id:'TP-20261005',approved_at:'2026-10-04'},interview:[{question:'現場では？',answer:'まず肩の力を抜いてもらいます。'}]}};
  const r=sandbox.generateWebBlogDraft_(ctx,gate);
  assert.equal(sandbox.V070_WRITER_ADAPTER,'topic-interview-v1');
  assert.equal(r.ctx.first_party_interview.raw_answer,'1. 現場では？\nまず肩の力を抜いてもらいます。');
  assert.equal(r.gate.first_party_interview,r.ctx.first_party_interview);
  assert.throws(()=>sandbox.generateWebBlogDraft_({}, {knowledge_context:{interview:[{question:'q',answer:'a'}]}}),/APPROVED_INTERVIEW_REQUIRED/);
  const plain={};sandbox.generateWebBlogDraft_(plain,{});assert.equal(plain.first_party_interview,undefined);
});
test('weekly blog cannot bypass owner topic choice while other legacy operation remains available',()=>{
  let enabled='TRUE',called=0;
  const sandbox={V069_STATUS_URL:'x',v069Settings_:()=>({daily_editorial_topic_approval_required:enabled}),runM6BlogGBP:()=>{called++;return 'legacy';},String};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(new URL('../editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs',import.meta.url),'utf8'),sandbox);
  assert.equal(sandbox.runM6BlogGBP().status,'TOPIC_SELECTION_WAITING');assert.equal(called,0);
  enabled='FALSE';assert.equal(sandbox.runM6BlogGBP(),'legacy');assert.equal(called,1);
});
test('fresh daily candidate generation recovers partial sheet writes without duplicate ids or article creation',()=>{
  const rows=[{candidate_id:'BT-20261004-DAILY-1',title_candidate:'saved'}],props={};let calls=0;
  const sheet={},sandbox={V069_STATUS_URL:'x',Date,Array,Object,String,Number,Error,
    v069TodayKey_:()=> '2026-10-04',PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},
    ss_:()=>({getSheetByName:()=>sheet}),getObjectsWithRow_:()=>rows,getTargetWeekStart_:()=>new Date(),buildM6Context_:()=>({}),
    generateBlogTopicCandidates_:()=>{calls++;return Array.from({length:5},(_,i)=>({title_candidate:'idea '+i,why_now:'reason',score_breakdown:{seo_intent:25,business_relevance:20}}));},
    appendObjectRow_:(_sheet,row)=>rows.push(row)};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(new URL('../editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs',import.meta.url),'utf8'),sandbox);
  assert.equal(sandbox.v070RefreshTopicPool_().count,5);assert.equal(rows.length,5);assert.equal(new Set(rows.map(r=>r.candidate_id)).size,5);
  assert.equal(rows[0].title_candidate,'saved');assert.equal(rows[1].total_score,45);
  assert.equal(sandbox.v070RefreshTopicPool_().status,'ALREADY_GENERATED');assert.equal(calls,1);
});
test('GPT installer uses existing LINE sender without pretending LINE replies are connected',()=>{
  const st={},props={},rows=[],triggers=[],sheet={};
  const sandbox={V069_STATUS_URL:'x',String,Boolean,JSON,Error,Object,Array,Logger:{log(){}},generateWebBlogDraft_:()=>{},
    v069Settings_:()=>st,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},
    v069cSupervisorWired_:()=>({ok:true}),ss_:()=>({getSheetByName:()=>sheet}),getObjectsWithRow_:()=>rows,
    appendObjectRow_:(_s,row)=>{rows.push({...row,__row:rows.length+2});st[row.key]=row.value;},setObjectRow_:()=>{},
    ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:name=>({timeBased:()=>({everyMinutes:n=>({create:()=>triggers.push({getHandlerFunction:()=>name,minutes:n})})})})}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(new URL('../editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs',import.meta.url),'utf8'),sandbox);
  sandbox.v070TopicRequest_=()=>({capabilities:{line_receiver_configured:false}});sandbox.scheduledDailyEditorialTopicApprovalV070=()=>({status:'TOPIC_SELECTION_WAITING'});
  props.THE_REV_LINE_USER_ID='configured-owner';props.THE_REV_LINE_CHANNEL_ACCESS_TOKEN='configured-token';
  assert.throws(()=>sandbox.installDailyEditorialTopicApprovalV070(),/LINE_RECEIVER_NOT_CONFIGURED/);assert.equal(st.daily_editorial_cadence,undefined);
  assert.equal(sandbox.installDailyEditorialTopicApprovalGPTV070().status,'TOPIC_SELECTION_WAITING');
  assert.equal(st.daily_editorial_cadence,'DAILY');assert.equal(st.daily_editorial_topic_approval_required,'TRUE');assert.equal(props.THE_REV_TOPIC_REPLY_MODE,'GPT');assert.equal(triggers[0].minutes,1);
});
test('GAS performs late-approval polling outside the creation window under a lock',()=>{
  const calls=[],rows=[],props={};
  const sandbox={console,Date,JSON,String,Number,Object,Array,Math,Error,RegExp,
    V069_STATUS_URL:'https://example.test/api/integrations/editorial-status/',
    v069Settings_:()=>({daily_editorial_topic_approval_required:'TRUE',daily_editorial_hour:5}),
    v069cJstHour_:()=>23,v069TodayKey_:()=> '2026-10-06',v069TargetKey_:()=> '2026-10-07',
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){calls.push('unlock');}})},
    v069cRecoverLengthReviewRequired_:()=>{},v069cNotifyPreparedReady_:()=>{},v069cSupervisorWired_:()=>({ok:true}),
    v069QueueRows_:()=>({rows,sheet:{}}),v069cAppendQueueRow_:(_q,row)=>rows.push(row),
    v069RowTargetKey_:r=>r.target_date.replace(/\//g,'-'),v069cMarkShortlistSelected_:()=>{},v069cShortlist_:()=>({}),
    v069StartLog_:()=> 'log',v069FinishLog_:()=>{},v069cNotifyOnce_:()=>{},
  };
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(new URL('../editorial/gas/DailyEditorialTopicApproval_v0.7.0.gs',import.meta.url),'utf8'),sandbox);
  sandbox.v070TopicView_=()=>{};
  sandbox.v070TopicRequest_=(action)=>{calls.push(action);return action==='poll' ? {proposals:[],notifications:[],ready:[{proposal_id:'TP-20261005',queue_row:{content_id:'BLOG-LATE',target_date:'2026/10/05',topic_candidate_id:'selected'},replaces_content_ids:[]}]} : {};};
  props.THE_REV_TOPICS_PREPARED_20261006='TRUE';
  props['THE_REV_TOPICS_PREPARED_2026-10-06']='TRUE';
  const result=sandbox.scheduledDailyEditorialTopicApprovalV070();
  assert.equal(sandbox.V070_TOPIC_URL,'https://example.test/api/integrations/editorial-status/');
  assert.equal(result.status,'CREATED');assert.deepEqual(calls,['poll','queue_ack','unlock']);assert.equal(rows.length,1);
});
