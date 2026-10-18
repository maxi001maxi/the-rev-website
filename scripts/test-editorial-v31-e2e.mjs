import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import matter from 'gray-matter';
import {createClient} from '@supabase/supabase-js';
import {prepareTopicProposal,approvedQueue} from '../lib/editorialTopicApproval.mjs';
import {saveNewProposal,changeProposal} from '../lib/editorialTopicStore.mjs';
import {checkEditorialImageReady} from '../lib/editorialImage.mjs';
import {hybridQaReady} from '../lib/editorialHybridImageFormat.mjs';
import {evaluateEditorialImageReview} from '../lib/editorialImageReviewGate.mjs';
import {editorialExecution} from '../lib/editorialExecution.mjs';
import {operatorResumePlan,reserveImageApiCall} from '../lib/editorialImageOperatorRecovery.mjs';
import {coverSourceRect,lockedEditPlan} from '../lib/editorialLockedBackgroundEdit.mjs';
import {editorialShootingContract} from '../lib/editorialShootingContract.mjs';
import {oct18V31BriefPreflight,oct18V31SourceReuse,oct18V31QaReuse,briefDigest,recoveryJobDigest} from '../lib/editorialOct18V31Recovery.mjs';
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

async function start() {
  const svc=editorialTestServices();svc.install();
  const db=createClient(process.env.SUPABASE_URL,'synthetic-service',{auth:{persistSession:false,autoRefreshToken:false}});
  const now=new Date('2026-10-17T05:00:00+09:00');
  const shortlist=['BOXING','OXYGEN_ROOM','DENBA'].map((lane,i)=>({candidate_id:'E2E-'+i,topic:'独立テーマ'+i,title_candidate:i===0?sample.data.title:'独立テーマ'+i,primary_query:'独立質問'+i,generated_at:now.toISOString(),week_start:now.toISOString(),status:'CANDIDATE',route_lane:'WEB_BLOG',decision:'PUBLISH',total_score:90-i,editorial_lane:lane,content_cluster:lane,audience_question:'読者の質問'+i,why_now:'初めての利用に迷う読者の判断材料を整理するため'+i,unique_angle:'重複しない現場視点を示す切り口'+i}));
  const args={now,rows:[],shortlist,settings:{daily_editorial_cadence:'DAILY'},articleHistory:[],outputRows:[]};
  const planned=prepareTopicProposal(args);assert(planned.proposal,'actual topic planner produced proposal');
  let proposal=await saveNewProposal(db,planned.proposal);
  const chosen=proposal.options.find(x=>x.candidate_id==='E2E-0');assert(chosen);
  proposal=await changeProposal(db,proposal.id,'choose',{candidateId:chosen.candidate_id,source:'GPT',actor:'synthetic-owner',now});
  if(proposal.status==='INTERVIEW_WAITING') proposal=await changeProposal(db,proposal.id,'answer',{answers:chosen.questions.map(()=> '合成テストのOwner回答。実在の体験談ではない。'),source:'GPT',actor:'synthetic-owner',now});
  const queued=approvedQueue(proposal,args);assert(queued.queue_row);
  const contentId=queued.queue_row.content_id;
  await db.from('editorial_topic_proposals').update({content_id:contentId,status:'QUEUE_CREATED'}).eq('id',proposal.id);
  // The unavailable legacy writer/research API is replaced with a frozen
  // article response. Actual v0.8 preservation/independent-QC adapter executes.
  const scores={title_hook:12,seo_intent:12,human_voice:12,readability:12,length_efficiency:8,originality:8,brand_fit:8,fact_safety:9};
  const generated={...sample.data,slug:'synthetic-e2e-v31',body_markdown:sample.content,article_type:'STANDARD',source_refs:['SYNTHETIC_OFFICIAL_EXCERPT'],_editor_score:Object.values(scores).reduce((a,b)=>a+b,0),_editor_notes:JSON.stringify({score_breakdown:scores}),_editor_decision:'READY',_fact_check_status:'PASS'};
  const sandbox={console,isFinite,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'ENFORCE'})},getSettings_:()=>({blog_editor_model:'synthetic'}),parseStructuredResponse_:x=>x,openAIRequest_:()=>({scores:{question_resolution:4,understanding_gain:4,decision_support:4,concreteness_evidence:4,originality_readability:4},issues:[],source_unverified:false,reason:'fixed synthetic QC response'}),finalizeWebBlog_:()=>structuredClone(generated)};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('editorial/gas/DailyEditorialQuality_v0.8.0.gs','utf8'),sandbox);
  const edited=sandbox.finalizeWebBlog_(generated,{first_party_interview:{source_id:proposal.id,raw_answer:proposal.interview_answers?.join('\n') || 'synthetic'}});
  assert.equal(JSON.parse(edited._editor_notes).quality_v080.passed,true,edited._editor_notes);
  const payload={...edited,content_id:contentId,week_start:'2026-10-17',editorial_status:'READY',fact_check_status:'PASS',topic_gate_decision:'PUBLISH',image_headline_short:'小さな違和感も、\n言葉にする。'};
  const sync=await invoke(bridge,{method:'POST',body:payload});assert.equal(sync.statusCode,201,JSON.stringify(sync.data));
  const draft=svc.tables.admin_article_drafts[0];
  const job=JSON.parse(svc.files.get(draft.image_job_path));
  return {svc,db,proposal,contentId,payload,draft,job};
}

