import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildP2Case,buildP2ComparisonManifest,assessP2PairedResults,validateP2Cohort,P2_AXES} from '../lib/editorialImagePhase2.mjs';

const cohort=JSON.parse(fs.readFileSync('editorial/experiments/image-quality-p2/cohort.json','utf8'));
const run=args=>JSON.parse(execFileSync(process.execPath,['scripts/prepare-editorial-image-p2.mjs',...args],{encoding:'utf8',maxBuffer:10*1024*1024}));
const manifest=run([]);

test('five approved real articles are locked, separate topics, and baseline assets verified',()=>{
  assert.equal(validateP2Cohort(cohort),true);
  assert.equal(cohort.cases.length,5);
  assert.equal(manifest.subject_count,5);
  assert.equal(manifest.mode,'OFFLINE_ONLY');
  assert.equal(manifest.image_generation_status,'NOT_GENERATED');
  assert.equal(manifest.adoption_status,'NOT_EVALUATED');
  assert.equal(manifest.auto_publish,false);
  assert.equal(new Set(manifest.cases.map(c=>c.slug)).size,5);
  assert.deepEqual(manifest.cases.map(c=>c.slug),cohort.cases.map(c=>c.slug));
});

test('baseline A has actual approved image and checked source provenance, B is never faked as generated',()=>{
  for(const c of manifest.cases){
    assert.equal(c.original.verified_independent_qa_pass,true);
    assert.match(c.original.thumbnail_sha256,/^[0-9a-f]{64}$/);
    assert.match(c.comparison.source_sha256,/^[0-9a-f]{64}$/);
    assert.equal(c.comparison.generation_status,'NOT_GENERATED');
    assert.equal(c.comparison.independent_visual_qc_status,'NOT_RUN');
    assert.equal(c.comparison.publication_allowed,false);
    assert.equal(c.comparison.image_headline_short,JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/'+c.slug+'.json')).image_headline_short);
    assert.notDeepEqual(c.original.fingerprint,c.comparison.target_fingerprint);
    assert.notEqual(c.comparison.target_fingerprint.location_type,'non_existing_area');
    assert.equal(c.comparison.full_grounded_scene_plan.source_sha256,c.comparison.source_sha256);
  }
});

test('comparing five B images before B generation and QC cannot reach a decision',()=>{
  const status=assessP2PairedResults(manifest);
  assert.equal(status.status,'NOT_EVALUABLE');
  assert.equal(status.adopt,false);
  assert.equal(status.failures.length,5);
  assert(status.failures.every(f=>f.includes('REVIEW_MISSING')));
  assert.equal(status.comparisons.length,0);
});

test('a five-case fake high rating cannot override absence of real visual QC',()=>{
  const scores=Object.fromEntries(P2_AXES.map(axis=>[axis,5]));
  const submissions=manifest.cases.map(c=>({
    case_id:c.case_id,
    ratings:{baseline:Object.fromEntries(P2_AXES.map(axis=>[axis,2])),improved:scores},
    hard_gates:{source_structure:true,allowed_action:true,single_customer_no_trainer:true,realism_lighting:true}
  }));
  const status=assessP2PairedResults(manifest,submissions);
  assert.equal(status.status,'NOT_EVALUABLE');
  assert.equal(status.adopt,false);
  assert(status.failures.every(f=>f.includes('IMPROVED_IMAGE_QC_NOT_VERIFIED')));
});

test('no human ratings alone may promote to main or publish even after a simulated experiment completion',()=>{
  const ready=structuredClone(manifest);
  ready.cases.forEach(c=>{c.comparison.generation_status='QC_PASS';c.comparison.independent_visual_qc_status='PASS';});
  const low=Object.fromEntries(P2_AXES.map(axis=>[axis,2]));
  const high=Object.fromEntries(P2_AXES.map(axis=>[axis,5]));
  const submissions=ready.cases.map(c=>({
    case_id:c.case_id,
    ratings:{baseline:low,improved:high},
    hard_gates:{source_structure:true,allowed_action:true,single_customer_no_trainer:true,realism_lighting:true}
  }));
  const report=assessP2PairedResults(ready,submissions);
  assert.equal(report.status,'EXPERIMENT_REVIEW_COMPLETE');
  assert.equal(report.recommendation,'ELIGIBLE_FOR_OWNER_REVIEW');
  assert.equal(report.improved_cases,5);
  assert.equal(report.adopt,false);
  assert.equal(report.requires_owner_approval,true);
  submissions[0].hard_gates.source_structure=false;
  assert.equal(assessP2PairedResults(ready,submissions).status,'NOT_EVALUABLE');
});

test('baseline tampering and QA bypass are rejected',()=>{
  const job=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/'+cohort.cases[0].slug+'.json'));
  const qa=JSON.parse(fs.readFileSync(job.qa_report_path));
  const source=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json')).sources.find(s=>s.source_id===job.automation.selected_source_id);
  const hashes={source:source.scene_inventory.source_sha256,thumbnail:'a'.repeat(64)};
  const params={configuration:cohort.cases[0],job,qa,source,baselineAssetHashes:hashes};
  assert.throws(()=>buildP2Case({...params,job:{...job,asset_version:'fake'}}),/VERSION_CHANGED/);
  assert.throws(()=>buildP2Case({...params,qa:{...qa,pass:false}}),/INDEPENDENT_QC_NOT_PASS/);
  assert.throws(()=>buildP2Case({...params,source:{...source,drive_file_id:'fabricated'}}),/DRIVE_PROVENANCE_DRIFT/);
  assert.throws(()=>buildP2Case({...params,source:{...source,scene_inventory:{...source.scene_inventory,source_sha256:'bad'}}}),/SOURCE_HASH_DRIFT/);
  assert.throws(()=>buildP2Case({...params,configuration:{...cohort.cases[0],target_fingerprint:{scene_type:'exercise',human_action:'strength_exercise',composition_type:'wide_full_body',visual_role:'training_execution'}}}),/VARIATION_NOT_ALLOWED/);
});

test('five-case manifest is read-only and score sheets remain blank',()=>{
  const before=fs.readFileSync('editorial/experiments/image-quality-p2/cohort.json','utf8');
  const template=run(['--review-template']);
  assert.equal(template.case_reviews.length,5);
  assert(template.case_reviews.every(x=>x.blind_pair_ready===false&&x.anonymous_slot_1===null&&x.anonymous_slot_2===null));
  assert.equal(template.case_reviews[0].ratings.baseline.article_meaning,null);
  assert.equal(fs.readFileSync('editorial/experiments/image-quality-p2/cohort.json','utf8'),before);
});

test('cohort cannot silently expand or deduplicate',()=>{
  assert.throws(()=>validateP2Cohort({...cohort,cases:cohort.cases.slice(1)}),/EXACTLY_FIVE/);
  assert.throws(()=>validateP2Cohort({...cohort,cases:[...cohort.cases.slice(0,4),cohort.cases[0]]}),/DUPLICATE/);
});
