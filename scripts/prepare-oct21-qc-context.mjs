// One diagnostic independent QC after a reproduced task-context bug; no regeneration.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
import {finishQcGuidance} from '../lib/editorialOwnerFinishEdit.mjs';
const parent='editorial/prepublication/2026-10-21-evening-strength-sleep';
const root=parent+'/image-qc-context-20261021';
const read=p=>JSON.parse(fs.readFileSync(p));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const old=read(parent+'/image-layout-r5b/IMAGE_JOB.json');
const manifest=read(parent+'/OWNER_SELECTED_ASSET_STAGING.json');
for(const a of manifest.assets)if(sha(a.path)!==a.sha256)throw Error('OWNER_SELECTED_BYTES_CHANGED');
const qc=read(parent+'/INDEPENDENT_QC_V082_ADDITIONAL.json');
const body=fs.readFileSync(parent+'/ARTICLE_DRAFT.md','utf8').replace(/^# [^\n]+\n+/,'').trim();
if(createHash('sha256').update(body).digest('hex')!==qc.body_sha256||qc.pass!==true||qc.total!==20)throw Error('TEXT_QC_CHANGED');
const job=structuredClone(old),version='reference-v082-evolgear-r5-qc-context-20261021';
for(const k of ['generated_scene_path','thumbnail','og_image','gbp_image'])job[k]=job[k].replace(old.asset_version,version);
job.asset_version=version;job.qa_report_path=root+'/IMAGE_INDEPENDENT_QC.json';
job.execution={...old.execution,asset_version:version,generation_max_calls:0,independent_qc_max_calls:1,
 owner_approval:{status:'APPROVED',date:'2026-10-21',evidence:'Owner instructed: 今回の記事を完成：画像QCの矛盾を解消し、既存Draftへ本文・画像を正式同期。 Prior instruction waives cost-ceiling checks. This is one corrected-context independent QC, not regeneration or repeated voting.'},
 mode:'QC_ONLY_UNCHANGED_R5_SCENE',automatic_regeneration:false,further_paid_retry_allowed:false,
 qc_context_repair:'NEW_EDIT prompt was incorrectly used for QC-only unchanged RAW; judge current bytes with all original criteria.',
 prior_ledger_paths:[parent+'/image-finish-r5/IMAGE_EXECUTION_RESULT.json',parent+'/image-layout-r5b/IMAGE_EXECUTION_RESULT.json'],
 prior_verdicts_immutable:true,new_image_generation:false};
fs.mkdirSync(root,{recursive:true});fs.mkdirSync('.operator-finish-input',{recursive:true});
fs.copyFileSync(old.generated_scene_path,'.operator-finish-input/r5-scene.png');
job.v3.owner_finish.input_path='.operator-finish-input/r5-scene.png';
fs.copyFileSync(old.generated_scene_path,job.generated_scene_path);
const previousQa=read(old.qa_report_path),guard=previousQa.raw_background_guard;
if(guard?.raw_sha256!==sha(job.generated_scene_path)||guard.input_admission?.source_sha256!==sha(job.automation.source_repo_path)||guard.visual_qc_pass!==false)throw Error('PRESERVED_RAW_GUARD_DRIFT');
fs.writeFileSync(job.generated_scene_path+'.raw-guard.json',JSON.stringify(guard,null,2)+'\n');
const free=preflightEditorialImage(job,read('editorial/automated-image-sources.json'),{requireStrict:true});
if(!free.pass||!finishQcGuidance(job).startsWith('This is independent QC of an UNCHANGED'))throw Error('QC_CONTEXT_FREE_PREFLIGHT_FAILED');
for(const ref of job.quality_references)if(sha(ref.path)!==ref.sha256)throw Error('R7_BYTES_CHANGED');
fs.writeFileSync(root+'/IMAGE_JOB.json',JSON.stringify(job,null,2)+'\n');
fs.mkdirSync(root+'/image-execution-state',{recursive:true});
fs.writeFileSync(root+'/image-execution-state/'+job.slug+'.json',JSON.stringify({slug:job.slug,asset_version:version,job_path:root+'/IMAGE_JOB.json',status:'OVERLAY_RERENDER_REQUESTED',attempts_total:0,scene_sha256:sha(job.generated_scene_path),generation_disabled:true},null,2)+'\n');
fs.writeFileSync(root+'/FREE_PREFLIGHT.json',JSON.stringify({pass:true,free,source_sha256:sha(job.automation.source_repo_path),raw_sha256:sha(job.generated_scene_path),body_sha256:qc.body_sha256,owner_selected_files:manifest.assets,generation_calls_allowed:0,qc_calls_allowed:1,thresholds_changed:false,production_writes:false},null,2)+'\n');
console.log(JSON.stringify({status:'QC_CONTEXT_FREE_PREFLIGHT_PASS',generation_calls:0,qc_max_calls:1,all_historical_verdicts_preserved:true}));
