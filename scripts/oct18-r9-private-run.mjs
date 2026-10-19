// One authorized private branch run. No Bridge, Supabase, FTP or deployment.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {briefDigest,recoveryJobDigest} from '../lib/editorialOct18V31Recovery.mjs';
import {R9_VERSION as OCT18_R9,r9BriefPreflight,prepareR9Source} from '../lib/editorialOct18R9.mjs';
import {chromium} from 'playwright';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {hybridQaReady} from '../lib/editorialHybridImageFormat.mjs';
import {evaluateEditorialImageReview} from '../lib/editorialImageReviewGate.mjs';

export const DIR='editorial/prepublication/2026-10-18-contract-checklist/v31-r9';
export const BRANCH='fix/editorial-v31-e2e-recovery-20261018';
export const CLAIM=DIR+'/SPEND_CLAIM.json';
const RESULT=DIR+'/PRIVATE_RESULT';
const REPO='maxi001maxi/the-rev-website';
const SLUG='personal-gym-trial-three-checks';
const digest=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,data)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');};
const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();

export function verifyR9Approval(root=process.cwd()) {
  const p=x=>path.join(root,x);
  const job=read(p(DIR+'/PROPOSED_JOB.json')),brief=read(p(DIR+'/CREATIVE_BRIEF.json'));
  const free=read(p(DIR+'/FREE_PREFLIGHT.json')),approval=read(p(DIR+'/OWNER_SPEND_APPROVAL.json'));
  ensure(recoveryJobDigest(job)===free.job_contract_sha256 && briefDigest(brief)===free.brief_contract_sha256,'R9_FREE_PREFLIGHT_CONTRACT_CHANGED');
  ensure(digest(fs.readFileSync(p(DIR+'/FREE_PREFLIGHT.json')))===approval.free_preflight_file_sha256,'R9_APPROVED_PREFLIGHT_BYTES_CHANGED');
  ensure(free.status==='FREE_DESIGN_PREFLIGHT_PASS' && free.source_lock?.changed_protected_pixels===0 && free.geometry.length===3 && free.geometry.every(g=>g.person_action_safe===true && g.protected_equipment.every(a=>a.visible)) && free.canonical_renderer?.pass===true,'R9_FREE_PREFLIGHT_NOT_PASS');
  for(const v of free.canonical_renderer.variants)ensure(digest(fs.readFileSync(p(v.path)))===v.sha256,'R9_PLANNING_BYTES_CHANGED');
  ensure(digest(fs.readFileSync(p(brief.source.path)))===brief.source.sha256,'R9_SOURCE_BYTES_CHANGED');
  ensure(['main_merge','production_code','supabase','xserver','article_publish','gbp_post'].every(k=>approval.prohibited_operations?.[k]===true),'R9_PRODUCTION_BOUNDARY_MISSING');
  job.v31.owner_spend_approval='APPROVED';job.v31.owner_approval=approval;
  const checked=r9BriefPreflight(job,brief,{requireApproval:true});
  ensure(checked.pass,'R9_APPROVAL_INVALID: '+checked.errors.join(','));
  const freeRuntime=preflightEditorialImage(job,read(p('editorial/automated-image-sources.json')));
  ensure(freeRuntime.pass,'R9_RUNTIME_PREFLIGHT_FAILED: '+freeRuntime.errors.join(','));
  return {job,brief,approval};
}

export function guardPrivateEnvironment(env) {
  ensure(env.GITHUB_REPOSITORY===REPO && env.GITHUB_REF==='refs/heads/'+BRANCH && env.GITHUB_EVENT_NAME==='push','R9_WRONG_REPO_BRANCH_OR_EVENT');
  ensure(String(env.GITHUB_RUN_ATTEMPT)==='1' && /^\d+$/.test(env.GITHUB_RUN_ID||'') && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''),'R9_RERUN_OR_RUN_ID_BLOCKED');
}

export function claimPrivateRun({root=process.cwd(),env=process.env,verify=verifyR9Approval}={}) {
  guardPrivateEnvironment(env);
  const {approval}=verify(root);
  ensure(!fs.existsSync(path.join(root,CLAIM)),'R9_SPEND_ALREADY_CLAIMED');
  git(root,'fetch','origin',BRANCH);
  ensure(git(root,'rev-parse','origin/'+BRANCH)===env.GITHUB_SHA && git(root,'rev-parse','HEAD')===env.GITHUB_SHA,'R9_BRANCH_MOVED_BEFORE_CLAIM');
  write(path.join(root,CLAIM),{asset_version:OCT18_R9,status:'RESERVED_BEFORE_API',run_id:env.GITHUB_RUN_ID,run_attempt:1,source_commit:env.GITHUB_SHA,approval_sha256:digest(JSON.stringify(approval)),max_generation_calls:1,max_qc_calls:2,automatic_retry:false,production_operations_permitted:false,created_at:new Date().toISOString()});
  git(root,'add','--',CLAIM);
  git(root,'-c','user.name=THE REV R9 Private Operator','-c','user.email=actions@users.noreply.github.com','commit','-m','Reserve the single Owner-approved R9 private image budget');
  // No API is reachable until this fast-forward push succeeds. The durable
  // claim blocks every later run, including a fresh runner with no checkpoint.
  git(root,'push','origin','HEAD:refs/heads/'+BRANCH);
  return read(path.join(root,CLAIM));
}

