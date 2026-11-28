import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {v3BriefPreflight} from './preflight-v3-image-brief.mjs';
import {routeBSourceReuse,ROUTE_B_SOURCE} from '../lib/editorialOct18RouteB.mjs';
const job=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/personal-gym-trial-three-checks.json'));
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json'));
const clone=x=>structuredClone(x);
test('owner route B passes free contract while wrong source, training in lobby and extra paid retry fail',()=>{
  assert.equal(v3BriefPreflight(job,registry).pass,true);
  for(const change of [j=>j.scene_plan.location_type='training_area',
    j=>j.max_generation_attempts=2,j=>j.automation.source_repo_path='assets/images/photo-evolgear.jpg',
    j=>j.v3.generation_quality='high']){
    const j=clone(job);change(j);assert.equal(v3BriefPreflight(j,registry).pass,false);
  }
});
test('route B source reuse needs independently observed real room and distinct actual scene',()=>{
 const plan=job.scene_plan,inventory=job.source_scene_inventory;
 const grounding={asset_version:job.asset_version,pass:true,errors:[],inventory,plan,
   asset_hashes:{source:ROUTE_B_SOURCE},sourceRecognition:{complete:true,equipment:clone(inventory.visible_equipment)},
   observation:{complete:true,equipment:clone(inventory.visible_equipment),location_type:'reception',subject_zone:'reception',
     human_action:'observe_facility',equipment_relocated:false,room_geometry_preserved:true,article_scene_match:true,
     scene_fingerprint:plan},recent:job.automation.recent_semantic_articles,
   similarity:{pass:true,unknown_count:0}};
 assert.equal(routeBSourceReuse(job,grounding),true);
 for(const [index,change] of [e=>e.observation.equipment_relocated=true,
   e=>e.observation.equipment.push({object:'training_rack',zone:'reception'}),
   e=>e.sourceRecognition.complete=false,e=>e.asset_hashes.source='wrong',
   e=>e.recent[0].scene_fingerprint=clone(plan),e=>e.recent=[]].entries()){
   const e=clone(grounding);change(e);assert.equal(routeBSourceReuse(job,e),false,`negative case ${index}`);
 }
 assert.equal(routeBSourceReuse({...job,asset_version:'another-version'},grounding),false);
});
