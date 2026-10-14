import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  IMAGE_VARIATION_VERSION,imageVariationMode,auditEditorialCopy,
  diagnoseSceneRepetition,proposeSafeSceneVariations,buildImageVariationShadowReport
} from '../lib/editorialImageVariationV1.mjs';
import {planGroundedScene,FINGERPRINT_FIELDS} from '../lib/editorialSceneGrounding.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('../editorial/automated-image-sources.json',import.meta.url),'utf8'));
const source=id=>registry.sources.find(x=>x.source_id===id);
const gym=source('the-rev-evolgear-20260922');
const lobby=source('the-rev-lobby-sp-20260927');
const baseArticle={title:'初めてのパーソナルジムで体調や痛みはどこまで話す？'};
const canonical=planGroundedScene(baseArticle,gym);
const fp=plan=>Object.fromEntries(FINGERPRINT_FIELDS.map(k=>[k,plan[k]]));
const row=(slug,plan)=>({slug,scene_fingerprint:fp(plan)});

test('feature flag is strictly opt-in SHADOW; unknown and ENFORCE are OFF',()=>{
  assert.equal(imageVariationMode(''),'OFF');
  assert.equal(imageVariationMode('off'),'OFF');
  assert.equal(imageVariationMode('ENFORCE'),'OFF');
  assert.equal(imageVariationMode('shadow'),'SHADOW');
});

test('canonical image generation scene remains unmodified and is the baseline',()=>{
  const before=JSON.stringify(canonical);
  const report=buildImageVariationShadowReport({article:baseArticle,source:gym,canonicalPlan:canonical,recent:[],imageCopy:'痛みも体調も、\n伝えていい。'});
  assert.equal(JSON.stringify(canonical),before);
  assert.equal(report.mode,'SHADOW');
  assert.equal(report.production_scene_unchanged,true);
  assert.equal(report.changes_production_scene,false);
  assert.deepEqual(report.baseline_scene_fingerprint,fp(canonical));
  assert.equal(report.version,IMAGE_VARIATION_VERSION);
  assert.equal(report.readiness,'RESEARCH_ONLY_NOT_PUBLISH_GATE');
  assert.equal(report.copy_audit.warnings.length,0);
});

test('repeated action, composition, role across recent six is visible with no fake score',()=>{
  const report=diagnoseSceneRepetition(canonical,[row('1',canonical),row('2',canonical),row('3',canonical)]);
  assert(report.flags.includes('ACTION_REPEAT_3_OF_RECENT_6'));
  assert(report.flags.includes('COMPOSITION_REPEAT_3_OF_RECENT_6'));
  assert(report.flags.includes('VISUAL_ROLE_REPEAT_3_OF_RECENT_6'));
  assert(report.flags.includes('CANONICAL_SEMANTIC_SIMILARITY_BLOCK'));
  assert(!('score' in report));
});

test('identical versions of the same slug are counted once',()=>{
  const report=diagnoseSceneRepetition(canonical,[row('duplicate',canonical),row('duplicate',canonical)]);
  assert.equal(report.observed,1);
  assert.equal(report.repeated.human_action,1);
});

test('incomplete history is explicitly uncertain, not imagined diverse',()=>{
  const report=diagnoseSceneRepetition(canonical,[{slug:'missing-fingerprint'}]);
  assert.equal(report.known,0);
  assert.equal(report.unknown,1);
  assert(report.flags.includes('HISTORY_FINGERPRINT_INCOMPLETE'));
  assert.equal(proposeSafeSceneVariations({article:baseArticle,source:gym,canonicalPlan:canonical,recent:[{slug:'missing-fingerprint'}]}).every(c=>c.eligible_for_offline_test===false),true);
});

test('scene suggestions stay within the verified source zones/actions/ontology',()=>{
  const variants=proposeSafeSceneVariations({article:baseArticle,source:gym,canonicalPlan:canonical,recent:[]});
  assert(variants.length>=2);
  for(const v of variants){
    assert(gym.scene_inventory.allowed_generated_actions.includes(v.fingerprint.human_action));
    assert.equal(v.fingerprint.location_type,gym.scene_inventory.primary_location);
    assert.equal(v.fingerprint.article_intent,canonical.article_intent);
    assert.equal(v.fingerprint.visual_role,'checking_readiness');
    assert.equal(v.history_coverage_complete,true);
    assert.equal(v.eligible_for_offline_test,true);
  }
});

test('no source, wrong inventory, wrong intent and relocated source fail closed',()=>{
  assert.throws(()=>proposeSafeSceneVariations({article:baseArticle,canonicalPlan:canonical}),/verified_scene_inventory/);
  assert.throws(()=>proposeSafeSceneVariations({article:{title:'ボクシングを始める'},source:gym,canonicalPlan:canonical}),/scene_article_intent_mismatch/);
  assert.throws(()=>proposeSafeSceneVariations({article:baseArticle,source:lobby,canonicalPlan:canonical}),/source_or_location_mismatch/);
});

test('special product explainer gets only device-grounded alternatives',()=>{
  const article={title:'DENBA Healthの機器とマットの役割とは？'};
  const denba=source('the-rev-denba-20260924');
  const plan=planGroundedScene(article,denba);
  const variants=proposeSafeSceneVariations({article,source:denba,canonicalPlan:plan,recent:[]});
  assert(variants.length>=1);
  assert(variants.every(v=>v.fingerprint.human_action==='observing_real_equipment'));
  assert(variants.every(v=>v.fingerprint.visual_role==='component_relationship'));
});

test('copy audit catches lone Japanese modifier and overlong line without changing copy',()=>{
  const copy='小さな\n不安も、';
  assert(auditEditorialCopy(copy).warnings.includes('COPY_MODIFIER_ORPHAN'));
  assert(auditEditorialCopy('12345678901234567').warnings.includes('COPY_LONG_LINE'));
  assert(auditEditorialCopy('A\nB\nC').warnings.includes('COPY_TOO_MANY_LINES'));
  assert.equal(copy,'小さな\n不安も、');
});

test('safe baseline plan is not converted into publish/visual QC authority',()=>{
  const report=buildImageVariationShadowReport({article:baseArticle,source:gym,canonicalPlan:canonical,recent:[],imageCopy:'伝えていい。'});
  assert(!('pass' in report));
  assert(!('human_quality_score' in report));
  assert(report.offline_candidate_fingerprints.every(x=>x.caution.includes('SHADOW')));
});

test('read-only offline inspector on current canonical job has no publish decision',()=>{
  const path='editorial/hybrid-image-jobs/personal-gym-first-session-pain-health-history.json';
  const before=fs.readFileSync(path,'utf8');
  const output=execFileSync(process.execPath,['scripts/inspect-image-variation-v1.mjs',path],{encoding:'utf8'});
  const report=JSON.parse(output);
  assert.equal(report.warning,'OFFLINE_SHADOW_ONLY_NO_VISUAL_QC_OR_READY_STATUS');
  assert.equal(report.slug,'personal-gym-first-session-pain-health-history');
  assert.equal(report.report.mode,'SHADOW');
  assert.equal(report.report.changes_production_scene,false);
  assert(report.report.repetitions.observed>=0);
  assert.equal(fs.readFileSync(path,'utf8'),before);
});
