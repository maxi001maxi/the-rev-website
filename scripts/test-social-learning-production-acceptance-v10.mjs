import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  computeLearningActivation,
  buildProductionAcceptanceDecision
} from '../lib/socialLearningAcceptance.mjs';

test('v1.0 migration adds verified output lineage, learning observations and acceptance store',()=>{
  const sql=fs.readFileSync(
    new URL('../supabase/migrations/20261007030253_social_learning_production_acceptance_v10.sql',import.meta.url),
    'utf8'
  );
  assert.match(sql,/reel_evidence_candidate_id/);
  assert.match(sql,/story_evidence_item_id/);
  assert.match(sql,/director_assignment_id/);
  assert.match(sql,/opportunity_id/);
  assert.match(sql,/social_learning_observations/);
  assert.match(sql,/unique\(learning_key,source_post_id\)/);
  assert.match(sql,/social_production_acceptance_runs/);
  assert.match(sql,/READY_FOR_CUTOVER/);
  assert.match(sql,/PUBLISHED_VERIFIED/);
  for(const table of ['social_learning_observations','social_production_acceptance_runs']){
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
});

test('one supporting post never activates a performance learning',()=>{
  const out=computeLearningActivation({
    currentStatus:'CANDIDATE',
    learningType:'PERFORMANCE',
    observations:[{direction:'SUPPORT',confidence:0.9}]
  });
  assert.equal(out.status,'CANDIDATE');
  assert.equal(out.distinct_posts,1);
});

test('two distinct supporting posts can activate a performance learning',()=>{
  const out=computeLearningActivation({
    currentStatus:'CANDIDATE',
    learningType:'PERFORMANCE',
    observations:[
      {direction:'SUPPORT',confidence:0.8},
      {direction:'SUPPORT',confidence:0.7}
    ]
  });
  assert.equal(out.status,'ACTIVE');
  assert.equal(out.support,2);
  assert.equal(out.counter,0);
});

test('counterevidence blocks automatic learning activation',()=>{
  const out=computeLearningActivation({
    currentStatus:'CANDIDATE',
    learningType:'PERFORMANCE',
    observations:[
      {direction:'SUPPORT',confidence:0.9},
      {direction:'SUPPORT',confidence:0.9},
      {direction:'COUNTER',confidence:0.8}
    ]
  });
  assert.equal(out.status,'CANDIDATE');
  assert.equal(out.counter,1);
});

test('non-performance learning is never auto-activated by repeated observations',()=>{
  const out=computeLearningActivation({
    currentStatus:'CANDIDATE',
    learningType:'CREATIVE',
    observations:[
      {direction:'SUPPORT',confidence:0.9},
      {direction:'SUPPORT',confidence:0.9}
    ]
  });
  assert.equal(out.status,'CANDIDATE');
});

test('pre-cutover acceptance fails closed while deployment or task gates are missing',()=>{
  const out=buildProductionAcceptanceDecision({
    acceptanceStage:'PRE_CUTOVER',
    deploymentReady:false,
    bridgeLive:true,
    directorPass:true,
    learningLoopReady:true,
    humanApprovalVerified:true,
    taskPromptReady:false,
    versionMatches:false
  });
  assert.equal(out.status,'BLOCKED');
  assert.ok(out.blockers.includes('DEPLOYMENT_NOT_READY'));
  assert.ok(out.blockers.includes('TASK_PROMPT_NOT_READY'));
  assert.ok(out.blockers.includes('SCHEDULED_TASK_VERSION_MISMATCH'));
});

test('all pre-cutover gates yield READY_FOR_CUTOVER, not automatic production acceptance',()=>{
  const out=buildProductionAcceptanceDecision({
    acceptanceStage:'PRE_CUTOVER',
    deploymentReady:true,
    bridgeLive:true,
    directorPass:true,
    learningLoopReady:true,
    humanApprovalVerified:true,
    taskPromptReady:true,
    versionMatches:true
  });
  assert.equal(out.status,'READY_FOR_CUTOVER');
  assert.equal(out.blockers.length,0);
});

test('post-cutover acceptance requires the first live run to pass',()=>{
  const blocked=buildProductionAcceptanceDecision({
    acceptanceStage:'POST_CUTOVER',
    deploymentReady:true,bridgeLive:true,directorPass:true,learningLoopReady:true,
    humanApprovalVerified:true,taskPromptReady:true,versionMatches:true,firstLiveRunPass:false
  });
  assert.equal(blocked.status,'BLOCKED');
  assert.ok(blocked.blockers.includes('FIRST_LIVE_RUN_NOT_PASS'));

  const accepted=buildProductionAcceptanceDecision({
    acceptanceStage:'POST_CUTOVER',
    deploymentReady:true,bridgeLive:true,directorPass:true,learningLoopReady:true,
    humanApprovalVerified:true,taskPromptReady:true,versionMatches:true,firstLiveRunPass:true
  });
  assert.equal(accepted.status,'ACCEPTED');
});

test('publication linkage is verified-post only and approval-gated',()=>{
  const source=fs.readFileSync(new URL('../lib/socialLearningAcceptance.mjs',import.meta.url),'utf8');
  assert.match(source,/SOCIAL_PUBLISHED_EVIDENCE_REQUIRED/);
  assert.match(source,/SOCIAL_REEL_EVIDENCE_NOT_APPROVED/);
  assert.match(source,/SOCIAL_STORY_EVIDENCE_NOT_APPROVED/);
  assert.match(source,/SOCIAL_THREAD_CANDIDATE_NOT_APPROVED/);
  assert.match(source,/PUBLISHED_VERIFIED/);
});

test('learning loop is idempotent per learning key and verified post',()=>{
  const sql=fs.readFileSync(
    new URL('../supabase/migrations/20261007030253_social_learning_production_acceptance_v10.sql',import.meta.url),
    'utf8'
  );
  const source=fs.readFileSync(new URL('../lib/socialLearningAcceptance.mjs',import.meta.url),'utf8');
  assert.match(sql,/unique\(learning_key,source_post_id\)/);
  assert.match(source,/idempotent:true/);
});

test('Social Director context distinguishes ACTIVE and CANDIDATE learnings',()=>{
  const director=fs.readFileSync(new URL('../lib/socialDirector.mjs',import.meta.url),'utf8');
  assert.match(director,/learning_context/);
  assert.match(director,/status==='ACTIVE'/);
  assert.match(director,/status==='CANDIDATE'/);
  assert.match(director,/CANDIDATE is lower-weight evidence/);
});

test('Bridge exposes production lifecycle, learning loop and acceptance actions',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_reel_evidence_choose',
    'social_story_evidence_approve',
    'social_output_created',
    'social_output_publication_link',
    'social_learning_observe',
    'social_learning_loop_context',
    'social_production_acceptance'
  ])assert.match(bridge,new RegExp(action));
  assert.match(endpoint,/production_acceptance/);
  assert.match(endpoint,/learning_\(observe\|loop_context\)/);
  assert.match(endpoint,/output_\(created\|publication_link\)/);
});
