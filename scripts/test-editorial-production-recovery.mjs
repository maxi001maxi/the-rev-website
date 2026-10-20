import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImageApiLedger} from '../lib/editorialImageApiLedger.mjs';
import {editorialBodySha,validateEditorialTextQc,editorialProductionProgress} from '../lib/editorialProductionRecovery.mjs';
import {editorialAssetRejected} from '../lib/editorialRejectedAsset.mjs';
import {hybridQaReady} from '../lib/editorialHybridImageFormat.mjs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {articleSceneIntent} from '../lib/editorialSceneGrounding.mjs';
import {recoverySandbox} from './helpers/editorial-recovery-sandbox.mjs';
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json'));
const oct21=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/night-workout-sleep-timing-intensity.json'));
function ledgerStore(){let state=null,sha=0;return {read:async()=>state?{exists:true,content:JSON.stringify(state),sha:String(sha)}:{exists:false},write:async file=>{assert.equal(file.sha,state?String(sha):null);state=JSON.parse(file.content);sha++;},get:()=>state};}

test('GAS valid QC rejection repairs existing Editor once, independent QC twice, no second Writer',()=>{
 const h=recoverySandbox(),ctx={};const draft=h.sandbox.generateWebBlogDraft_(ctx,{});const final=h.sandbox.finalizeWebBlog_(draft,ctx);
 assert.equal(final._editor_decision,'READY');assert.deepEqual(h.counts(),{qcCalls:2,editorCalls:2,writerCalls:1});
 const notes=JSON.parse(final._editor_notes);assert.equal(notes.production_recovery_v082.writer_reused,true);
 assert.equal(notes.quality_v080.independent.pass,true);assert.notEqual(notes.production_recovery_v082.original_body_sha256,notes.production_recovery_v082.revised_body_sha256);
 const repair=h.requests.filter(x=>x.text.format.name==='web_blog_final_editor_v1')[1];
 assert(repair.input[0].content.some(x=>x.text.includes('listed QC blockers')));
 const qc=h.requests.find(x=>x.text.format.name==='editorial_quality_v080');
 assert(!qc.input[1].content[0].text.includes('_editor_score'));
 assert.equal(JSON.parse(qc.input[1].content[0].text).qc_evidence.verified_research_excerpts.length,1);
 h.sandbox.finalizeWebBlog_(draft,ctx);assert.equal(h.counts().qcCalls,2,'journal prevents repeated independent API spending');
});
test('missing evidence, failed repair and ambiguous API cannot be force-passed',()=>{
 const missing=recoverySandbox({evidence:false});const m=missing.sandbox.finalizeWebBlog_(missing.article,{});
 assert.equal(m._editor_decision,'REVIEW_REQUIRED');assert.equal(missing.counts().editorCalls,1);
 assert.equal(JSON.parse(m._editor_notes).production_recovery_v082.stopped_reason,'SOURCE_EVIDENCE_MISSING');
 const fail=recoverySandbox({rejectRepair:true});assert.equal(fail.sandbox.finalizeWebBlog_(fail.article,{})._editor_decision,'REVIEW_REQUIRED');assert.equal(fail.counts().qcCalls,2);
 const api=recoverySandbox({apiError:true});assert.equal(api.sandbox.finalizeWebBlog_(api.article,{})._editor_decision,'REVIEW_REQUIRED');api.sandbox.finalizeWebBlog_(api.article,{});assert.equal(api.counts().qcCalls,1);
});
test('evidence requires exact primary URL; source strings cannot masquerade as verification',()=>{
 const h=recoverySandbox();assert.equal(h.sandbox.v082ResearchEvidence_(['https://evil.test/?https://pubmed.ncbi.nlm.nih.gov/34416428/']).length,0);
 assert.equal(h.sandbox.v082ResearchEvidence_(['https://pubmed.ncbi.nlm.nih.gov/34416428/']).length,1);
});
test('real Oct21 legacy bypass blocks before any billable request; intent is recovery after evening training',()=>{
 const old=preflightEditorialImage(oct21,registry,{requireStrict:true});assert.equal(old.pass,false);assert(old.errors.includes('SEMANTIC_HISTORY_INCOMPLETE'));assert(old.errors.includes('STRICT_ATTEMPT_LIMIT_NOT_ONE'));assert(old.errors.includes('ARTICLE_INTENT_MISMATCH'));assert.equal(old.no_api_calls,true);
 assert.equal(articleSceneIntent({title:oct21.article_title}),'recovery');
});
test('R2/R3/R4/R6/R8/R9 rejection ledger survives fake PASS, asset rename with same hashes',()=>{
 for(const version of ['reference-v26-grounded-evolgear-20261018-contract-r2','reference-v3-grounded-evolgear-20261018-contract-r3','reference-v3-masked-evolgear-20261018-contract-r4','reference-v3-lobby-route-b-20261018-contract-r6','reference-v31-lobby-contract-review-20261018-r8','reference-v31-evolgear-terms-foreground-20261018-r9']) {
  assert(editorialAssetRejected({asset_version:version},{pass:true}));assert.equal(hybridQaReady({image_asset_version:version},{pass:true}),false);
 }
 assert(editorialAssetRejected({asset_version:'renamed'},{scene_grounding:{asset_hashes:{thumbnail:'78054aefa2a4bd977e8c560a1affdb36fdcc92da56f5518230efa0a317534508'}}}));
 const r7=JSON.parse(fs.readFileSync('editorial/image-qa/personal-gym-first-session-pain-health-history-reference-v26-grounded-lobbysp-20261015-pain-r7-depth-portrait-offline.json'));
 assert.equal(editorialAssetRejected({},r7),false);
});
test('durable API reservations survive runner restart and forbid repeated or ambiguous paid requests',async()=>{
 const store=ledgerStore(),job={slug:'test',asset_version:'synthetic',scene_plan:{source_sha256:'a'}};
 let ledger=createImageApiLedger({job,...store});const n=await ledger.reserve('generation');
 ledger=createImageApiLedger({job,...store});await assert.rejects(()=>ledger.reserve('qc'),/AMBIGUOUS/);
 await ledger.complete(n,{http_status:200,usage:{total_tokens:7},request_id:'synthetic'});
 await assert.rejects(()=>ledger.reserve('generation'),/GENERATION_CALL_LIMIT/);
 for(let i=0;i<2;i++){const q=await ledger.reserve('qc');await ledger.complete(q,{http_status:200});}
 await assert.rejects(()=>ledger.reserve('qc'),/QC_CALL_LIMIT/);assert.equal(store.get().confirmed_cost,null);
 await assert.rejects(()=>createImageApiLedger({job:{...job,image_headline_short:'changed'},...store}).reserve('qc'),/CONTRACT_CHANGED/);
});
test('reservation write or completion failure stops API route rather than resetting usage',async()=>{
 const job={slug:'test',asset_version:'synthetic'};let calls=0;
 const ledger=createImageApiLedger({job,read:async()=>({exists:false}),write:async()=>{throw new Error('SYNC_FAILED');}});
 await assert.rejects(async()=>{await ledger.reserve('generation');calls++;},/SYNC_FAILED/);assert.equal(calls,0);
});
test('Working Draft and stale body QC cannot reach review; published needs external proof',()=>{
 const a={body_markdown:'body',image_qa:{independent_qc_pass:false,bridge_synced:false}};
 assert.equal(editorialProductionProgress(a,{ok:true}).stage,'DRAFT');
 const proof={schema:'editorial-text-qc-v1',evidence_sha256:'a'.repeat(64),pass:true,total:20,issues:[],source_unverified:false,body_sha256:editorialBodySha('body')};
 assert(validateEditorialTextQc('body',proof).pass);assert(!validateEditorialTextQc('changed',proof).pass);
 const ready={...a,image_qa:{pass:true,editorial_text_qc:proof},image_status:'READY',image_asset_ready:true,gbp_image_status:'READY',editorial_sync_hash:'hash',editorial_synced_at:'2026-10-20'};
 const p=editorialProductionProgress(ready,{ok:true});assert.equal(p.stage,'REVIEW_READY');assert.equal(p.automatic_publish,false);
 assert.equal(editorialProductionProgress({...ready,publish_status:'PUBLISHED'}).stage,'BRIDGE_SYNCED');
 assert.equal(editorialProductionProgress({...ready,publish_status:'PUBLISHED',publish_verified_at:'2026-10-20',published_url:'https://example.test/blog/'}).stage,'PUBLISHED');
});

