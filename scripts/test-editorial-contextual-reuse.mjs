import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyDistinctContextualFacilitySourceReuse} from '../lib/editorialContextualSourceReuse.mjs';

const canonical=JSON.parse(fs.readFileSync('editorial/hybrid-image-jobs/personal-gym-first-session-pain-health-history.json','utf8'));
const recent=canonical.automation.recent_semantic_articles;
const plan=canonical.scene_plan;
const job={
 ...canonical,
 automation:{
  ...canonical.automation,
  mode:'OFFLINE_RECOVERED_R5_QC_ONLY_NOT_PUBLISH',
  contextual_facility_source_reuse:{
   review_scope:'OFFLINE_R7_ONLY_NO_PUBLICATION',
   reason:'AUTHENTIC_RECEPTION_REQUIRED_DISTINCT_HEALTH_STORY'
  }
 },
 recovery_provenance:{kind:'SOURCE_HASH_VERIFIED_QUARANTINED_R5_DEPTH_FILTER'}
};
const observed={
 ...plan,
 composition_type:'wide_full_body'
};
const grounding={pass:true,errors:[],similarity:{pass:true,unknown_count:0},
 observation:{scene_fingerprint:observed}};
const previousIds=canonical.automation.recent_articles.map(x=>x.driveFileId);
const currentId=canonical.background_source.drive_file_id;
const verify=(candidate=job,g=grounding)=>verifyDistinctContextualFacilitySourceReuse({
 job:candidate,sourceIds:[currentId],recentIds:previousIds,grounding:g
});

test('reuse of one authenticated reception SOURCE is allowed when independent actual SCENE is different',()=>{
 const result=verify();
 assert.equal(result.allowed,true,JSON.stringify(result.errors));
 assert.equal(result.source_repeated,true);
 assert.equal(result.scene_repeated,false);
 assert.equal(result.published,false);
 assert.equal(result.errors.length,0);
 assert.equal(recent[0].scene_fingerprint.article_intent,'facility_selection');
 assert.equal(plan.article_intent,'health_before_start');
 assert.equal(currentId,previousIds[0]);
});

test('same source but identical recent SCENE is rejected',()=>{
 const g={...grounding,observation:{scene_fingerprint:{...recent[0].scene_fingerprint}}};
 const result=verify(job,g);
 assert.equal(result.allowed,false);
 assert(result.errors.includes('OBSERVED_SCENE_CORE_MISMATCH'));
 assert(result.errors.includes('IDENTICAL_RECENT_SCENE'));
});

test('unsupported source, changed SHA, production-mode, model-rejected scene all block reuse',()=>{
 for(const c of [
 {...job,automation:{...job.automation,mode:'unattended-github-actions-v1'}},
 {...job,scene_plan:{...plan,source_sha256:'0'.repeat(64)}},
 {...job,automation:{...job.automation,contextual_facility_source_reuse:null}},
 {...job,policy:{...job.policy,trainer_present_forbidden:false}}
 ])assert.equal(verify(c).allowed,false);
 for(const bad of [
 {...grounding,pass:false},
 {...grounding,similarity:{pass:false,unknown_count:0}},
 {...grounding,similarity:{pass:true,unknown_count:1}},
 {...grounding,errors:['spatial_plausibility']}
 ])assert.equal(verify(job,bad).allowed,false);
 const noRepeat=verifyDistinctContextualFacilitySourceReuse({job,sourceIds:[currentId],
  recentIds:['some-other-source'],grounding});
 assert.equal(noRepeat.allowed,false);
});

test('R7 remains non-generative and cannot publish even if reuse is permitted',()=>{
 const prep=fs.readFileSync('scripts/prepare-editorial-r5-depth-review.mjs','utf8');
 const operator=fs.readFileSync('scripts/auto-editorial-hybrid-image.mjs','utf8');
 assert(prep.includes("review_scope:'OFFLINE_R7_ONLY_NO_PUBLICATION'"));
 assert(prep.includes("paid_image_generation_allowed:false"));
 assert(!canonical.automation.contextual_facility_source_reuse);
 assert(operator.includes("const sourceReuseAccepted=repeatedDueToRelevance||contextualReuse.allowed"));
 assert(operator.includes("recent_similarity_check_pass: !recentRepeat || sourceReuseAccepted"));
 assert(operator.includes("background_reuse_relevance_exception: sourceReuseAccepted"));
 assert(operator.includes("pass: requiredBool(modelQa.pass) && (!recentRepeat || sourceReuseAccepted)"));
 const flow=fs.readFileSync('.github/workflows/editorial-r5-depth-recovery.yml','utf8');
 assert(flow.includes("EDITORIAL_IMAGE_DISABLE_GENERATION: '1'"));
 assert(!flow.includes('Stage READY image assets to Xserver'));
 assert(!flow.includes('git push origin'));
 assert(!flow.includes('git commit -m'));
});
