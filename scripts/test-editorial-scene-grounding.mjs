import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {planGroundedScene,evaluateSceneGrounding,semanticSimilarity,sceneGroundingPass} from '../lib/editorialSceneGrounding.mjs';
import {hybridQaReady} from '../lib/editorialHybridImageFormat.mjs';
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json'));
const source=id=>registry.sources.find(s=>s.source_id===id);
const lobby=source('the-rev-lobby-sp-20260927'),training=source('the-rev-evolgear-20260922'),denba=source('the-rev-denba-20260924');
const article={title:'新大宮で初心者がジムを選ぶなら｜24時間ジム・パーソナルジム・ボクシングの違い'};
const plan=planGroundedScene(article,lobby);
const valid={complete:true,equipment:[{object:'training_rack',zone:'rear_training_area'}],location_type:plan.location_type,subject_zone:plan.subject_zone,human_action:plan.human_action,equipment_relocated:false,room_geometry_preserved:true,article_scene_match:true,scene_fingerprint:plan};
const evaluate=observation=>evaluateSceneGrounding({inventory:lobby.scene_inventory,plan,sourceRecognition:{complete:true,equipment:valid.equipment},observation});
test('actual r3 source/job fixture: foreground invented rack fails despite old PASS flags',()=>{
  const old=JSON.parse(fs.readFileSync('editorial/fixtures/scene-grounding-r3-rejection.json'));
  assert.equal(old.original_qa.pass,true);
  const r=evaluate(old.observation);assert.equal(r.pass,false);
  assert(r.errors.includes('generated_unsupported_equipment:training_rack@reception'));
  const qa={...old.original_qa,scene_grounding_version:r.version,scene_grounding:r};
  assert.equal(sceneGroundingPass(qa),false);
  assert.equal(hybridQaReady({image_render_version:'rev-column-reference-v2.3-hybrid',image_strategy:'reference-v2-gpt-image-hybrid-drive-source',image_asset_version:qa.asset_version},qa),false);
});
test('lobby plus background rack left in place, no invented foreground equipment can pass',()=>assert.equal(evaluate(valid).pass,true));
test('real training source plus visible rack can pass',()=>{
  const p=planGroundedScene(article,training);
  const equipment=[{object:'training_rack',zone:'training_area'}];
  const r=evaluateSceneGrounding({inventory:training.scene_inventory,plan:p,sourceRecognition:{complete:true,equipment},observation:{...valid,equipment,location_type:p.location_type,subject_zone:p.subject_zone,human_action:p.human_action,scene_fingerprint:p}});
  assert.equal(r.pass,true);
});
test('different background file same scene/action/composition/role is detected',()=>{
  const r=semanticSimilarity(plan,[{slug:'different-file',driveFileId:'other',scene_fingerprint:plan}]);
  assert.equal(r.pass,false);assert.equal(r.matches[0].hard_exclusion,true);
});
test('relevant same location/action remains available when role/composition differs',()=>{
  const recent=[{slug:'prior',scene_fingerprint:{...plan,visual_role:'first_visit_reassurance',composition_type:'medium_three_quarter_portrait'}}];
  assert.equal(semanticSimilarity(plan,recent).pass,true);
  assert.equal(planGroundedScene(article,lobby,recent).location_type,'reception');
});
test('missing recognition, missing equipment arrays, relocated equipment and action mismatch fail closed',()=>{
  for(const change of [{complete:false},{equipment:null},{equipment_relocated:true},{human_action:'rack_adjustment'},{subject_zone:'training_area'},{room_geometry_preserved:false}]) assert.equal(evaluate({...valid,...change}).pass,false);
});
test('registry equipment grounding is bound to actual source bytes for every source',()=>{
  for(const s of registry.sources)assert.equal(s.scene_inventory.source_sha256,createHash('sha256').update(fs.readFileSync(s.repo_path)).digest('hex'));
});
test('unsupported scene/source intent cannot be chosen to escape recent exclusions',()=>assert.throws(()=>planGroundedScene(article,source('the-rev-denba-20260924')),/source_article_intent_mismatch/));
test('many versions of one article occupy only one semantic slot',()=>{
  const r=semanticSimilarity(plan,Array.from({length:20},()=>({slug:'one',scene_fingerprint:{...plan,article_intent:'health_before_start'}})));
  assert.equal(r.compared,1);assert.equal(r.pass,true);
});

test('DENBA component explainer uses real-device equipment orientation, not generic recovery rest',()=>{
  const p=planGroundedScene({title:'DENBA Healthの機器とマット、それぞれ何をするもの？',primary_query:'DENBA Health 機器 マット'},denba);
  assert.equal(p.article_intent,'equipment_explanation');
  assert.equal(p.scene_type,'equipment_orientation');
  assert.equal(p.human_action,'observing_real_equipment');
  assert.deepEqual(p.required_equipment,['denba_device']);
});

test('required-equipment relevance reuse evidence is explicit and cannot be generic recovery',()=>{
  const p=planGroundedScene({title:'DENBA Healthの機器とマット、それぞれ何をするもの？',primary_query:'DENBA Health 機器 マット'},denba);
  assert.deepEqual(p.required_equipment,['denba_device']);
  assert.notEqual(p.article_intent,'recovery');
});