function deliverFixedImages(h,{pass=true,missing=false}={}) {
  // Fixed accepted media substitute for external generation, rendering and
  // visual-model calls. This cannot prove new-image aesthetics or R7 parity.
  const qa=structuredClone(accepted);qa.slug=h.draft.slug;qa.asset_version=h.draft.image_asset_version;qa.pass=pass;
  qa.manual_visual_rejection=!pass;qa.scene_grounding.asset_version=qa.asset_version;
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
      assert.notEqual(h.draft.image_asset_ready && stopped.data.ready,true,JSON.stringify(stopped.data));
      const preview=await invoke(review,{query:{id:h.draft.id},admin:true});
      assert.notEqual(preview.data?.ok,true,`${fault}: must not allow Publish`);
      assert.equal(h.draft.body_markdown,original,'upstream body retained');
      assert.equal(h.draft.publish_status,'NOT_PUBLISHED');
      h.svc.setFault(null);
      if(fault==='qc') {assert(h.draft.image_last_error);assert.equal(h.draft.image_status,'ERROR');}
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

test('generation budgets and crash checkpoints never bypass QA or spend twice',()=>{
  const job={asset_version:'test',generated_scene_path:'scene.png'}, state={asset_version:'test',status:'GENERATING',job_path:'job'};
  assert.equal(operatorResumePlan(state,job,{exists:()=>true,hashFile:()=> 'a'}).route,'STOP');
  assert.equal(operatorResumePlan({...state,status:'SCENE_GENERATED',scene_sha256:'a'},job,{exists:()=>true,hashFile:()=> 'a'}).route,'OVERLAY_AND_QC');
  assert.equal(operatorResumePlan({...state,status:'SCENE_GENERATED',scene_sha256:'a'},job,{exists:()=>true,hashFile:()=> 'b'}).route,'STOP');
  const reserved=reserveImageApiCall({}, {generation:true});
  assert.throws(()=>reserveImageApiCall(reserved,{generation:true}),/GENERATION_CALL_LIMIT/);
  const qc=reserveImageApiCall(reserveImageApiCall({}));assert.throws(()=>reserveImageApiCall(qc),/QC_CALL_LIMIT/);
  assert.equal(reserved.api_calls[0].confirmed_cost,null);
});

test('B: actual image operator subprocess persists an API failure and refuses a second paid call, including max-attempt recovery',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'editorial-v31-'));
  try {
    const job=read(`editorial/hybrid-image-jobs/${r7}.json`);
    const sources=[job.automation.source_repo_path,...job.style_references];
    for(const p of sources){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.copyFileSync(p,path.join(root,p));}
    fs.mkdirSync(path.join(root,'editorial'),{recursive:true});
    fs.copyFileSync('editorial/automated-image-sources.json',path.join(root,'editorial/automated-image-sources.json'));
    fs.writeFileSync(path.join(root,'job.json'),JSON.stringify(job));
    fs.writeFileSync(path.join(root,'mock-api.mjs'),`import fs from 'node:fs';globalThis.fetch=async()=>{fs.appendFileSync('calls.log','attempt\\n');return new Response(JSON.stringify({error:{message:'synthetic API outage'}}),{status:503});};`);
    const statePath=path.join(root,`editorial/image-operator-state/${r7}.json`);
    const run=()=>spawnSync(process.execPath,['--import',path.join(root,'mock-api.mjs'),path.resolve('scripts/auto-editorial-hybrid-image.mjs'),'job.json'],{cwd:root,env:{...process.env,OPENAI_API_KEY:'synthetic-only'},encoding:'utf8',timeout:10000});
    const first=run();assert.equal(first.status,0,first.stderr);
    const saved=read(statePath);assert.equal(saved.status,'ERROR');assert.equal(saved.api_calls.length,1);assert.match(saved.last_error,/synthetic API outage/);
    assert.equal(saved.api_calls[0].status,'FAILED');assert.equal(saved.api_calls[0].confirmed_cost,null);
    assert.equal(run().status,0);assert.equal(fs.readFileSync(path.join(root,'calls.log'),'utf8'),'attempt\n');
    saved.status='BLOCKED_MAX_ATTEMPTS';fs.writeFileSync(statePath,JSON.stringify(saved));assert.equal(run().status,0);
    assert.equal(fs.readFileSync(path.join(root,'calls.log'),'utf8'),'attempt\n');
    fs.writeFileSync(statePath,'{broken');assert.notEqual(run().status,0);
    assert.equal(fs.readFileSync(path.join(root,'calls.log'),'utf8'),'attempt\n','corrupt checkpoint must not reset spending');
    traces.push({case:'actual_operator_API_and_limit',safe_stop:true,calls:1,retry_calls:0});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('saved R2 cannot resurrect through stale PASS; R7 remains accepted; protected source is reusable',()=>{
  const r2=read('editorial/image-qa/personal-gym-trial-three-checks-reference-v26-grounded-evolgear-20261018-contract-r2.json');
  const base={slug:r7,image_asset_version:r7Version,image_render_version:'rev-column-reference-v2.3-hybrid',image_strategy:'reference-v2-gpt-image-hybrid-drive-source'};
  assert.equal(hybridQaReady({...base,image_qa:r2}),false);assert.equal(evaluateEditorialImageReview({qa:r2}).ok,false);
  assert.equal(hybridQaReady({...base,image_qa:accepted}),true);assert.equal(evaluateEditorialImageReview({draft:base,qa:accepted}).ok,true);
  const copy=structuredClone(accepted);copy.editorial_image_revision='3.1';copy.human_environment_integration=8;
  assert.equal(evaluateEditorialImageReview({qa:copy}).ok,false);
  const rect=coverSourceRect(1400,1867,1024,1536);assert(Math.abs(rect.width/rect.height-1400/1867)<1e-10);
  assert.throws(()=>lockedEditPlan({v3:{}}),/LOCKED_BACKGROUND_PLAN_REQUIRED/);
  assert.equal(editorialExecution({article:{image_status:'ERROR',image_last_error:'stop'}}).stopped_reason,'stop');
});

test.after(()=>{
  if(process.env.EDITORIAL_E2E_REPORT)fs.writeFileSync(process.env.EDITORIAL_E2E_REPORT,JSON.stringify({scope:'connected canonical application path; external services fixed; not full deployed GAS acceptance',external_api_cost:0,traces},null,2)+'\n');
});

test('Oct18 recovery contract reaches the real operator; pending or altered approval spends zero calls',()=>{
  const dir='editorial/prepublication/2026-10-18-contract-checklist/v31-r8';
  const job=read(dir+'/PROPOSED_JOB.json'),brief=read(dir+'/CREATIVE_BRIEF.json');
  assert.equal(editorialShootingContract(brief),brief.shot_contract);
  assert.throws(()=>editorialShootingContract({}),/SHOOTING_CONTRACT_MISSING/);
  assert.equal(oct18V31BriefPreflight(job,brief).pass,true);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'oct18-r8-'));
  try {
    fs.mkdirSync(path.join(root,dir),{recursive:true});
    fs.writeFileSync(path.join(root,dir,'CREATIVE_BRIEF.json'),JSON.stringify(brief));
    const copy=p=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.copyFileSync(p,path.join(root,p));};
    [job.automation.source_repo_path,...job.style_references,'editorial/automated-image-sources.json'].forEach(copy);
    fs.writeFileSync(path.join(root,'mock.mjs'),`import fs from 'node:fs';globalThis.fetch=async(u,o)=>{fs.writeFileSync('api-payload.json',o.body);return new Response(JSON.stringify({error:{message:'synthetic stop after prompt capture'}}),{status:503});};`);
    const run=()=>{
      fs.writeFileSync(path.join(root,'job.json'),JSON.stringify(job));
      return spawnSync(process.execPath,['--import',path.join(root,'mock.mjs'),path.resolve('scripts/auto-editorial-hybrid-image.mjs'),'job.json'],{cwd:root,env:{...process.env,OPENAI_API_KEY:'synthetic-only'},encoding:'utf8',timeout:10000});
    };
    let result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/OWNER_SPEND_APPROVAL_REQUIRED/);
    assert.equal(fs.existsSync(path.join(root,'api-payload.json')),false);
    // A flag without an approval tied to the exact job/brief is insufficient.
    job.v31.owner_spend_approval='APPROVED';result=run();assert.notEqual(result.status,0);
    assert.equal(fs.existsSync(path.join(root,'api-payload.json')),false);
    job.v31.owner_approval={status:'APPROVED',approved_by:'OWNER',approved_at:'2026-10-18T00:00:00Z',content_id:brief.content_id,asset_version:job.asset_version,source_sha256:brief.source.sha256,scope:'SINGLE_GENERATION_AND_PRIVATE_QC',source_reuse:true,max_generation_calls:1,max_qc_calls:2,automatic_retry:false,job_sha256:recoveryJobDigest(job),brief_sha256:briefDigest(brief)};
    assert.equal(oct18V31BriefPreflight(job,brief,{requireApproval:true}).pass,true);
    const changed=structuredClone(brief);changed.shot_contract.eyeline='look at logo';
    assert.equal(oct18V31BriefPreflight(job,changed,{requireApproval:true}).pass,false);
    result=run();assert.equal(result.status,0,result.stderr);
    const payload=read(path.join(root,'api-payload.json'));
    const prompt=payload.input[0].content[0].text;
    assert(prompt.includes(brief.shot_contract.subject_action));assert(prompt.includes(brief.shot_contract.eyeline));
    assert.equal(payload.tools[0].action,'edit');
    const state=read(path.join(root,`editorial/image-operator-state/${job.slug}.json`));
    assert.equal(state.api_calls.length,1);assert.equal(state.api_calls[0].status,'FAILED');
    assert.equal(oct18V31BriefPreflight(read(path.join(root,'job.json')),brief,{requireApproval:true}).pass,true,'derived runtime fields must not invalidate the approved resume contract');
    assert.equal(read(dir+'/PROPOSED_JOB.json').v31.owner_spend_approval,'PENDING','synthetic approval never modifies real proposal');
    traces.push({case:'R8_pre_spend_contract',pending_calls:0,altered_approval_calls:0,synthetic_prompt_captured:true});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R8 scoped real-source reuse requires approval and distinct independently grounded action',()=>{
  const dir='editorial/prepublication/2026-10-18-contract-checklist/v31-r8';
  const job=read(dir+'/PROPOSED_JOB.json'),brief=read(dir+'/CREATIVE_BRIEF.json');
  const inventory=read('editorial/automated-image-sources.json').sources.find(s=>s.repo_path===brief.source.path).scene_inventory;
  const g=structuredClone(accepted.scene_grounding);
  Object.assign(g,{inventory,asset_version:job.asset_version,plan:job.scene_plan,recent:job.automation.recent_semantic_articles});
  g.asset_hashes.source=brief.source.sha256;
  g.sourceRecognition.equipment=inventory.visible_equipment;
  Object.assign(g.observation,{equipment:inventory.visible_equipment,location_type:job.scene_plan.location_type,subject_zone:job.scene_plan.subject_zone,human_action:job.scene_plan.human_action,scene_fingerprint:job.scene_plan});
  const evaluated=evaluateSceneGrounding(g);assert.equal(evaluated.pass,true,JSON.stringify(evaluated.errors));
  Object.assign(g,{pass:true,errors:[],similarity:evaluated.similarity});
  assert.equal(oct18V31SourceReuse(job,g),false,'pending approval cannot permit reuse');
  job.v31.owner_approval={status:'APPROVED',approved_by:'OWNER',approved_at:'2026-10-18T00:00:00Z',content_id:brief.content_id,asset_version:job.asset_version,source_sha256:brief.source.sha256,scope:'SINGLE_GENERATION_AND_PRIVATE_QC',source_reuse:true,max_generation_calls:1,max_qc_calls:2,automatic_retry:false,job_sha256:recoveryJobDigest(job),brief_sha256:briefDigest(brief)};
  assert.equal(oct18V31SourceReuse(job,g),true);
  const qa={...structuredClone(accepted),slug:job.slug,asset_version:job.asset_version,editorial_image_revision:'3.1',scene_grounding:g,oct18_v31_source_reuse_approval:job.v31.owner_approval};
  const draft={slug:job.slug,image_asset_version:job.asset_version};
  assert.equal(oct18V31QaReuse(draft,qa),true);
  assert.equal(evaluateEditorialImageReview({draft,qa}).checks.same_background_absent,true,'canonical Review consumes scoped reuse evidence');
  for(const mutate of [q=>{q.pass=false;},q=>{q.anatomy_pose_realism=8;},q=>{q.manual_visual_rejection=true;},q=>{q.asset_version='r6';},q=>{q.scene_grounding.observation.human_action='observe_facility';},q=>{q.oct18_v31_source_reuse_approval.source_reuse=false;}]) {
    const copy=structuredClone(qa);mutate(copy);assert.equal(oct18V31QaReuse(draft,copy),false);
  }
  const repeated=structuredClone(qa);repeated.scene_grounding.recent[0].scene_fingerprint=job.scene_plan;
  assert.equal(oct18V31QaReuse(draft,repeated),false,'same scene remains prohibited');
});