test('existing held draft is resumed on Primary without Writer reset, original body retained',()=>{
 const h=recoverySandbox({rejectFirst:false}),s=h.sandbox,blog={...h.article,__row:1,content_id:'BLOG-TEST',status:'REVIEW_REQUIRED',editor_notes:JSON.stringify({quality_v080:{independent:{pass:false}}}),editor_score:91,source_refs:JSON.stringify(h.article.source_refs)};
 const queue={__row:1,content_id:'BLOG-TEST',queue_status:'REVIEW_REQUIRED',draft_status:'REVIEW_REQUIRED',knowledge_context_json:JSON.stringify({topic_approval:{approved_at:'2026-10-20',proposal_id:'TP-TEST'},interview:[{answer:'Owner confirmed position'}]}),topic_gate_json:JSON.stringify({decision:'PUBLISH'})};
 const sheets={'26_DAILY_EDITORIAL_QUEUE':[queue],'21_WEB_BLOG_OUTPUT':[blog],'22_GBP_POST':[]};
 s.ss_=()=>({getSheetByName:n=>sheets[n]});s.getObjectsWithRow_=rows=>rows;
 const original=blog.body_markdown;const resumed=s.v082ResumeExistingReview_();
 assert.equal(resumed.status,'EXISTING_DRAFT_QC_PASSED');assert.equal(h.counts().writerCalls,0);assert.equal(queue.draft_status,'READY');assert.equal(queue.queue_status,'BRIDGE_ERROR','accepted blog must enter the existing Supervisor retry selector');
 assert.equal(JSON.parse(blog.editor_notes).recovery_v082_prior_body,original);
 assert.equal(s.v082ResumeExistingReview_(),null,'second tick does not redo QC');
 s.v065SyncBridgeDirect_(queue,blog);s.v065SyncBridgeDirect_(queue,blog);assert.equal(sheets['22_GBP_POST'].length,1,'GBP is checkpointed and idempotent');
 blog.body_markdown+=' changed';assert.throws(()=>s.v065SyncBridgeDirect_(queue,blog),/TEXT_QC_NOT_PASSED/);
});

