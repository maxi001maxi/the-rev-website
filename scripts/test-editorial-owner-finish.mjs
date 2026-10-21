import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {finishAdmission,finishVisualPass,FINISH_VERSION,FINISH_QC_GUIDANCE,finishQcGuidance,finishInputLabel} from '../lib/editorialOwnerFinishEdit.mjs';
const c=JSON.parse(fs.readFileSync('editorial/prepublication/2026-10-21-evening-strength-sleep/image-finish-r4/IMAGE_EXECUTION_CONTRACT.json'));
const job={asset_version:c.asset_version,execution:c,max_generation_attempts:1,layout_variant:'human-first-v1',automation:{source_repo_path:'assets/images/photo-evolgear.jpg'},v3:{background_lock:FINISH_VERSION,openai_edit:{model:c.model,quality:c.quality},owner_finish:{input_path:'.operator-finish-input/r3-scene.png',input_sha256:c.input_sha256,source_sha256:c.source_sha256,owner_direction_approval_only:true}}};
const hash=p=>p.endsWith('r3-scene.png')?c.input_sha256:c.source_sha256;
test('actual QC-only context never asks for a new edit and retains all finishing requirements',()=>{
 const j=JSON.parse(fs.readFileSync('editorial/prepublication/2026-10-21-evening-strength-sleep/image-layout-r5b/IMAGE_JOB.json'));
 const text=finishQcGuidance(j);
 assert(!text.includes('This is a NEW'));
 assert(text.includes('sameness to the labeled current RAW is neither a defect nor a PASS'));
 assert(text.includes('if preservation cannot be verified, fail that criterion'));
 assert(text.includes(FINISH_QC_GUIDANCE.slice(FINISH_QC_GUIDANCE.indexOf(' Owner approved'))));
 assert(finishInputLabel(j).startsWith('CURRENT UNCHANGED RAW MASTER'));
 assert.equal(finishQcGuidance(job),FINISH_QC_GUIDANCE);
 assert(finishInputLabel(job).startsWith('PREVIOUS REJECTED EDIT INPUT'));
 const bad=structuredClone(j);bad.execution.mode='RETRY_UNTIL_PASS';assert.throws(()=>finishQcGuidance(bad),/CONTEXT_INVALID/);
 const r=fs.readFileSync('scripts/auto-editorial-hybrid-image.mjs','utf8');
 assert(r.includes('finishQcGuidance(job)'));assert(r.includes('text:finishInputLabel(job)'));
});
test('new edit requires exact old master/source and scoped approval; never declares QC PASS',()=>{
 const a=finishAdmission(job,{hash});assert(a.pass);assert.equal(a.final_visual_qc_pass,false);
 assert.throws(()=>finishAdmission(job,{hash:()=> 'drift'}),/INPUT_DRIFT/);
 for(const alter of [j=>j.execution.owner_approval.status='PENDING',j=>j.execution.production_authorization.publish=true,j=>j.max_generation_attempts=2,j=>j.v3.owner_finish.input_path='assets/adopt-rejected.png']){
  const j=structuredClone(job);alter(j);assert.throws(()=>finishAdmission(j,{hash}),/SCOPE/);
 }
});
test('every missing or false independent finishing criterion blocks adoption',()=>{
 const fields=['japanese_customer_brief_matches','night_atmosphere_visible','approved_composition_preserved','room_geometry_preserved','equipment_layout_preserved','hands_watch_gaze_natural','no_cutout_or_hard_restore','all_three_formats_readable'];
 const q=Object.fromEntries(fields.map(k=>[k,true]));assert(finishVisualPass(q));assert(!finishVisualPass(null));
 for(const f of fields){assert(!finishVisualPass({...q,[f]:false}));const x={...q};delete x[f];assert(!finishVisualPass(x));}
});
test('diagnosed depth correction is limited to exact R4 input; R4 ledger is not reset and arbitrary next versions fail',()=>{
 const d=JSON.parse(fs.readFileSync('editorial/prepublication/2026-10-21-evening-strength-sleep/image-finish-r5/IMAGE_EXECUTION_CONTRACT.json'));
 const j=structuredClone(job);j.asset_version=d.asset_version;j.execution=d;j.v3.owner_finish.input_path='.operator-finish-input/r4-scene.png';j.v3.owner_finish.input_sha256=d.input_sha256;
 const h=p=>p.endsWith('r4-scene.png')?d.input_sha256:d.source_sha256;
 assert(finishAdmission(j,{hash:h}).pass);assert.equal(d.prior_calls_preserved.find(x=>x.version==='r4').qc,2);
 const bad=structuredClone(j);bad.asset_version=bad.asset_version.replace('-r5','-r6');assert.throws(()=>finishAdmission(bad,{hash:h}),/SCOPE/);
});
test('legacy exact pixel gate and numeric quality thresholds remain; actual R3 rejection and calls preserved',()=>{
 const r=fs.readFileSync('scripts/auto-editorial-hybrid-image.mjs','utf8');
 for(const s of ['qa.human_visual_attention_share || 0) >= 58','qa.background_soft_blur_pass === true','qa[k]>=9',"{mode:'exact-raw-pixels',pass:qa.raw_background_guard.pass===true}"])assert(r.includes(s),s);
 const old=JSON.parse(fs.readFileSync('editorial/prepublication/2026-10-21-evening-strength-sleep/IMAGE_EXECUTION_RESULT.json'));assert.equal(old.image_qc_pass,false);assert.equal(old.generation_calls,1);assert.equal(old.qc_calls,2);
});
