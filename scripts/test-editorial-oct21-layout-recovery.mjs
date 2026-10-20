import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {articleSceneIntent,planGroundedScene} from '../lib/editorialSceneGrounding.mjs';
import {reuseGroundingObservation} from '../lib/editorialGroundingObservationReuse.mjs';
import {createImageApiLedger} from '../lib/editorialImageApiLedger.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep';
const qa=JSON.parse(fs.readFileSync(root+'/image-finish-r5/IMAGE_INDEPENDENT_QC.json'));
const source=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json')).sources.find(s=>s.source_id==='the-rev-evolgear-20260922');
const job={slug:'night-workout-sleep-timing-intensity',asset_version:'reference-v082-evolgear-japanese-night-r5-layout-qc-20261020',execution:JSON.parse(fs.readFileSync(root+'/image-layout-r5/IMAGE_EXECUTION_CONTRACT.json'))};
job.scene_plan=planGroundedScene({title:'夜に筋トレしても眠れる？寝る前の時間と強さを決める目安'},source,qa.scene_grounding.recent);
const hashes={source:source.scene_inventory.source_sha256,scene:'6f3b19d4a15565bce5d5399a6e85cbb0443b410285911d6c2f94188975fb70b7',thumbnail:'new',og:'new',gbp:'new'};
test('actual R5 end-of-session observation matches corrected sleep/recovery plan without changing old verdict',()=>{
 const before=JSON.stringify(qa);assert.equal(qa.pass,false);assert.equal(qa.scene_grounding.pass,false);
 assert.equal(articleSceneIntent({title:'夜に筋トレしても眠れる？寝る前の時間と強さを決める目安'}),'recovery');
 assert.equal(articleSceneIntent({title:'仕事終わりに疲れている日の筋トレ'}),'readiness');
 assert.equal(articleSceneIntent({title:'初回の痛みや体調を始める前に伝える'}),'health_before_start');
 const r=reuseGroundingObservation({job,qa,inventory:source.scene_inventory,hashes});assert(r.pass,JSON.stringify(r.errors));assert.equal(r.reuse.original_overall_pass,false);assert.equal(r.reuse.new_visual_qc_required,true);assert.equal(JSON.stringify(qa),before);
});
test('cached independent observations cannot certify changed raw pixels or relocated equipment',()=>{
 assert.throws(()=>reuseGroundingObservation({job,qa,inventory:source.scene_inventory,hashes:{...hashes,scene:'changed'}}),/PIXEL_DRIFT/);
 const bad=structuredClone(qa);bad.scene_grounding.observation.equipment_relocated=true;
 assert.equal(reuseGroundingObservation({job,qa:bad,inventory:source.scene_inventory,hashes}).pass,false);
});
test('QC-only execution reserves no generation and at most one final QC; prior lifecycle is not reset',async()=>{
 let state=null,writes=0;
 const ledger=createImageApiLedger({job,read:async()=>state?{exists:true,sha:'cas',content:state}:{exists:false},write:async x=>{state=x.content;writes++;return {sha:'cas'};}});
 await assert.rejects(()=>ledger.reserve('generation'),/GENERATION_CALL_LIMIT/);assert.equal(writes,0);
 const n=await ledger.reserve('qc');await ledger.complete(n,{http_status:200,request_id:'synthetic-no-provider'});
 await assert.rejects(()=>ledger.reserve('qc'),/QC_CALL_LIMIT/);assert.equal((await ledger.snapshot()).calls.length,1);
 const altered=structuredClone(job);altered.execution.independent_qc_max_calls=2;
 const changed=createImageApiLedger({job:altered,read:async()=>({exists:true,sha:'cas',content:state}),write:async()=>{throw Error('must not write');}});
 await assert.rejects(()=>changed.reserve('qc'),/CONTRACT_CHANGED/);
});
