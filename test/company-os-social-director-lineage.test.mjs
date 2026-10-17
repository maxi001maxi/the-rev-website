import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDirectorAssignment, validateOpportunityEvidenceLineage } from '../lib/socialDirector.mjs';

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
