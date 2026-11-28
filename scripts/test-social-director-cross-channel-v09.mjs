import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  normalizeDirectorAssignment,
  validateDirectorAssignmentSet
} from '../lib/socialDirector.mjs';
import {normalizeThreadCandidate} from '../lib/socialThreadModel.mjs';

function opportunity(overrides={}){
  return {
    id:'11111111-1111-4111-8111-111111111111',
    opportunity_no:1,
    title:'Trainer judgment',
    possible_channels:['REEL','STORIES','THREADS'],
    evidence_strength:'GROUNDED',
    qc_decision:'READY',
    confidence:'MEDIUM',
    expected_behavior:'Profile interest',
    evidence:[
      {role:'PRIMARY',evidence:{evidence_key:'fp:reps'}},
      {role:'CORROBORATING',evidence:{evidence_key:'fact:service'}},
      {role:'COUNTEREVIDENCE',evidence:{evidence_key:'constraint:no-human'}}
    ],
    ...overrides
  };
}

function assignment(op,overrides={}){
  const map=new Map([[op.id,op]]);
  return normalizeDirectorAssignment({
    opportunity_id:op.id,
    channel:'REEL',
    assignment_role:'LEAD',
    channel_job:'VISUAL_PROOF',
    angle_key:'trainer-judgment-visual',
    message_key:'10-to-8',
    claim_focus:'10回予定でもフォームが崩れれば8回で止める。',
    rationale:'Concrete trainer judgment is best shown visually.',
    estimated_work_minutes:20,
    evidence_keys:['fp:reps'],
    qc_decision:'READY',
    ...overrides
  },map);
}

test('v0.9 migration adds Director plan and assignment stores with private server access',()=>{
  const sql=fs.readFileSync(
    new URL('../supabase/migrations/20261007025244_social_director_cross_channel_v09.sql',import.meta.url),
    'utf8'
  );
  for(const table of ['social_director_daily_plans','social_director_channel_assignments']){
    assert.match(sql,new RegExp(table));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    assert.match(sql,new RegExp(`grant select,insert,update,delete on table public\\.${table} to service_role`));
  }
  assert.match(sql,/social_reel_evidence_candidates[\s\S]*director_assignment_id/);
  assert.match(sql,/social_story_evidence_items[\s\S]*director_assignment_id/);
  assert.match(sql,/social_thread_candidates[\s\S]*opportunity_id/);
  assert.match(sql,/social_thread_candidates[\s\S]*director_assignment_id/);
});

test('Director rejects a channel job that belongs to another channel',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  assert.throws(()=>normalizeDirectorAssignment({
    opportunity_id:op.id,
    channel:'STORIES',
    assignment_role:'SUPPORT',
    channel_job:'VISUAL_PROOF',
    angle_key:'story-angle',
    message_key:'story-message',
    claim_focus:'A grounded claim.',
    rationale:'Support the opportunity.',
    evidence_keys:['fp:reps']
  },map),/SOCIAL_DIRECTOR_CHANNEL_JOB_INVALID/);
});

test('Director rejects evidence that is outside the Opportunity lineage',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  assert.throws(()=>normalizeDirectorAssignment({
    opportunity_id:op.id,
    channel:'REEL',
    assignment_role:'LEAD',
    channel_job:'VISUAL_PROOF',
    angle_key:'a',
    message_key:'m',
    claim_focus:'claim',
    rationale:'reason',
    evidence_keys:['invented:evidence']
  },map),/SOCIAL_DIRECTOR_EVIDENCE_OUTSIDE_OPPORTUNITY/);
});

test('EXPLORATORY Opportunity cannot silently become READY at Director level',()=>{
  const op=opportunity({evidence_strength:'EXPLORATORY',qc_decision:'REVIEW_REQUIRED'});
  const map=new Map([[op.id,op]]);
  assert.throws(()=>normalizeDirectorAssignment({
    opportunity_id:op.id,
    channel:'REEL',
    assignment_role:'LEAD',
    channel_job:'VISUAL_PROOF',
    angle_key:'a',
    message_key:'m',
    claim_focus:'claim',
    rationale:'reason',
    evidence_keys:['fp:reps'],
    qc_decision:'READY'
  },map),/SOCIAL_DIRECTOR_READY_REQUIRES_GROUNDED/);
});

test('same Opportunity can cross channels only with one lead and distinct angle/message/claim',()=>{
  const op=opportunity();
  const lead=assignment(op);
  const support=assignment(op,{
    channel:'STORIES',
    assignment_role:'SUPPORT',
    channel_job:'DECISION_SUPPORT',
    angle_key:'one-frame-judgment',
    message_key:'quality-over-count-story',
    claim_focus:'サービス判断の背景を一文で補助する。',
    evidence_keys:['fact:service'],
    estimated_work_minutes:5
  });
  const qc=validateDirectorAssignmentSet([lead,support],60);
  assert.equal(qc.opportunities_used,1);
  assert.equal(qc.estimated_workload_minutes,25);

  assert.throws(()=>validateDirectorAssignmentSet([
    lead,
    {...support,angle_key:lead.angle_key}
  ],60),/SOCIAL_DIRECTOR_CROSS_CHANNEL_ANGLE_DUPLICATE/);

  assert.throws(()=>validateDirectorAssignmentSet([
    lead,
    {...support,assignment_role:'LEAD'}
  ],60),/SOCIAL_DIRECTOR_OPPORTUNITY_REQUIRES_ONE_LEAD/);
});

