import {recoverySandbox} from './helpers/editorial-recovery-sandbox.mjs';
import {editorialProductionProgress} from '../lib/editorialProductionRecovery.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import matter from 'gray-matter';
import {createClient} from '@supabase/supabase-js';
import {prepareTopicProposal,approvedQueue} from '../lib/editorialTopicApproval.mjs';
import {saveNewProposal,changeProposal} from '../lib/editorialTopicStore.mjs';
import {checkEditorialImageReady} from '../lib/editorialImage.mjs';
import {hybridQaReady} from '../lib/editorialHybridImageFormat.mjs';
import {evaluateEditorialImageReview} from '../lib/editorialImageReviewGate.mjs';
import {evaluateSceneGrounding} from '../lib/editorialSceneGrounding.mjs';
import bridge from '../api/integrations/editorial.mjs';
import status from '../api/integrations/editorial-status.mjs';
import review from '../api/admin/publish-preview.mjs';
import article from '../api/admin/article.mjs';
import {editorialTestServices,invokeEditorialRoute as invoke} from './helpers/editorial-e2e-services.mjs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const r7='personal-gym-first-session-pain-health-history';
const r7Version='reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline';
const accepted=read(`editorial/image-qa/${r7}-${r7Version}.json`);
const sample=matter(fs.readFileSync(`content/blog/${r7}.md`,'utf8'));
const traces=[];

async function start({interview=true,delay=false}={}) {
  const svc=editorialTestServices();svc.install();
  const db=createClient(process.env.SUPABASE_URL,'synthetic-service',{auth:{persistSession:false,autoRefreshToken:false}});
  const now=new Date('2026-10-17T05:00:00+09:00');
  const shortlist=['BOXING','OXYGEN_ROOM','DENBA'].map((lane,i)=>({candidate_id:'E2E-'+i,topic:'独立テーマ'+i,title_candidate:i===0?sample.data.title:'独立テーマ'+i,primary_query:'独立質問'+i,generated_at:now.toISOString(),week_start:now.toISOString(),status:'CANDIDATE',route_lane:'WEB_BLOG',decision:'PUBLISH',total_score:90-i,editorial_lane:lane,content_cluster:lane,audience_question:'読者の質問'+i,why_now:'初めての利用に迷う読者の判断材料を整理するため'+i,unique_angle:'重複しない現場視点を示す切り口'+i}));
  const args={now,rows:[],shortlist,settings:{daily_editorial_cadence:'DAILY'},articleHistory:[],outputRows:[]};
  const planned=prepareTopicProposal(args);assert(planned.proposal,'actual topic planner produced proposal');
  let proposal=await saveNewProposal(db,planned.proposal);
  const chosen=proposal.options.find(x=>interview?x.candidate_id==='E2E-0':!x.interview_required);assert(chosen);
  proposal=await changeProposal(db,proposal.id,'choose',{candidateId:chosen.candidate_id,source:'GPT',actor:'synthetic-owner',now});
  if(delay)assert.equal(approvedQueue(proposal,{...args,now:new Date('2026-10-19T05:00:00+09:00')}).queue_row,null);
  if(proposal.status==='INTERVIEW_WAITING') proposal=await changeProposal(db,proposal.id,'answer',{answers:chosen.questions.map(()=> '合成テストのOwner回答。実在の体験談ではない。'),source:'GPT',actor:'synthetic-owner',now});
  if(interview){const replay=await changeProposal(db,proposal.id,'answer',{answers:proposal.interview_answers,source:'GPT',actor:'synthetic-owner',now});assert.deepEqual(replay.interview_answers,proposal.interview_answers);}
  const queued=approvedQueue(proposal,args);assert(queued.queue_row);
  const contentId=queued.queue_row.content_id;
  await db.from('editorial_topic_proposals').update({content_id:contentId,status:'QUEUE_CREATED'}).eq('id',proposal.id);
  // The unavailable legacy writer/research API is replaced with a frozen
  // article response. Actual v0.8 preservation/independent-QC adapter executes.
  const hq=recoverySandbox();
  Object.assign(hq.article,{...sample.data,slug_suggestion:'synthetic-e2e-recovery',body_markdown:sample.content});
  const ctx={},gate=JSON.parse(queued.queue_row.topic_gate_json);gate.knowledge_context=JSON.parse(queued.queue_row.knowledge_context_json);
  const generated=hq.sandbox.generateWebBlogDraft_(ctx,gate);
  const edited=hq.sandbox.finalizeWebBlog_(generated,ctx);
  assert.equal(JSON.parse(edited._editor_notes).quality_v080.passed,true,edited._editor_notes);
  assert.equal(hq.counts().writerCalls,1);assert.equal(hq.counts().qcCalls,2);
  hq.sandbox.v065SyncBridgeDirect_(queued.queue_row,{...edited,status:'READY',fact_check_status:'PASS',editor_notes:edited._editor_notes});
  const proof=hq.bridgeRequests[0].editorial_text_qc;
  const payload={...sample.data,...edited,slug:'synthetic-e2e-recovery',production_recovery_version:'v0.8.2',editorial_text_qc:proof,content_id:contentId,week_start:'2026-10-17',editorial_status:'READY',fact_check_status:'PASS',topic_gate_decision:'PUBLISH',image_headline_short:'小さな違和感も、\n言葉にする。'};
  const sync=await invoke(bridge,{method:'POST',body:payload});assert.equal(sync.statusCode,201,JSON.stringify(sync.data));
  const draft=svc.tables.admin_article_drafts[0];
  const job=JSON.parse(svc.files.get(draft.image_job_path));
  return {svc,db,proposal,contentId,payload,draft,job};
}

