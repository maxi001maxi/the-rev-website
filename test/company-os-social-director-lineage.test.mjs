import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDirectorAssignment, validateOpportunityEvidenceLineage, requiresSocialPortfolio } from '../lib/socialDirector.mjs';

function fixture(overrides = {}) {
  const opportunity = {
    id: 'op-1',
    opportunity_no: 1,
    title: 'Verified local signal',
    possible_channels: ['THREADS'],
    evidence_strength: 'GROUNDED',
    qc_decision: 'READY',
    confidence: 0.9,
    expected_behavior: 'Read and consider',
    evidence: [{ evidence: { evidence_key: 'source:verified-1' }, role: 'PRIMARY' }],
    ...overrides
  };
  return new Map([[opportunity.id, opportunity]]);
}
const input = {
  opportunity_id: 'op-1',
  channel: 'THREADS',
  assignment_role: 'LEAD',
  channel_job: 'FIELD_NOTE_OBSERVATION',
  angle_key: 'local-angle',
  message_key: 'local-message',
  claim_focus: 'Observed and verifiable fact',
  rationale: 'Uses the linked primary source',
  evidence_keys: ['source:verified-1'],
  qc_decision: 'READY'
};

test('a grounded READY assignment retains its exact evidence lineage', () => {
  const result = normalizeDirectorAssignment(input, fixture());
  assert.deepEqual(result.evidence_keys, ['source:verified-1']);
  assert.equal(result.qc_decision, 'READY');
});

test('READY is rejected when the source opportunity is not GROUNDED', () => {
  assert.throws(
    () => normalizeDirectorAssignment(input, fixture({ evidence_strength: 'UNGROUNDED' })),
    /SOCIAL_DIRECTOR_READY_REQUIRES_GROUNDED/
  );
});

test('READY is rejected when the source opportunity is not approved READY', () => {
  assert.throws(
    () => normalizeDirectorAssignment(input, fixture({ qc_decision: 'REVIEW_REQUIRED' })),
    /SOCIAL_DIRECTOR_READY_REQUIRES_READY_OPPORTUNITY/
  );
});

test('assignment cannot reference an evidence key outside its opportunity', () => {
  assert.throws(
    () => normalizeDirectorAssignment({ ...input, evidence_keys: ['source:unrelated'] }, fixture()),
    /SOCIAL_DIRECTOR_EVIDENCE_OUTSIDE_OPPORTUNITY/
  );
});

test('assignment cannot proceed without evidence', () => {
  assert.throws(
    () => normalizeDirectorAssignment({ ...input, evidence_keys: [] }, fixture()),
    /SOCIAL_DIRECTOR_EVIDENCE_REQUIRED/
  );
});

test('assignment cannot proceed when the linked evidence record is missing', () => {
  assert.throws(
    () => normalizeDirectorAssignment(input, fixture({ evidence: [{ evidence: null, role: 'PRIMARY' }] })),
    /SOCIAL_DIRECTOR_EVIDENCE_OUTSIDE_OPPORTUNITY/
  );
});

const p='pool-10';
const e={id:'e-10',pool_id:p,evidence_key:'real:key',source_ref:'verified:row'};
const o=(x)=>({qc_decision:'READY',evidence_strength:'GROUNDED',evidence:x});
test('linked primary source passes the current-date pool gate',()=>{
  assert.equal(validateOpportunityEvidenceLineage(o([{role:'PRIMARY',evidence:e}]),p),true);
});
test('foreign pool is not valid even with a matching evidence key',()=>{
  assert.throws(()=>validateOpportunityEvidenceLineage(o([{role:'PRIMARY',evidence:{...e,pool_id:'old'}}]),p),/POOL_MISMATCH/);
});
test('broken link is rejected before Director plan creation',()=>{
  assert.throws(()=>validateOpportunityEvidenceLineage(o([{role:'PRIMARY',evidence:null}]),p),/LINK_UNRESOLVED/);
});
test('unverified source reference is rejected',()=>{
  assert.throws(()=>validateOpportunityEvidenceLineage(o([{role:'PRIMARY',evidence:{...e,source_ref:null}}]),p),/SOURCE_UNVERIFIED/);
});
test('corroboration without primary evidence is insufficient for READY',()=>{
  assert.throws(()=>validateOpportunityEvidenceLineage(o([{role:'CORROBORATING',evidence:e}]),p),/PRIMARY_EVIDENCE_REQUIRED/);
});

test('v1.0.1 production cannot silently bypass portfolio verification',()=>{
  assert.equal(requiresSocialPortfolio('PRODUCTION',{contract_version:'v1.0.1',portfolio_required:false}),true);
  assert.equal(requiresSocialPortfolio('PRODUCTION',{contract_version:'v0.9'}),false);
  assert.equal(requiresSocialPortfolio('SHADOW',{contract_version:'v1.0.1'}),false);
  assert.equal(requiresSocialPortfolio('SHADOW',{portfolio_required:true}),true);
});
