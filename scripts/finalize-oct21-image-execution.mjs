import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {getFile} from '../lib/githubContent.mjs';
import {imageUsageReceipt} from '../lib/editorialImageUsageReceipt.mjs';
import {compareUnchangedPhotoQc} from '../lib/editorialVisualQcConsistency.mjs';
const root=process.argv[2]||'editorial/prepublication/2026-10-21-evening-strength-sleep',read=p=>JSON.parse(fs.readFileSync(p));
if(!/^editorial\/prepublication\/2026-10-21-evening-strength-sleep(?:\/(?:image-finish-r[45]|image-layout-r5b?))?$/.test(root))throw Error('FINALIZER_SCOPE_INVALID');
const job=read(root+'/IMAGE_JOB.json');
const stateFile=root+'/image-execution-state/'+job.slug+'.json';
const state=fs.existsSync(stateFile)?read(stateFile):{};
const qa=fs.existsSync(job.qa_report_path)?read(job.qa_report_path):null;
const ledgerFile='editorial/image-api-ledger/'+job.slug+'-'+job.asset_version+'.json';
let ledger=null,ledger_read_error=null;
try{const f=await getFile(ledgerFile);if(f.exists)ledger=JSON.parse(f.content);}
catch(e){ledger_read_error=String(e?.message||e).slice(0,200);}
const receipt=imageUsageReceipt({durable:ledger,qa});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const preservationPass=job.v3?.background_lock==='owner-japanese-night-finish-v1'?qa?.source_preservation_gate?.pass===true:qa?.raw_background_guard?.pass===true;
const priorObservation=job.automation?.grounding_observation_reuse?.path;
const consistency=priorObservation&&fs.existsSync(priorObservation)?compareUnchangedPhotoQc(read(priorObservation),qa):null;
const pass=receipt.verified&&state.status==='READY_CANDIDATE'&&qa?.pass===true&&preservationPass&&qa.r7_comparison?.pass===true&&!consistency?.conflicts?.length;
const files=[job.generated_scene_path,job.thumbnail,job.og_image,job.gbp_image].filter(p=>fs.existsSync(p)).map(path=>({path,sha256:sha(path),bytes:fs.statSync(path).size}));
const result={content_id:job.execution.content_id,asset_version:job.asset_version,at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID||null,checkout_sha:process.env.GITHUB_SHA||null,status:pass?'IMAGE_ACCEPTED_PRODUCTION_AUTHORIZATION_REQUIRED':consistency?.conflicts?.length?'INDEPENDENT_QC_CONFLICT_REVIEW_REQUIRED':state.status||'EXECUTION_FAILED',
 image_qc_pass:pass,operator_state:state,qa_report:qa,files,
 api_calls:receipt.calls,generation_calls:receipt.generation_calls,qc_calls:receipt.qc_calls,api_usage_receipt:receipt,ledger_read_error,confirmed_cost:null,qc_consistency:consistency,
 cost_ceiling_verification:'WAIVED_BY_OWNER',production_writes:false,existing_cms_draft_preserved:true,review_ready:false,
 remaining:pass?['Owner authorization for main/code/GAS/Bridge/Supabase/Sheets/Xserver production changes','Assets-first delivery and SHA/200 verification','Authenticated Console final Preflight']:consistency?.conflicts?.length?['Review localized evidence for contradictory judgments on unchanged RAW','Preserve both failed verdicts; do not vote-shop, regenerate or reset calls','Keep failed assets quarantined and production state unchanged']:['Do not adopt rejected image','Retain raw/QC/usage in private quarantine; no automatic regeneration','Resolve actual rejection causes before another paid attempt']};
fs.writeFileSync(root+'/IMAGE_EXECUTION_RESULT.json',JSON.stringify(result,null,2)+'\n');
const paths=[root+'/IMAGE_JOB.json',root+'/IMAGE_EXECUTION_FREE_PREFLIGHT.json',root+'/IMAGE_ADMISSION_READBACK.json',root+'/IMAGE_EXECUTION_RESULT.json',stateFile,job.qa_report_path,ledgerFile].filter(p=>fs.existsSync(p));
if(pass)paths.push(...files.map(f=>f.path),job.generated_scene_path+'.raw-guard.json',job.thumbnail+'.typography.json',...['thumbnail','og_image','gbp_image'].flatMap(k=>[320,400].map(w=>job[k].replace(/\.jpg$/, '-preview-'+w+'.jpg'))));
fs.writeFileSync('.oct21-approved-result-paths',paths.filter(p=>fs.existsSync(p)).join('\n')+'\n');
console.log(JSON.stringify({status:result.status,image_qc_pass:pass,generation_calls:result.generation_calls,qc_calls:result.qc_calls,production_writes:false}));
