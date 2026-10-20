// Reuse canonical compiler and fresh admission, preserve all executed R3 records.
import './prepare-oct21-image-execution.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {finishAdmission,FINISH_VERSION} from '../lib/editorialOwnerFinishEdit.mjs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
const parent='editorial/prepublication/2026-10-21-evening-strength-sleep',root=parent+'/image-finish-r4';
const read=p=>JSON.parse(fs.readFileSync(p));
const c=read(root+'/IMAGE_EXECUTION_CONTRACT.json');
const job=read(parent+'/IMAGE_RECOVERY_JOB_PROPOSAL.json');
const previous=read(parent+'/IMAGE_JOB.json');
if(c.asset_version!=='reference-v082-evolgear-japanese-night-finish-20261020-r4'||c.body_sha256!==job.execution.body_sha256||c.input_sha256!=='a996f1e46d8f1f65abfeb99a4888e36674c15c8d1627450e0d2b1b88dbdd64b4')throw Error('FINISH_CONTRACT_DRIFT');
const previousVersion=job.asset_version;
for(const key of ['generated_scene_path','thumbnail','og_image','gbp_image'])job[key]=job[key].replace(previousVersion,c.asset_version);
job.asset_version=c.asset_version;job.execution=c;job.qa_report_path=root+'/IMAGE_INDEPENDENT_QC.json';
job.v3={background_lock:FINISH_VERSION,openai_edit:{model:c.model,quality:c.quality},owner_finish:{
 input_path:'.operator-finish-input/r3-scene.png',input_sha256:c.input_sha256,source_sha256:c.source_sha256,
 owner_direction_approval_only:true,previous_rejected_version:previous.asset_version,
 edit_scope:['Japanese adult male customer','subtle coherent night atmosphere'],preserve:['composition','watch gesture','clothing','source room structure','equipment positions'],
 pixel_equality_not_claimed:true,independent_structural_qc_required:true}};
const input=finishAdmission(job);
const free=preflightEditorialImage(job,read('editorial/automated-image-sources.json'),{requireStrict:true});
if(!free.pass)throw Error('FINISH_FREE_PREFLIGHT:'+free.errors.join(','));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync(root+'/IMAGE_JOB.json',JSON.stringify(job,null,2)+'\n');
fs.writeFileSync(root+'/IMAGE_ADMISSION_READBACK.json',fs.readFileSync(parent+'/IMAGE_ADMISSION_READBACK.json'));
fs.writeFileSync(root+'/IMAGE_EXECUTION_FREE_PREFLIGHT.json',JSON.stringify({pass:true,input,free,at:new Date().toISOString(),
 preserved_r3_job_sha256:sha(parent+'/IMAGE_JOB.json'),preserved_r3_result_sha256:sha(parent+'/IMAGE_EXECUTION_RESULT.json'),
 body_sha256:c.body_sha256,text_qc_preserved:true,quality_thresholds_unchanged:true,model_calls:0,production_writes:false},null,2)+'\n');
console.log(JSON.stringify({status:'OWNER_FINISH_FREE_PREFLIGHT_PASS',asset_version:job.asset_version,model_calls:0}));
