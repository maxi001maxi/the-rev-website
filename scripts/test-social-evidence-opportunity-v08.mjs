import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {normalizeSharedEvidence} from '../lib/socialEvidence.mjs';
import {normalizeSocialOpportunity} from '../lib/socialOpportunities.mjs';

test('v0.8 migration adds shared evidence and opportunity stores with RLS',()=>{
  const sql=fs.readFileSync(
    new URL('../supabase/migrations/20261007022254_social_evidence_opportunity_core_v08.sql',import.meta.url),
    'utf8'
  );
  for(const table of [
    'social_evidence_daily_pools',
    'social_evidence_items',
    'social_opportunity_daily_plans',
    'social_opportunities',
    'social_opportunity_evidence'
  ]){
    assert.match(sql,new RegExp(table));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    assert.match(sql,new RegExp(`grant select,insert,update,delete on table public\\.${table} to service_role`));
  }
});

test('bridge exposes evidence and opportunity actions',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_evidence_context',
    'social_evidence_prepare',
    'social_evidence_poll',
    'social_opportunities_prepare',
    'social_opportunities_poll'
  ]){
    assert.match(bridge,new RegExp(action));
  }
  assert.match(endpoint,/evidence_\(context\|prepare\|poll\)/);
  assert.match(endpoint,/opportunities_\(prepare\|poll\)/);
});

test('shared evidence normalization rejects unsupported model-prior evidence',()=>{
  assert.throws(
    ()=>normalizeSharedEvidence({
      evidence_key:'model:guess',
      source_type:'MODEL_PRIOR',
      evidence_text:'generic assumption'
    }),
    /SOCIAL_EVIDENCE_SOURCE_INVALID/
  );
});

test('shared evidence defaults to internal shared evidence',()=>{
  const row=normalizeSharedEvidence({
    evidence_key:'fp:test',
    source_type:'OPERATOR_FIRST_PARTY',
    evidence_text:'Trainer first-party judgment.'
  });
  assert.deepEqual(row.channel_relevance,['SHARED']);
  assert.equal(row.truth_authority,6);
  assert.equal(row.allowed_use,'INTERNAL_REASONING');
});

test('opportunity requires primary evidence from the prepared pool',()=>{
  const keys=new Set(['fp:test']);
  assert.throws(
    ()=>normalizeSocialOpportunity({
      title:'Trainer judgment',
      business_problem:'STORE_AWARENESS_BUILD',
      why_now:'First-party evidence exists and this judgment is underrepresented.',
      evidence_strength:'GROUNDED',
      confidence:'MEDIUM',
      qc_decision:'READY',
      possible_channels:['REEL','THREADS'],
      evidence_links:[{evidence_key:'fp:test',role:'CORROBORATING'}]
    },1,keys),
    /SOCIAL_OPPORTUNITY_PRIMARY_EVIDENCE_REQUIRED/
  );
});

test('ungrounded opportunity cannot be ready',()=>{
  const keys=new Set(['research:test']);
  assert.throws(
    ()=>normalizeSocialOpportunity({
      title:'Generic idea',
      business_problem:'STORE_AWARENESS_BUILD',
      why_now:'No first-party or own evidence.',
      evidence_strength:'UNGROUNDED',
      confidence:'LOW',
      qc_decision:'READY',
      possible_channels:['REEL'],
      evidence_links:[{evidence_key:'research:test',role:'PRIMARY'}]
    },1,keys),
    /SOCIAL_OPPORTUNITY_UNGROUNDED_MUST_BLOCK/
  );
});

test('grounded opportunity keeps evidence lineage and channel scoring',()=>{
  const keys=new Set(['fp:test','performance:test']);
  const out=normalizeSocialOpportunity({
    title:'Show trainer judgment as proof',
    business_problem:'STORE_AWARENESS_BUILD',
    business_job:'TRUST_ABILITY',
    primary_objective:'Make service judgment visible before a visit.',
    audience_state:'EVALUATING',
    why_now:'Trainer judgment has direct first-party evidence and limited recent visual proof.',
    observed_signal:'10 planned reps may stop at 8 when form changes.',
    interpretation:'The service value is the adjustment, not merely the exercise menu.',
    hypothesis:'Concrete judgment may improve service understanding.',
    expected_behavior:'Profile interest',
    evidence_strength:'GROUNDED',
    confidence:'MEDIUM',
    qc_decision:'READY',
    possible_channels:['REEL','THREADS'],
    channel_scores:{REEL:92,THREADS:80,STORIES:45},
    evidence_links:[
      {evidence_key:'fp:test',role:'PRIMARY'},
      {evidence_key:'performance:test',role:'CORROBORATING'}
    ]
  },1,keys);
  assert.equal(out.row.evidence_strength,'GROUNDED');
  assert.equal(out.row.channel_scores.REEL,92);
  assert.deepEqual(out.links.map(x=>x.role),['PRIMARY','CORROBORATING']);
});
