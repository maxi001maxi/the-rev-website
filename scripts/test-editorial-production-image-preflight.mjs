import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {preflightEditorialImage} from '../lib/editorialProductionImagePreflight.mjs';

const path='editorial/hybrid-image-jobs/personal-gym-first-session-pain-health-history.json';
const job=JSON.parse(fs.readFileSync(path,'utf8'));
const state=JSON.parse(fs.readFileSync('editorial/image-operator-state/personal-gym-first-session-pain-health-history.json','utf8'));
const registry=JSON.parse(fs.readFileSync('editorial/automated-image-sources.json','utf8'));
const report=job=>preflightEditorialImage(job,registry);

test('the actual R3 rejected pose would be blocked BEFORE using the image API',()=>{
 const old={...job,scene_plan:state.last_qa.scene_grounding.plan};
 const observed=report(old);
 assert.equal(observed.pass,false);
 assert.equal(observed.no_api_calls,true);
 assert(observed.errors.includes('RECENT_SCENE_DUPLICATE'));
 assert.deepEqual(observed.duplicate_slugs,['kenshin-ketsuatsu-takame-kinntore-hajimekata']);
 assert.equal(observed.history_unknown,0);
});

test('the R5 unique real room/customer pose does not copy health-check paperwork',()=>{
 const observed=report(job);
 assert.equal(observed.pass,true,JSON.stringify(observed));
 assert.equal(observed.status,'PASS_BEFORE_MODEL');
 assert.equal(observed.no_api_calls,true);
 assert.equal(observed.strict,true);
 assert.equal(observed.history_compared,12);
 assert.equal(observed.history_unknown,0);
 assert.deepEqual(observed.duplicate_slugs,[]);
 assert.equal(job.scene_plan.human_action,'prepare');
 assert.equal(job.scene_plan.composition_type,'medium_side_portrait');
 assert.equal(job.scene_plan.article_intent,'health_before_start');
 assert.match(job.scene_plan.article_specific_directive,/NO paper/);
 assert.equal(job.automation.require_complete_semantic_preflight,true);
 assert.equal(job.asset_version,'reference-v26-grounded-lobbysp-20261015-pain-r5');
 assert.equal(job.max_generation_attempts,1);
 assert.equal(job.gbp_fade_variant,'portrait-safe-mask-v1');
 assert.equal(job.policy.publish_boundary,'REVIEW_AND_PUBLISH');
});

test('no guessing: missing historical fingerprints block before billing',()=>{
 const incomplete={...job,automation:{...job.automation,recent_semantic_articles:job.automation.recent_semantic_articles.map((r,i)=>
   i===0?{...r,scene_fingerprint:null,sceneFingerprint:null}:r)}};
 const result=report(incomplete);
 assert.equal(result.pass,false);
 assert(result.errors.includes('SEMANTIC_HISTORY_INCOMPLETE'));
});

test('approved source hash, 3 variants, 1 customer and no unknown trainer are not optional',()=>{
 const altered={...job,scene_plan:{...job.scene_plan,source_sha256:'f'.repeat(64)}};
 assert(report(altered).errors.includes('PLAN_SOURCE_MISMATCH'));
 const other={...job,generated_customer_count:2};
 assert(report(other).errors.includes('ONE_CUSTOMER_ONLY_POLICY_MISSING'));
 const missing={...job,gbp_image:''};
 assert(report(missing).errors.includes('THREE_FORMATS_NOT_CONFIGURED'));
 assert.equal(job.generated_customer_count,1);
 assert.equal(job.policy.trainer_present_forbidden,true);
 assert.equal(job.policy.unknown_trainer_forbidden,true);
});

test('main automation executes free checks before secrets, dependencies, or image generation',()=>{
 const flow=fs.readFileSync('.github/workflows/auto-editorial-hybrid-images.yml','utf8');
 const pre=flow.indexOf('node scripts/preflight-auto-editorial-image.mjs "$job"');
 const secrets=flow.indexOf('- name: Validate required secrets');
 const deps=flow.indexOf('- name: Install dependencies');
 const generation=flow.indexOf('- name: Generate scenes, render overlay');
 assert(pre>0&&pre<secrets&&secrets<deps&&deps<generation);
 const evidence=flow.indexOf('- name: Preserve rejected actual images');
 const commit=flow.indexOf('- name: Commit operator output to main');
 assert(evidence>generation&&evidence<commit);
 assert(flow.includes('name: editorial-rejected-image-evidence-'));
 assert(flow.includes('status" = "ERROR"'));
 assert(flow.includes('steps.generate.outputs.failed =='));
 assert(flow.includes('if: steps.select.outputs.has_pending == \'true\' && steps.generate.outputs.failed == \'0\''));
});

test('preflight CLI is no-cost and returns evidence for this production job',()=>{
 const cli=JSON.parse(execFileSync(process.execPath,['scripts/preflight-auto-editorial-image.mjs',path],{encoding:'utf8'}).trim());
 assert.equal(cli.no_api_calls,true);
 assert.equal(cli.pass,true);
 assert.equal(cli.history_compared,12);
});
