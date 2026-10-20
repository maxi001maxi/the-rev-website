// Exact production v0.8 gate + reviewed evidence, at most two evidence-changing, remote-reserved requests.
// No image generation, DB changes, Bridge POST, deployment or publication.
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {getFile,putFile} from '../lib/githubContent.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep';
const sha=x=>createHash('sha256').update(x).digest('hex');
const source=fs.readFileSync(root+'/ARTICLE_DRAFT.md','utf8');
const title=source.split('\n')[0].replace(/^#\s*/,''),body=source.slice(source.indexOf('\n')+1).trim();
const research=JSON.parse(fs.readFileSync(root+'/VERIFIED_RESEARCH.json'));
const owner=JSON.parse(fs.readFileSync(root+'/APPROVED_INTERVIEW.json'));
const claimPath='editorial/production-recovery/2026-10-20/oct21-independent-qc-claim.json';
const reportPath=root+'/INDEPENDENT_QC_V082.json';
if(owner.content_id!=='BLOG-20261021-4ac8fd'||owner.status!=='QUEUE_CREATED'||!owner.approved_at||!owner.raw_answer)throw new Error('APPROVED_OWNER_EVIDENCE_MISSING');
let payload,response;
const context={console,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'OFF'})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,v)=>[...createHash('sha256').update(v).digest()]},
  getSettings_:()=>({blog_editor_model:'gpt-5.6'}),parseStructuredResponse_:r=>JSON.parse((r.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')),
  openAIRequest_:(_,p)=>{payload=p;if(!response)throw new Error('CAPTURE_ONLY');return response;}};
vm.createContext(context);
for(const p of ['DailyEditorialQuality_v0.8.0.gs','DailyEditorialProductionRecovery_v0.8.2.gs'])vm.runInContext(fs.readFileSync('editorial/gas/'+p,'utf8'),context);
if(JSON.stringify(context.V082_RESEARCH_CATALOG)!==JSON.stringify(research.sources))throw new Error('REVIEWED_CATALOG_DRIFT');
const article={title,slug_suggestion:'night-workout-sleep-timing-intensity',article_type:'STANDARD',body_markdown:body,source_refs:research.sources.map(x=>x.url)};
const ctx={first_party_interview:owner};
try{context.v080IndependentQc_(article,ctx);}catch(e){if(e.message!=='CAPTURE_ONLY')throw e;}
if(process.env.EDITORIAL_QC_CAPTURE_ONLY==='1'){
 fs.writeFileSync(root+'/QC_FREE_PREFLIGHT.json',JSON.stringify({content_id:owner.content_id,body_sha256:sha(body),evidence_sha256:sha(JSON.stringify(research.sources)),source_count:research.sources.length,owner_source:owner.source_id,no_api_calls:true,status:'READY_FOR_ONE_INDEPENDENT_TEXT_QC',body_chars:body.replace(/\s/g,'').length},null,2)+'\n');
 process.exit(0);
}
if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY_MISSING');
const plan=JSON.parse(fs.readFileSync(root+'/QC_EXECUTION.json'));
const prior=await getFile(claimPath),old=prior.exists?JSON.parse(prior.content):null;
const previousCalls=old?(old.calls||[{status:old.status,body_sha256:old.body_sha256,request_id:old.request_id,usage:old.usage,pass:old.pass}]):[];
if(old && (plan.mode!=='REPAIR_TEXT_QC'||plan.max_requests!==2||old.status!=='COMPLETED'||old.pass!==false||old.body_sha256===sha(body)||previousCalls.length>=2))throw new Error('QC_ALREADY_RESERVED_NO_AUTOMATIC_RETRY');
const claim={content_id:owner.content_id,body_sha256:sha(body),request_sha256:sha(JSON.stringify(payload)),status:'STARTED',started_at:new Date().toISOString(),max_requests:Math.min(2,Number(plan.max_requests)||1),total_requests:previousCalls.length+1,calls:[...previousCalls,{status:'STARTED',body_sha256:sha(body),at:new Date().toISOString()}],confirmed_cost:null};
await putFile({path:claimPath,sha:prior.exists?prior.sha:null,content:JSON.stringify(claim,null,2)+'\n',message:'Reserve one Oct21 independent text QC (no image or publish)'});
const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(180000)});
response=await res.json();
const report={...claim,status:res.ok?'COMPLETED':'FAILED',checked_at:new Date().toISOString(),request_id:res.headers.get('x-request-id'),response_id:response.id||null,model:response.model||payload.model,http_status:res.status,usage:response.usage||null,pass:false,confirmed_cost:null,production_db_changed:false,image_calls:0,published:false,gbp_posted:false};
if(res.ok)Object.assign(report,context.v080IndependentQc_(article,ctx));
else report.error=String(response.error?.message||'Provider error').slice(0,500);
Object.assign(report.calls[report.calls.length-1],{status:report.status,request_id:report.request_id,usage:report.usage,pass:report.pass,confirmed_cost:null});
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const existing=await getFile(reportPath);await putFile({path:reportPath,sha:existing.exists?existing.sha:null,content:JSON.stringify(report,null,2)+'\n',message:'Record genuine Oct21 independent text QC and token usage'});
const reserved=await getFile(claimPath);await putFile({path:claimPath,sha:reserved.sha,content:JSON.stringify(report,null,2)+'\n',message:'Close Oct21 independent QC reservation without publishing'});
console.log(JSON.stringify({pass:report.pass,total:report.total,issues:report.issues,request_id:report.request_id,usage:report.usage,confirmed_cost:null}));
if(!report.pass)process.exitCode=1;