function verifyClaim(root,env,approval) {
  guardPrivateEnvironment(env);
  const claim=read(path.join(root,CLAIM));
  ensure(claim.asset_version===OCT18_R9 && claim.run_id===env.GITHUB_RUN_ID && claim.source_commit===env.GITHUB_SHA && claim.status==='RESERVED_BEFORE_API' && claim.approval_sha256===digest(JSON.stringify(approval)),'R9_CLAIM_NOT_OWNED_BY_THIS_RUN');
  git(root,'fetch','origin',BRANCH);
  ensure(git(root,'rev-parse','HEAD')===git(root,'rev-parse','origin/'+BRANCH),'R9_CLAIM_PUSH_NOT_CONFIRMED');
}

export function imageDimensions(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  ensure(bytes[0]===255 && bytes[1]===216,'R9_INVALID_IMAGE_BYTES');
  let i=2;
  while(i+8<bytes.length) {
    ensure(bytes[i++]===255,'R9_INVALID_JPEG_MARKER');while(bytes[i]===255)i++;
    const marker=bytes[i++];
    if(marker===217||marker===218)break;
    if(marker===1 || (marker>=208&&marker<=215))continue;
    const n=bytes.readUInt16BE(i);
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {width:bytes.readUInt16BE(i+5),height:bytes.readUInt16BE(i+3)};
    ensure(n>=2,'R9_INVALID_JPEG_SEGMENT');i+=n;
  }
  throw new Error('R9_IMAGE_DIMENSIONS_MISSING');
}