test('known hard-restore clipping route stops before image API',async()=>{
 const {editV3PhotoWithLockedBackground}=await import('../lib/editorialLockedBackgroundEdit.mjs');let requests=0;
 await assert.rejects(()=>editV3PhotoWithLockedBackground({job:{v3:{background_lock:'masked_openai_edit_hard_restore_v1'}},generateResponse:async()=>{requests++;}}),/HARD_RESTORE_ROUTE_PAUSED/);
 assert.equal(requests,0);
});

function acceptedCheckpointHarness(state='QC'){
 const sheets={'26_DAILY_EDITORIAL_QUEUE':[],'21_WEB_BLOG_OUTPUT':[],'22_GBP_POST':[]};
 const h=recoverySandbox({rejectFirst:false,primary:s=>{
  const q=sheets['26_DAILY_EDITORIAL_QUEUE'].find(x=>x.queue_status==='BRIDGE_ERROR'&&x.draft_status==='READY');
  if(!q)return {status:'NO_BRIDGE_RETRY'};
  s.v065SyncBridgeDirect_(q,sheets['21_WEB_BLOG_OUTPUT'][0]);q.queue_status='IMAGE_PREPARING';
  return {status:'IMAGE_PREPARING'};
 }});
 const final=h.sandbox.finalizeWebBlog_(h.article,{});
 const blog={...final,__row:1,content_id:'BLOG-CHECKPOINT',status:'READY',editor_decision:final._editor_decision,fact_check_status:'PASS',editor_notes:final._editor_notes};
 const q={__row:1,content_id:blog.content_id,queue_status:state,draft_status:'QC',failed_stage:'INDEPENDENT_QC',knowledge_context_json:JSON.stringify({decision:'SUFFICIENT',topic_approval:{approved_at:'2026-10-21',proposal_id:'TP-CHECKPOINT'},interview:[]}),topic_gate_json:JSON.stringify({decision:'PUBLISH'})};
 sheets['21_WEB_BLOG_OUTPUT'].push(blog);sheets['26_DAILY_EDITORIAL_QUEUE'].push(q);
 sheets['22_GBP_POST'].push({__row:1,parent_blog_id:blog.content_id,status:'READY'});
 h.sandbox.generateGBPFromBlog_=()=>{throw Error('SUCCESSFUL_GBP_MUST_BE_REUSED');};
 h.sandbox.ss_=()=>({getSheetByName:n=>sheets[n]});
 return {...h,blog,q,sheets};
}

