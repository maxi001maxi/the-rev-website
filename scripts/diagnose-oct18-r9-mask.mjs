// Offline only: replay the retained raw response; never generate or change QA.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {R9_DIR,prepareR9Source,lockR9Response,editR9LockedScene} from '../lib/editorialOct18R9.mjs';
globalThis.fetch=()=>{throw Error('OFFLINE_DIAGNOSTIC_API_FORBIDDEN');};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const job=read(R9_DIR+'/PROPOSED_JOB.json'),dir=R9_DIR+'/PRIVATE_RESULT',raw=fs.readFileSync(dir+'/images/raw.png');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage(),prepared=await prepareR9Source(page,job.automation.source_repo_path,job.v31.locked_edit_plan);
 if(hash(Buffer.from(prepared.sourceDataUrl.split(',')[1],'base64'))!==job.v31.source_plate_sha256)throw Error('REVIEWED_SOURCE_PLATE_CHANGED');
 const checked=await lockR9Response(page,'data:image/png;base64,'+raw.toString('base64'),job.v31.locked_edit_plan,{checkRaw:true});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'r9-raw-replay-'));let calls=0,rejected=false,checkpoint=false;
 try {
  const scene=path.join(temp,'scene.png');
  try {await editR9LockedScene({job:{...job,generated_scene_path:scene},sourcePath:job.automation.source_repo_path,prompt:'Synthetic replay of retained R9; no network',generateResponse:async()=>{calls++;return {id:'SYNTHETIC_OFFLINE_REPLAY',output:[{type:'image_generation_call',result:raw.toString('base64')}]};}});}
  catch(e){if(!String(e.message).includes('R9_RAW_EDIT_ESCAPED_MASK'))throw e;rejected=true;}
  checkpoint=fs.existsSync(scene+'.raw.png')&&hash(fs.readFileSync(scene+'.raw.png'))===hash(raw)&&fs.existsSync(scene+'.raw-mask-check.json')&&!fs.existsSync(scene);
  if(!rejected||!checkpoint||calls!==1)throw Error('RAW_WRAPPER_NEGATIVE_CONTROL_FAILED');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 const report={actual_model_calls:0,synthetic_wrapper_calls:calls,raw_checkpoint_retained:checkpoint,wrapper_stopped_before_composite_and_qc:rejected,raw_sha256:hash(raw),source_plate_sha256:job.v31.source_plate_sha256,...checked.raw_mask_conformance,hard_restore_performed:!!checked.imageDataUrl,original_qa_unchanged:true,next_action:'MASK_CONFORMANCE_AND_SUBJECT_GEOMETRY_REQUIRED_BEFORE_ANY_NEW_SPEND'};
 fs.writeFileSync(dir+'/RAW_MASK_DIAGNOSTIC.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 if(report.pass||report.hard_restore_performed)throw Error('ACTUAL_R9_NEGATIVE_CONTROL_NOT_DETECTED');
}finally{await browser.close();}