test('same Evidence cannot be reused across channels by default',()=>{
  const op=opportunity();
  const lead=assignment(op);
  const support=assignment(op,{
    channel:'STORIES',
    assignment_role:'SUPPORT',
    channel_job:'DECISION_SUPPORT',
    angle_key:'one-frame-judgment',
    message_key:'quality-over-count-story',
    claim_focus:'同じEvidenceを別Channelで再説明する。',
    evidence_keys:['fp:reps'],
    estimated_work_minutes:5
  });
  assert.throws(
    ()=>validateDirectorAssignmentSet([lead,support],60),
    /SOCIAL_DIRECTOR_CROSS_CHANNEL_EVIDENCE_REUSE_REQUIRES_EXCEPTION/
  );
});

test('same Evidence cross-channel reuse requires an explicit support exception and rationale',()=>{
  const op=opportunity();
  const lead=assignment(op);
  const support=assignment(op,{
    channel:'STORIES',
    assignment_role:'SUPPORT',
    channel_job:'DECISION_SUPPORT',
    angle_key:'campaign-follow-up',
    message_key:'campaign-follow-up-message',
    claim_focus:'同じEvidenceを意図的なCampaign sequenceとして補完する。',
    evidence_keys:['fp:reps'],
    estimated_work_minutes:5,
    metadata:{
      allow_same_evidence_cross_channel:true,
      cross_channel_reuse_justification:'同一日のCampaignとしてReelの視覚証拠をStoryで別行動へ接続する必要があるため。'
    }
  });
  const qc=validateDirectorAssignmentSet([lead,support],60);
  assert.equal(qc.checks.same_evidence_cross_channel_guard,true);
});

test('Director enforces channel assignment caps and workload budget',()=>{
  const op1=opportunity();
  const op2=opportunity({
    id:'22222222-2222-4222-8222-222222222222',
    opportunity_no:2,
    evidence:[{role:'PRIMARY',evidence:{evidence_key:'fp:time'}}]
  });
  const map2=new Map([[op2.id,op2]]);
  const lead=assignment(op1);
  const support=normalizeDirectorAssignment({
    opportunity_id:op2.id,
    channel:'STORIES',
    assignment_role:'LEAD',
    channel_job:'DECISION_SUPPORT',
    angle_key:'life-fit-story',
    message_key:'30-min-story',
    claim_focus:'30分なら30分用に内容を調整する判断を一枚で伝える。',
    rationale:'Show service adaptation.',
    priority:2,
    estimated_work_minutes:50,
    evidence_keys:['fp:time']
  },map2);
  assert.throws(()=>validateDirectorAssignmentSet([lead,support],60),/SOCIAL_DIRECTOR_WORKLOAD_BUDGET_EXCEEDED/);
});

test('Threads candidate can carry shared Opportunity and Director assignment lineage',()=>{
  const out=normalizeThreadCandidate({
    title:'予定回数を守るより、フォームを見る。',
    content_job:'PERSPECTIVE_JUDGMENT',
    why_now:'Shared Opportunity assigned Threads as support.',
    confidence:'MEDIUM',
    evidence_strength:'GROUNDED',
    qc_decision:'READY_FOR_APPROVAL',
    opportunity_id:'11111111-1111-4111-8111-111111111111',
    director_assignment_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    evidence_links:[{evidence_key:'fp:reps',role:'PRIMARY'}]
  },1,new Set(['fp:reps']));
  assert.equal(out.row.opportunity_id,'11111111-1111-4111-8111-111111111111');
  assert.equal(out.row.director_assignment_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});

test('Phase 2 planners bind creatives to Director assignments when Director is required',()=>{
  const creative=fs.readFileSync(new URL('../lib/socialEvidenceCreative.mjs',import.meta.url),'utf8');
  const threads=fs.readFileSync(new URL('../lib/socialThreads.mjs',import.meta.url),'utf8');
  assert.match(creative,/getDirectorAssignmentsForChannel/);
  assert.match(creative,/director_required/);
  assert.match(creative,/director_assignment_id:directorAssignment\?\.id\|\|null/);
  assert.match(threads,/SOCIAL_THREAD_DIRECTOR_ASSIGNMENT_REQUIRED/);
  assert.match(threads,/SOCIAL_THREAD_DIRECTOR_JOB_MISMATCH/);
});

test('Bridge exposes Social Director context, prepare, poll and QC',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_director_context',
    'social_director_prepare',
    'social_director_poll',
    'social_director_qc'
  ])assert.match(bridge,new RegExp(action));
  assert.match(endpoint,/director_\(context\|prepare\|poll\|qc\)/);
});