function deliverFixedImages(h,{pass=true,missing=false}={}) {
  // Fixed accepted media substitute for external generation, rendering and
  // visual-model calls. This cannot prove new-image aesthetics or R7 parity.
  const qa=structuredClone(accepted);qa.slug=h.draft.slug;qa.asset_version=h.draft.image_asset_version;qa.pass=pass;
  qa.manual_visual_rejection=!pass;qa.editorial_text_qc=h.payload.editorial_text_qc;qa.scene_grounding.asset_version=qa.asset_version;
  qa.same_background_as_recent_articles=false;qa.recent_background_source_ids=[];qa.recent_reference_guard={...qa.recent_reference_guard,compared_articles:[],recent_articles:[]};
  const gate=evaluateEditorialImageReview({draft:h.draft,qa});
  assert(gate.ok || !pass,JSON.stringify(gate.errors));
  for(const [key,src] of [['thumbnail',sample.data.thumbnail],['og_image',sample.data.og_image],['gbp_image',`/assets/images/gbp/gbp-${r7}-${r7Version}.jpg`]]) {
    if(missing && key==='gbp_image')continue;
    const bytes=fs.readFileSync(src.slice(1));svcPut(h,h.draft[key].slice(1),bytes);h.svc.live.set(h.draft[key],bytes);
  }
  svcPut(h,h.draft.image_qa_report_path,Buffer.from(JSON.stringify(qa)));
  // Non-physics synthetic state is clearly isolated from production artifacts.
  svcPut(h,`editorial/image-operator-state/${h.draft.slug}.json`,Buffer.from(JSON.stringify({slug:h.draft.slug,asset_version:h.job.asset_version,job_path:h.draft.image_job_path,status:pass?'READY_CANDIDATE':'BLOCKED_MAX_ATTEMPTS',attempts_total:1,max_attempts:1,last_error:pass?null:'SYNTHETIC_VISUAL_QC_REJECTED'})));
}
function svcPut(h,p,b){h.svc.files.set(p,b);}
const poll=h=>invoke(status,{query:{content_id:h.contentId}});

test('A: connected topic → approval → interview → quality adapter → real Bridge/job → status → authenticated Admin → canonical Preflight',async()=>{
  const h=await start();try {
    deliverFixedImages(h);
    const polled=await poll(h);assert.equal(polled.statusCode,200,JSON.stringify(polled.data));
    assert.equal(h.draft.image_status,'READY',JSON.stringify(polled.data.readiness));
    const admin=await invoke(article,{query:{id:h.draft.id},admin:true});assert.equal(admin.data.article.id,h.draft.id);
    const preflight=await invoke(review,{query:{id:h.draft.id},admin:true});
    assert.equal(preflight.data.ok,true,JSON.stringify(preflight.data));
    assert.equal(preflight.data.publish_requires_human_approval,true);
    assert.equal(editorialProductionProgress(h.draft,preflight.data).stage,'REVIEW_READY');
    assert.equal(h.job.max_generation_attempts,1);assert.equal(h.job.automation.require_complete_semantic_preflight,true);
    assert.equal(h.draft.publish_status,'NOT_PUBLISHED');
    const before=h.svc.calls.filter(c=>c.method==='PUT').length;
    const again=await invoke(bridge,{method:'POST',body:h.payload});assert.equal(again.statusCode,200);
    assert.equal(h.svc.calls.filter(c=>c.method==='PUT').length,before,'body resync does not recreate image job');
    assert.equal(h.svc.calls.some(c=>c.host==='api.openai.com'),false);
    traces.push({case:'A',result:'DRY_RUN_PASS_SUPPORTED_CONNECTED_PATH',content_id:h.contentId,checks:preflight.data.checks,limits:['legacy writer/research boundary fixed','generation/render/visual responses fixed','GAS installed triggers not executed']});
  } finally {h.svc.restore();}
});

