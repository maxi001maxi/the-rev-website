import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {compareUnchangedPhotoQc} from '../lib/editorialVisualQcConsistency.mjs';
const root='editorial/prepublication/2026-10-21-evening-strength-sleep';
const previous=JSON.parse(fs.readFileSync(root+'/image-finish-r5/IMAGE_INDEPENDENT_QC.json'));
const current=JSON.parse(fs.readFileSync(root+'/image-layout-r5b/IMAGE_INDEPENDENT_QC.json'));
test('actual unchanged R5 RAW has conflicting structure/night/R7 opinions; neither failed verdict becomes PASS',()=>{
 const a=JSON.stringify(previous),b=JSON.stringify(current),r=compareUnchangedPhotoQc(previous,current);
 assert(r.comparable);assert.equal(r.status,'INDEPENDENT_QC_CONFLICT_REVIEW_REQUIRED');assert.equal(r.quality_pass,false);assert.equal(r.paid_retry_allowed,false);
 assert(r.conflicts.some(x=>x.field==='night_atmosphere_visible'));assert(r.conflicts.some(x=>x.field==='room_geometry_preserved'));assert(r.conflicts.some(x=>x.field==='r7_photographic_comparison'));
 assert.equal(previous.pass,false);assert.equal(current.pass,false);assert.equal(JSON.stringify(previous),a);assert.equal(JSON.stringify(current),b);
});
test('different source or RAW cannot be called contradictory evaluation of the same image',()=>{
 for(const field of ['source','scene']){const j=structuredClone(current);j.scene_grounding.asset_hashes[field]='different';const r=compareUnchangedPhotoQc(previous,j);assert.equal(r.comparable,false);assert.equal(r.conflicts.length,0);}
});