test('saved accepted text resumes through Primary and the legacy Bridge retry selector without spending or manual nudges',()=>{
 for(const state of ['QC','REVIEW_REQUIRED','BRIDGE_SYNCING']){
  const h=acceptedCheckpointHarness(state),s=h.sandbox,body=h.blog.body_markdown,before=h.counts();
  // Even an exhausted or ambiguous paid journal must not prevent a free,
  // independently verified synchronization checkpoint from being resumed.
  s.v082Journal_(h.article,{},r=>r.calls.push({kind:'qc',status:'UNCERTAIN',request_id:'previous-uncertain-qc'}));
  const journal=JSON.stringify(s.v082Journal_(h.article,{}));
  assert.equal(s.v065GeneratePendingArticle_().status,'ACCEPTED_BLOG_CHECKPOINT_RESUMED');
  assert.equal(h.q.queue_status,'BRIDGE_ERROR');assert.equal(h.q.human_action_required,'NONE');
  assert.equal(s.v065GeneratePendingArticle_().status,'IMAGE_PREPARING');
  assert.equal(h.bridgeRequests.length,1);assert.equal(h.sheets['22_GBP_POST'].length,1);
  assert.equal(s.v065GeneratePendingArticle_().status,'NO_BRIDGE_RETRY');
  assert.equal(h.bridgeRequests.length,1);assert.equal(h.blog.body_markdown,body);
  assert.deepEqual(h.counts(),before);assert.equal(JSON.stringify(s.v082Journal_(h.article,{})),journal);
 }
});

test('free accepted-body resume preserves approvals, exact QC, duplicate checks, image holds and publication boundaries',()=>{
 const cases=[
  h=>h.blog.body_markdown+=' changed after QC',
  h=>h.blog.editor_notes=JSON.stringify({quality_v080:{passed:true,independent:{pass:true}}}),
  h=>{const n=JSON.parse(h.blog.editor_notes);n.quality_v080.independent.issues=['unsupported claim'];h.blog.editor_notes=JSON.stringify(n);},
  h=>{const n=JSON.parse(h.blog.editor_notes);delete n.quality_v080.independent.total;h.blog.editor_notes=JSON.stringify(n);},
  h=>h.q.knowledge_context_json=JSON.stringify({decision:'SUFFICIENT',topic_approval:{}}),
  h=>h.q.knowledge_context_json=JSON.stringify({decision:'INTERVIEW',topic_approval:{approved_at:'2026-10-21'},interview:[{answer:''}]}),
  h=>h.q.topic_gate_json=JSON.stringify({decision:'HOLD'}),
  h=>h.sheets['21_WEB_BLOG_OUTPUT'].push({...h.blog,__row:2}),
  h=>h.q.failed_stage='IMAGE_OPERATOR',
  h=>h.q.queue_status='REVIEW_READY',
  h=>h.q.queue_status='PUBLISHED',
 ];
 for(const alter of cases){
  const h=acceptedCheckpointHarness();alter(h);const before=JSON.stringify(h.q),calls=h.counts();
  assert.equal(h.sandbox.v082ResumeAcceptedBlog_(),null);
  assert.equal(JSON.stringify(h.q),before);assert.deepEqual(h.counts(),calls);assert.equal(h.bridgeRequests.length,0);
 }
});

