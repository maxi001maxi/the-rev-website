#!/usr/bin/env node
/**
 * P2 offline dry-run. Checks approved baseline and planned isolated B jobs
 * BEFORE any billable image generation. Does not contact OpenAI/GitHub or
 * change a production job, image, QA record, or website.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const selection=process.argv[2]||'all';
if(process.argv.length>3||!['all','p2-01','p2-02','p2-03','p2-04','p2-05'].includes(selection))
  throw new Error('Usage: node scripts/preflight-editorial-image-p2.mjs [all|p2-01..p2-05]');
const toPath=rel=>path.resolve(ROOT,rel);
const getJson=rel=>JSON.parse(fs.readFileSync(toPath(rel),'utf8'));
const hash=rel=>createHash('sha256').update(fs.readFileSync(toPath(rel))).digest('hex');
const cohort=getJson('editorial/experiments/image-quality-p2/cohort.json');
const manifest=JSON.parse(execFileSync(process.execPath,['scripts/prepare-editorial-image-p2.mjs'],{cwd:ROOT,encoding:'utf8',maxBuffer:10*1024*1024}));
if(cohort.mode!=='OFFLINE_ONLY'||manifest.mode!=='OFFLINE_ONLY'||manifest.cases?.length!==5)
  throw new Error('P2_MUST_BE_FIVE_ARTICLE_OFFLINE_COHORT');
const cases=cohort.cases.filter(c=>selection==='all'||c.case_id===selection);
const results=[];
let failCount=0;
for(const c of cases){
  const row={case_id:c.case_id,slug:c.slug,preflight:'BLOCKED',
    baseline_qa_pass:false,baseline_image_verified:false,source_sha256_verified:false,
    candidate_isolated:false,missing_recent_images:[],recent_fingerprints_missing:0,
    questions:['Provider API credits cannot be checked by local preflight']};
  let createdPath=null;
  try{
    const a=getJson('editorial/hybrid-image-jobs/'+c.slug+'.json');
    const qa=getJson(a.qa_report_path);
    const plan=manifest.cases.find(x=>x.case_id===c.case_id);
    if(!plan||a.asset_version!==c.baseline_asset_version||plan.original.asset_version!==a.asset_version)
      throw new Error('P2_APPROVED_ASSET_DRIFT');
    if(qa.pass!==true||qa.manual_visual_rejection===true||qa.scene_grounding?.pass!==true)
      throw new Error('P2_BASELINE_INDEPENDENT_QC_NOT_PASS');
    row.baseline_qa_pass=true;
    if(hash(a.thumbnail)!==plan.original.thumbnail_sha256)
      throw new Error('P2_BASELINE_IMAGE_BYTES_DRIFT');
    row.baseline_image_verified=true;
    const source=a.automation?.source_repo_path;
    if(!source||hash(source)!==a.scene_plan?.source_sha256||hash(source)!==plan.comparison.source_sha256)
      throw new Error('P2_REAL_SOURCE_BYTES_DRIFT');
    row.source_sha256_verified=true;
    const history=a.automation?.recent_semantic_articles||[];
    row.recent_fingerprints_missing=history.filter(x=>!x.scene_fingerprint&&!x.sceneFingerprint).length;
    row.missing_recent_images=history.filter(x=>!x.thumbnail||!fs.existsSync(toPath(x.thumbnail))).map(x=>x.slug);
    if(row.missing_recent_images.length)throw new Error('P2_SEMANTIC_HISTORY_IMAGES_MISSING');
    for(const ref of a.style_references||[])
      if(!fs.existsSync(toPath(ref)))throw new Error('P2_STYLE_REFERENCE_MISSING');
    createdPath=execFileSync(process.execPath,['scripts/materialize-editorial-image-p2-job.mjs',c.case_id],{
      cwd:ROOT,encoding:'utf8',maxBuffer:10*1024*1024
    }).trim();
    if(!createdPath.startsWith('editorial/experiments/image-quality-p2/offline-output/jobs/'))
      throw new Error('P2_UNSAFE_JOB_LOCATION');
    const b=getJson(createdPath);
    if(b.slug===a.slug||b.asset_version===a.asset_version||b.automation?.mode!=='OFFLINE_P2_DO_NOT_PUBLISH'
      ||b.max_generation_attempts!==1||b.policy?.publish_boundary!=='REVIEW_AND_PUBLISH'
      ||b.image_headline_short!==a.image_headline_short||b.customer_presentation!==a.customer_presentation
      ||b.automation?.source_repo_path!==a.automation?.source_repo_path
      ||b.scene_plan?.source_sha256!==a.scene_plan?.source_sha256)
      throw new Error('P2_OFFLINE_B_JOB_ISOLATION_FAIL');
    row.candidate_isolated=true;
    row.preflight='PASS';
    row.estimated_image_scene_attempts=1;
  }catch(error){
    row.reason=String(error?.message||error);
    failCount++;
  }finally{
    if(createdPath&&fs.existsSync(toPath(createdPath)))fs.unlinkSync(toPath(createdPath));
  }
  results.push(row);
}
const report={
  experiment_id:cohort.experiment_id,mode:'OFFLINE_PREFLIGHT',
  case_count:results.length,preserves_production:true,
  all_pass:failCount===0,preflight_failures:failCount,
  no_api_calls:true,provider_credits_verified:false,
  model_qc_status:'NOT_RUN',image_generation_status:'NOT_RUN',
  historical_fingerprints_require_real_image_review:true,
  results
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(failCount)process.exitCode=1;
