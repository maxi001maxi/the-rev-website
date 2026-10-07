import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  normalizeEvidenceReelCandidate,
  normalizeEvidenceStoryItem
} from '../lib/socialEvidenceCreative.mjs';

function opportunity(overrides={}){
  return {
    id:'11111111-1111-4111-8111-111111111111',
    opportunity_no:1,
    title:'Trainer judgment as visual proof',
    business_job:'TRUST_ABILITY',
    audience_state:'EVALUATING',
    interpretation:'THE REV. value is the live adjustment, not only the menu.',
    hypothesis:'Concrete judgment may improve service understanding.',
    expected_behavior:'Profile interest',
    confidence:'MEDIUM',
    evidence_strength:'GROUNDED',
    evidence_gaps:['Customer Signal sparse'],
    possible_channels:['REEL','STORIES'],
    test_metrics:['24h reach','profile action'],
    qc_decision:'READY',
    evidence:[
      {
        role:'PRIMARY',
        evidence:{
          evidence_key:'fp:reps',
          source_type:'OPERATOR_FIRST_PARTY',
          evidence_text:'10 planned reps may stop at 8 when form changes.'
        }
      },
      {
        role:'COUNTEREVIDENCE',
        evidence:{
          evidence_key:'constraint:no-human',
          source_type:'PRODUCTION_LEARNING',
          evidence_text:'New human filming is not assumed.'
        }
      }
    ],
    ...overrides
  };
}

test('v0.8 Phase 2 migration adds isolated Reel and Stories evidence runtimes',()=>{
  const sql=fs.readFileSync(
    new URL('../supabase/migrations/20261007023843_social_reel_stories_evidence_shadow_v08.sql',import.meta.url),
    'utf8'
  );
  for(const table of [
    'social_reel_evidence_runs',
    'social_reel_evidence_candidates',
    'social_story_evidence_runs',
    'social_story_evidence_items'
  ]){
    assert.match(sql,new RegExp(table));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    assert.match(sql,new RegExp(`grant select,insert,update,delete on table public\\.${table} to service_role`));
  }
  assert.match(sql,/opportunity_id uuid not null references public\.social_opportunities/);
  assert.match(sql,/run_mode in \('SHADOW','PRODUCTION'\)/);
});

test('bridge exposes Phase 2 context and shadow actions',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_creative_evidence_context',
    'social_reel_evidence_prepare',
    'social_reel_evidence_poll',
    'social_stories_evidence_prepare',
    'social_stories_evidence_poll'
  ])assert.match(bridge,new RegExp(action));
  assert.match(endpoint,/creative_evidence_context/);
  assert.match(endpoint,/reel_evidence_\(prepare\|poll\)/);
  assert.match(endpoint,/stories_evidence_\(prepare\|poll\)/);
});

test('READY Reel must reference real Evidence from its Opportunity',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  assert.throws(
    ()=>normalizeEvidenceReelCandidate({
      opportunity_id:op.id,
      creative_direction:'VISUAL_PROOF',
      title:'Stop at eight',
      why_this_execution:'Show the exact trainer judgment.',
      qc_decision:'READY_FOR_APPROVAL',
      claim_refs:['invented:evidence']
    },1,map),
    /SOCIAL_CREATIVE_CLAIM_REF_OUTSIDE_OPPORTUNITY/
  );
});

test('READY Reel cannot upgrade exploratory Opportunity into grounded creative',()=>{
  const op=opportunity({evidence_strength:'EXPLORATORY',qc_decision:'REVIEW_REQUIRED'});
  const map=new Map([[op.id,op]]);
  assert.throws(
    ()=>normalizeEvidenceReelCandidate({
      opportunity_id:op.id,
      creative_direction:'PROCESS',
      title:'A process idea',
      why_this_execution:'Explore the service process.',
      qc_decision:'READY_FOR_APPROVAL',
      claim_refs:['fp:reps']
    },1,map),
    /SOCIAL_CREATIVE_READY_REQUIRES_GROUNDED/
  );
});

test('READY Reel inherits strategic reasoning and cannot overstate confidence',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  const row=normalizeEvidenceReelCandidate({
    opportunity_id:op.id,
    creative_direction:'VISUAL_PROOF',
    title:'10回予定でも、8回で止める。',
    hook:'10回やることが正解とは限りません。',
    core_message:'回数より、その日の質を見る。',
    why_this_execution:'A concrete number makes the trainer judgment visible.',
    difference_from_history:'Recent posts were equipment/knowledge heavy.',
    fact:'10 planned reps may stop at 8 when form changes.',
    confidence:'HIGH',
    qc_decision:'READY_FOR_APPROVAL',
    claim_refs:['fp:reps'],
    test_metrics:['24h reach']
  },1,map);
  assert.equal(row.evidence_strength,'GROUNDED');
  assert.equal(row.confidence,'MEDIUM');
  assert.equal(row.interpretation,op.interpretation);
  assert.equal(row.hypothesis,op.hypothesis);
  assert.deepEqual(row.claim_refs,['fp:reps']);
});

test('generalization flag blocks READY Reel',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  assert.throws(
    ()=>normalizeEvidenceReelCandidate({
      opportunity_id:op.id,
      creative_direction:'WILDCARD',
      title:'Generic psychology',
      why_this_execution:'A generic assumption.',
      qc_decision:'READY_FOR_APPROVAL',
      claim_refs:['fp:reps'],
      generalization_flags:['GENERIC_PSYCHOLOGY']
    },1,map),
    /SOCIAL_CREATIVE_GENERALIZATION_REQUIRES_REVIEW/
  );
});

test('READY Story requires why-today lineage and recent-pattern difference',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  assert.throws(
    ()=>normalizeEvidenceStoryItem({
      opportunity_id:op.id,
      role:'DECISION_SUPPORT',
      frame_text:'30分しかない日は、30分用に変える。',
      source_signal:'First-party says session content is adjusted to available time.',
      why_today:'This is linked to today\'s life-fit Opportunity.',
      qc_decision:'READY_FOR_APPROVAL',
      claim_refs:['fp:reps']
    },1,map),
    /SOCIAL_STORY_EVIDENCE_RECENT_DIFFERENCE_REQUIRED/
  );
});

test('READY Story stays grounded through Opportunity Evidence',()=>{
  const op=opportunity();
  const map=new Map([[op.id,op]]);
  const row=normalizeEvidenceStoryItem({
    opportunity_id:op.id,
    role:'DECISION_SUPPORT',
    pattern:'ONE_FRAME_DECISION',
    frame_text:'予定回数より、フォームを見る。',
    source_signal:'Trainer first-party gives a concrete 10-to-8 adjustment.',
    why_today:'Supports the same Opportunity without repeating the Reel execution.',
    recent_pattern_difference:'Recent Stories were quiet-space / first-visit reassurance.',
    qc_decision:'READY_FOR_APPROVAL',
    claim_refs:['fp:reps']
  },1,map);
  assert.equal(row.status,'PLANNED');
  assert.equal(row.evidence_strength,'GROUNDED');
  assert.deepEqual(row.claim_refs,['fp:reps']);
});