test('actual operator process survives an API failure, rerun and corrupt state with one request total',async()=>{
 const os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rev-recovery-'));
 try{
  const job=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/personal-gym-first-session-pain-health-history.json'));
  for(const p of [job.automation.source_repo_path,...job.style_references,'editorial/automated-image-sources.json']){
   fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.copyFileSync(p,path.join(root,p));
  }
  fs.writeFileSync(path.join(root,'job.json'),JSON.stringify(job));
  fs.writeFileSync(path.join(root,'mock.mjs'),`import fs from 'node:fs';globalThis.fetch=async(u,o={})=>{if(String(u).startsWith('https://api.github.com/')){if(o.method==='PUT'){const b=JSON.parse(o.body);fs.writeFileSync('remote.json',Buffer.from(b.content,'base64'));return new Response(JSON.stringify({content:{sha:'mock'},commit:{sha:'mock'}}),{status:201});}return fs.existsSync('remote.json')?new Response(JSON.stringify({sha:'mock',content:fs.readFileSync('remote.json').toString('base64'),encoding:'base64'})):new Response('{}',{status:404});}if(String(u)==='https://api.openai.com/v1/responses'){fs.appendFileSync('paid.log','request\\n');return new Response(JSON.stringify({error:{message:'synthetic outage'}}),{status:503});}throw new Error('UNMOCKED');};`);
  const state=path.join(root,'editorial/image-operator-state/'+job.slug+'.json');
  const run=()=>spawnSync(process.execPath,['--import',path.join(root,'mock.mjs'),path.resolve('scripts/auto-editorial-hybrid-image.mjs'),'job.json'],{cwd:root,env:{...process.env,OPENAI_API_KEY:'synthetic',GITHUB_TOKEN:'synthetic',GITHUB_REPO:'test/editorial',GITHUB_BRANCH:'test'},encoding:'utf8',timeout:10000});
  const a=run();assert.equal(a.status,0,a.stderr);assert.equal(JSON.parse(fs.readFileSync(state)).status,'ERROR');
  assert.equal(fs.readFileSync(path.join(root,'paid.log'),'utf8'),'request\n');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'remote.json'))).calls.length,1);
  assert.equal(run().status,0);assert.equal(fs.readFileSync(path.join(root,'paid.log'),'utf8'),'request\n');
  fs.writeFileSync(state,'{broken');assert.notEqual(run().status,0);assert.equal(fs.readFileSync(path.join(root,'paid.log'),'utf8'),'request\n');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('actual workflow selector holds an exhausted article while admitting the next article',async()=>{
 const os=await import('node:os'),path=await import('node:path'),{execFileSync}=await import('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rev-select-'));
 try{
  const flow=fs.readFileSync('.github/workflows/auto-editorial-hybrid-images.yml','utf8');
  const raw=flow.split("python3 <<'PY'\n")[1].split('\n          PY')[0];
  const python=raw.split('\n').map(x=>x.startsWith('          ')?x.slice(10):x).join('\n');
  fs.mkdirSync(path.join(root,'editorial/image-operator-state'),{recursive:true});
  fs.writeFileSync(path.join(root,'source.jpg'),'synthetic existence marker');
  const job=(slug,version)=>({slug,asset_version:version,automation:{mode:'unattended-github-actions-v1',source_repo_path:'source.jpg'},generated_scene_path:slug+'-scene.png',thumbnail:slug+'-thumb.jpg',og_image:slug+'-og.jpg',gbp_image:slug+'-gbp.jpg',qa_report_path:slug+'-qa.json'});
  fs.writeFileSync(path.join(root,'held.json'),JSON.stringify(job('held','exhausted')));fs.writeFileSync(path.join(root,'next.json'),JSON.stringify(job('next','new')));
  fs.writeFileSync(path.join(root,'editorial/image-operator-state/held.json'),JSON.stringify({asset_version:'exhausted',status:'ERROR',attempts_total:2,max_attempts:2}));
  fs.writeFileSync(path.join(root,'.candidate-jobs'),'held.json\nnext.json\n');
  execFileSync('python3',['-c',python],{cwd:root,encoding:'utf8'});
  assert.equal(fs.readFileSync(path.join(root,'.operator-jobs'),'utf8'),'next.json\n');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'editorial/image-operator-state/held.json'))).attempts_total,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('changing a guarded edit mask cannot reuse an already reserved API budget',async()=>{
 const store=ledgerStore(),job={slug:'test',asset_version:'guarded',v3:{background_lock:'masked_openai_raw_guard_v2',guarded_edit:{edit:{x:560}}}};
 const first=createImageApiLedger({job,...store}),n=await first.reserve('generation');await first.complete(n,{http_status:200});
 await assert.rejects(()=>createImageApiLedger({job:{...job,v3:{...job.v3,guarded_edit:{edit:{x:500}}}},...store}).reserve('qc'),/CONTRACT_CHANGED/);
});

test('fresh GAS install imports all three actual external QCs including the approved extra instead of resetting the Oct21 budget',()=>{
 const h=recoverySandbox(),draft={...h.article,slug_suggestion:'night-workout-sleep-timing-intensity'},ctx={first_party_interview:{source_id:'TP-20261021',raw_answer:'Approved Owner answer'}};
 const r=h.sandbox.v082Journal_(draft,ctx);assert.equal(r.calls.length,3);assert(r.calls.every(c=>c.kind==='qc'&&c.imported));assert(r.calls.slice(0,2).every(c=>c.pass===false));assert.equal(r.calls[2].pass,true);assert.equal(r.calls[2].request_id,'req_4f37704fd44a4f808505aae038f4d60f');
 assert.equal(r.calls[0].request_id,'req_5132beae5d104cfb807c551661e7ae18');assert.equal(r.calls[1].usage.total_tokens,4211);
 assert.throws(()=>h.sandbox.v082Reserve_(draft,ctx,'qc'),/QC_LIMIT/);
 assert.throws(()=>h.sandbox.v082Reserve_(draft,{},'qc'),/QC_LIMIT/,'slug fallback also retains consumed history');
 assert.equal(h.sandbox.v082Journal_(draft,ctx).calls.length,3);assert.equal(h.counts().qcCalls,0);
});
