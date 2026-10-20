import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep/';
const actual=JSON.parse(fs.readFileSync(root+'IMAGE_JOB.json'));
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json'));
const opts={requireStrict:true,sourceExists:()=>true,hashFile:()=>actual.scene_plan.source_sha256};
test('actual Oct21 execution reproduces stale rejected-R2 four-article history before any provider call',()=>{
 const j=structuredClone(actual);j.automation.require_consistent_recent_history=true;
 assert.equal(j.automation.recent_articles[0].assetVersion,'reference-v26-grounded-evolgear-20261018-contract-r2');
 assert(!j.automation.recent_semantic_articles.some(x=>x.assetVersion==='reference-v26-grounded-evolgear-20261018-contract-r2'));
 const r=preflightEditorialImage(j,registry,opts);assert.equal(r.pass,false);assert(r.errors.includes('RECENT_HISTORY_SNAPSHOT_MISMATCH'));assert.equal(r.no_api_calls,true);
});
test('same verified history snapshot passes without changing source bytes, scene, rejection evidence or QC',()=>{
 const j=structuredClone(actual);j.automation.require_consistent_recent_history=true;
 j.automation.recent_articles=structuredClone(j.automation.recent_semantic_articles.slice(0,4));
 const r=preflightEditorialImage(j,registry,opts);assert(r.pass,JSON.stringify(r));assert.equal(r.history_unknown,0);
 assert.equal(j.scene_plan.source_sha256,actual.scene_plan.source_sha256);
 assert.equal(JSON.parse(fs.readFileSync(root+'IMAGE_EXECUTION_RESULT.json')).image_qc_pass,false);
 const stale=structuredClone(j);stale.automation.recent_articles[0].assetVersion='wrong-version';
 assert(preflightEditorialImage(stale,registry,opts).errors.includes('RECENT_HISTORY_SNAPSHOT_MISMATCH'));
});