test('B: QC rejection, failed sync, missing GBP, preflight failure, API outage and safe recovery run through actual handlers',async()=>{
  for(const fault of ['qc','db-sync','missing-file','preflight','api','admin-reflection','partial-actions','tampered-qc-bytes','same-size-live-bytes']) {
    const h=await start();try {
      deliverFixedImages(h,{pass:fault!=='qc',missing:fault==='missing-file'});
      if(fault==='db-sync'||fault==='admin-reflection')h.svc.setFault((u,m)=>u.pathname.endsWith('/admin_article_drafts') && m==='PATCH');
      if(fault==='api')h.svc.setFault(u=>u.hostname==='api.github.com');
      if(fault==='preflight')h.draft.body_markdown='';
      if(['tampered-qc-bytes','same-size-live-bytes'].includes(fault)){const bytes=Buffer.from(h.svc.live.get(h.draft.thumbnail));bytes[bytes.length-1]^=1;h.svc.live.set(h.draft.thumbnail,bytes);if(fault==='tampered-qc-bytes')h.svc.files.set(h.draft.thumbnail.slice(1),bytes);}
      if(fault==='partial-actions') h.svc.live.clear(); // GitHub commit succeeded, Xserver staging failed
      const original=h.draft.body_markdown;
      const stopped=await poll(h);
      h.draft=h.svc.tables.admin_article_drafts.find(x=>x.id===h.draft.id);
      assert.notEqual(h.draft.image_asset_ready && stopped.data.ready,true,JSON.stringify(stopped.data));
      const preview=await invoke(review,{query:{id:h.draft.id},admin:true});
      assert.notEqual(preview.data?.ok,true,`${fault}: must not allow Publish`);
      assert.equal(h.draft.body_markdown,original,'upstream body retained');
      assert.equal(h.draft.publish_status,'NOT_PUBLISHED');
      h.svc.setFault(null);
      if(fault==='qc') {assert(stopped.data.article.image_last_error);assert.equal(stopped.data.article.image_status,'ERROR');}
      else {
        h.draft.body_markdown=h.payload.body_markdown;
        deliverFixedImages(h);
        // Recovery is explicitly routed to synchronization, not generation.
        h.draft.image_status='PREPARING';h.draft.image_last_error=null;
        const restored=await poll(h);assert.equal(restored.statusCode,200);
        const final=await invoke(review,{query:{id:h.draft.id},admin:true});assert.equal(final.data.ok,true,JSON.stringify(final.data));
      }
      traces.push({case:fault,safe_stop:true,retains_body:true,recovery:fault==='qc'?'OWNER_REVIEW_REQUIRED':'SYNC_RESUMED_WITHOUT_GENERATION'});
    }finally{h.svc.restore();}
  }
});


test('future articles: no interview and delayed/replayed interview complete without duplicate Queue or Draft',async()=>{
  for(const config of [{interview:false},{interview:true,delay:true}]){
    const h=await start(config);try{
      deliverFixedImages(h);await poll(h);const preflight=await invoke(review,{query:{id:h.draft.id},admin:true});
      assert.equal(preflight.data.ok,true);assert.equal(h.svc.tables.admin_article_drafts.length,1);
      assert.equal(approvedQueue(h.proposal,{now:new Date('2026-10-20T05:00:00+09:00'),rows:[{content_id:h.contentId,topic_candidate_id:h.proposal.selected_candidate_id,target_date:h.proposal.target_date,queue_status:'REVIEW_READY'}],shortlist:[],articleHistory:[],outputRows:[],settings:{daily_editorial_cadence:'DAILY'}}).status,'ALREADY_CREATED');
      assert.equal(h.draft.publish_status,'NOT_PUBLISHED');traces.push({case:config.interview?'delayed_duplicate_interview':'no_interview',result:'DRY_RUN_PASS'});
    }finally{h.svc.restore();}
  }
});

test.after(()=>{
  if(process.env.EDITORIAL_E2E_REPORT)fs.writeFileSync(process.env.EDITORIAL_E2E_REPORT,JSON.stringify({scope:'connected application HTTP path + GAS adapters; external APIs and accepted imagery fixed; deployed GAS triggers not exercised',external_api_cost:0,traces},null,2)+'\n');
});
