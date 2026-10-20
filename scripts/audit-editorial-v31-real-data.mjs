// Read-only free preflight against a Supabase SELECT snapshot and public GitHub.
// No authenticated Admin, database mutation, staging or paid model request.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {runPreflight} from '../lib/publishFlow.mjs';
import {imageAcceptanceIssues} from '../lib/editorialImageAcceptance.mjs';
const [snapshotPath,outputPath]=process.argv.slice(2);
if(!snapshotPath || !outputPath)throw Error('snapshot and report paths required');
const row=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
if(row.editorial_content_id!=='BLOG-20261018-082d82')throw Error('ARTICLE_SCOPE_MISMATCH');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const base='editorial/prepublication/2026-10-18-contract-checklist/';
const manuscript=fs.readFileSync(base+'ARTICLE_DRAFT.md');
const bodyQc=JSON.parse(fs.readFileSync(base+'FINAL_QC_RESULT.json'));
const job=JSON.parse(fs.readFileSync(row.image_job_path));
const operator=JSON.parse(fs.readFileSync(`editorial/image-operator-state/${row.slug}.json`));
// Only GET requests to public GitHub. There is no secret or credential here.
Object.assign(process.env,{GITHUB_TOKEN:'public-read-only',GITHUB_REPO:'maxi001maxi/the-rev-website',GITHUB_BRANCH:'main'});
const realFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
  if(options.method && options.method!=='GET')throw Error('REAL_DATA_AUDIT_IS_READ_ONLY');
  const url=String(input);
  if(!url.startsWith('https://api.github.com/'))throw Error('UNEXPECTED_EXTERNAL_REQUEST');
  const headers=new Headers(options.headers);headers.delete('Authorization');
  return realFetch(input,{...options,headers});
};
const db={from(table){if(table!=='admin_article_drafts')throw Error('UNEXPECTED_TABLE');const q={select(){return q},eq(k,v){if(k!=='id'||v!==row.id)throw Error('ARTICLE_SCOPE_MISMATCH');return q},async maybeSingle(){return {data:row,error:null}}};return q;}};
const before=sha(JSON.stringify(row));
const result=await runPreflight({supabase:db,user:null,articleId:row.id,actor:'automation'});
const referenceMatches=['thumbnail','og_image','gbp_image'].every(k=>String(row[k]).replace(/^\//,'')===job[k]) && row.image_qa_report_path===job.qa_report_path;
const report={content_id:row.editorial_content_id,observed_at:row.updated_at,source:'read-only Supabase SELECT snapshot + checked-out main + public GitHub GET',
  body_sha256:sha(row.body_markdown),body_matches_qc_source:manuscript.toString().includes(row.body_markdown.trim()) && sha(manuscript)===bodyQc.source_sha256,
  body_qc:{pass:bodyQc.pass,total:bodyQc.score_total,source_sha256:bodyQc.source_sha256},
  body_preserved:before===sha(JSON.stringify(row)),job_version:job.asset_version,qa_version:row.image_qa?.asset_version,
  references_match_job:referenceMatches,acceptance_issues:imageAcceptanceIssues(row,row.image_qa),operator_status:operator.status,
  measured_historical_calls:{source:'R6_API_USAGE.jsonl',...(()=>{const calls=fs.readFileSync(base+'R6_API_USAGE.jsonl','utf8').trim().split('\n').map(JSON.parse);return {responses:calls.length,image_generation:calls.reduce((n,c)=>n+(c.image_generation_calls?.length||0),0),qc:calls.filter(c=>!c.image_generation_calls?.length).length,confirmed_cost:null}})()},
  preflight:{ok:result.ok,blocker:result.blocker,checks:result.checks},
  result:referenceMatches?'REAL_DATA_PASS':'BLOCKED',
  external_verification:'EXTERNAL_VERIFICATION_PENDING',
  pending:['authenticated Production Admin and deployed code','GAS Writer/Research/installed triggers','Xserver delivery of a new QC-passing candidate','separate approval for paid generation'],
  resume:['retain body hash and final QC','reconcile R2 paths versus R6 job/QC without adopting either rejected asset','repair article-specific action/gaze and three-crop plan at stage 07','request approval for one explicitly bounded paid attempt','only after independent QC PASS: sync three new assets, Xserver SHA and Supabase readback','authenticated Preflight; stop before human Publish'],
  mutations:0,paid_calls:0};
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:report.result,body_preserved:report.body_preserved,body_matches_qc_source:report.body_matches_qc_source,preflight_ok:result.ok,blocker:result.blocker?.code}));