export function collectPrivateResult(root=process.cwd(),env=process.env) {
  const {job,approval}=verifyR9Approval(root);
  const stateFile=`editorial/image-operator-state/${SLUG}.json`;
  const raw=fs.existsSync(path.join(root,stateFile))?read(path.join(root,stateFile)):{};
  const state=raw.asset_version===OCT18_R9?raw:{};
  const calls=state.api_calls||[];
  const dest=path.join(root,RESULT);fs.mkdirSync(dest,{recursive:true});
  const quarantine=path.join(root,'.operator-rejected-evidence',SLUG,OCT18_R9);
  const files=[];
  const copy=(relative,name)=>{
    const normal=path.join(root,relative),isolated=path.join(quarantine,relative);
    const source=fs.existsSync(normal)?normal:fs.existsSync(isolated)?isolated:null;
    if(!source)return null;
    const target=path.join(dest,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
    const bytes=fs.readFileSync(target);
    const entry={path:path.posix.join(RESULT,name),sha256:digest(bytes),bytes:bytes.length,quarantined:source===isolated};
    if(/\.(jpg|png)$/.test(name))Object.assign(entry,imageDimensions(bytes));
    files.push(entry);return entry;
  };
  const scene=copy(job.generated_scene_path,'images/scene.png');
  copy(job.generated_scene_path+'.raw.png','images/raw.png');
  copy(job.generated_scene_path+'.raw-mask-check.json','raw-mask-check.json');
  copy(job.generated_scene_path+'.locked-background.json','source-pixel-lock.json');
  const variants=[['thumbnail',job.thumbnail,1200,675],['og',job.og_image,1200,630],['gbp',job.gbp_image,1200,900]];
  const media=variants.map(([k,p])=>copy(p,`images/${k}.jpg`));
  copy(job.qa_report_path,'independent-visual-qc.json');copy(job.thumbnail+'.typography.json','typography.json');
  for(const [k,p] of variants)for(const size of [320,400])copy(p.replace(/\.jpg$/,`-preview-${size}.jpg`),`previews/${k}-${size}.jpg`);
  if(Object.keys(state).length)write(path.join(dest,'operator-state.json'),state);
  for(const n of ['api-usage.jsonl','independent-grounding.json']) {
    const p=path.join(root,DIR,'runtime',n);if(fs.existsSync(p))fs.copyFileSync(p,path.join(dest,n));
  }
  const qaPath=path.join(dest,'independent-visual-qc.json'),qa=fs.existsSync(qaPath)?read(qaPath):null;
  const draft={slug:SLUG,image_asset_version:OCT18_R9,image_render_version:job.render_version,image_strategy:job.image_strategy};
  const checks={operator_candidate:state.status==='READY_CANDIDATE',independent_qa:qa?.pass===true,
    canonical_hybrid:hybridQaReady(draft,qa),canonical_review:qa?evaluateEditorialImageReview({draft,qa}).ok:false,
    dimensions:variants.every(([, ,w,h],i)=>media[i]?.width===w&&media[i]?.height===h),
    qa_bound_sha256:variants.every(([k],i)=>media[i] && qa?.scene_grounding?.asset_hashes?.[k]===media[i].sha256) && !!scene && qa?.scene_grounding?.asset_hashes?.scene===scene.sha256,
    budget:calls.filter(c=>c.kind==='generation').length<=1 && calls.filter(c=>c.kind==='qc').length<=2,
    complete_independent_calls:calls.filter(c=>c.kind==='qc'&&c.status==='COMPLETED').length===2};
  const pass=Object.values(checks).every(v=>v===true);
  const summary={content_id:approval.content_id,asset_version:OCT18_R9,run_id:env.GITHUB_RUN_ID||null,private_qc_pass:pass,
    status:pass?'PRIVATE_QC_PASS_OWNER_VISUAL_REVIEW_PENDING':qa?.pass===false?'REJECTED_AND_QUARANTINED':'STOPPED_WITH_CHECKPOINTS',
    operator_status:state.status||'NOT_STARTED',stop_reason:state.last_error||null,checks,files,
    api_usage:{generation_requests:calls.filter(c=>c.kind==='generation').length,qc_requests:calls.filter(c=>c.kind==='qc').length,image_generation_tool_calls:calls.reduce((n,c)=>n+(c.image_generation_calls||[]).length,0),calls,confirmed_cost:null,cost_note:'Response usage is recorded verbatim; no billing total or currency amount was returned/verified.'},
    owner_publish_ready:false,production_mutations:0,automatic_retry:false,next_action:pass?'OWNER_VISUAL_REVIEW_THEN_SEPARATE_PRODUCTION_APPROVAL':'REVIEW_EVIDENCE_NO_MORE_PAID_CALLS'};
  write(path.join(dest,'RESULT.json'),summary);
  fs.writeFileSync(path.join(dest,'README.md'),`# R9 private generation/QC result\n\nStatus: **${summary.status}**.\n\nImages in this directory are review evidence, not publication assets. The actual model result is retained even when rejected. No main merge, Supabase/Xserver change, publication or GBP post.\n\nSee RESULT.json, independent-visual-qc.json and API usage/checkpoints. Further paid attempts require new Owner approval.\n`);
  if(fs.existsSync(path.join(root,CLAIM))) {
    const claim=read(path.join(root,CLAIM));
    ensure(claim.run_id===env.GITHUB_RUN_ID,'R9_CLAIM_RUN_MISMATCH');
    write(path.join(root,CLAIM),{...claim,status:'CLOSED_NO_AUTOMATIC_RETRY',operator_status:summary.operator_status,result_status:summary.status,generation_requests:summary.api_usage.generation_requests,qc_requests:summary.api_usage.qc_requests,completed_at:new Date().toISOString()});
  }
  return summary;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const mode=process.argv[2];
  if(mode==='verify') {verifyR9Approval();console.log('R9 approved contract and free Preflight match; no API call');}
  else if(mode==='verify-pixels') {
    const {job,brief}=verifyR9Approval();const browser=await chromium.launch({headless:true});
    try {const page=await browser.newPage(),p=await prepareR9Source(page,brief.source.path,job.v31.locked_edit_plan);
      ensure(digest(Buffer.from(p.sourceDataUrl.split(',')[1],'base64'))===job.v31.source_plate_sha256 && digest(Buffer.from(p.maskDataUrl.split(',')[1],'base64'))===job.v31.edit_mask_sha256,'R9_REVIEWED_SOURCE_PLATE_OR_MASK_CHANGED');
      console.log('R9 exact source plate and mask bytes verified before budget claim; no API call');
    }finally{await browser.close();}
  }
  else if(mode==='claim') {console.log(JSON.stringify(claimPrivateRun()));}
  else if(mode==='execute') {
    const {job,approval}=verifyR9Approval();verifyClaim(process.cwd(),process.env,approval);
    ensure(!!process.env.OPENAI_API_KEY,'R9_EXISTING_ACTIONS_KEY_MISSING');
    const temp='.operator-owner-approved-r9-job.json';write(temp,job);
    const result=spawnSync(process.execPath,['scripts/auto-editorial-hybrid-image.mjs',temp],{stdio:'inherit',env:{...process.env,EDITORIAL_IMAGE_MAX_ATTEMPTS:'1'}});
    if(result.error)throw result.error;process.exitCode=result.status||0;
  } else if(mode==='collect') {const s=collectPrivateResult();console.log(JSON.stringify({status:s.status,checks:s.checks,api_requests:s.api_usage.generation_requests+s.api_usage.qc_requests}));}
  else throw new Error('Usage: oct18-r9-private-run.mjs verify|claim|execute|collect');
}
