import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  normalizeCustomerSignal,
  normalizeThreadEvidence,
  normalizeThreadCandidate
} from '../lib/socialThreadModel.mjs';

test('Threads evidence requires a typed source and actual evidence text',()=>{
  const row=normalizeThreadEvidence({
    key:'ev-1',
    source_type:'CUSTOMER_SIGNAL',
    evidence_text:'体験前に運動が続くか不安という匿名化された質問があった',
    confidence:0.8
  });
  assert.equal(row.evidence_key,'ev-1');
  assert.equal(row.source_type,'CUSTOMER_SIGNAL');
  assert.equal(row.truth_authority,6);
  assert.throws(
    ()=>normalizeThreadEvidence({key:'ev-2',source_type:'TREND_SIGNAL'}),
    /SOCIAL_THREAD_EVIDENCE_TEXT_REQUIRED/
  );
});

test('Threads candidate cannot exist without PRIMARY evidence',()=>{
  const keys=new Set(['ev-1']);
  assert.throws(
    ()=>normalizeThreadCandidate({
      title:'候補',
      content_job:'PERSPECTIVE_JUDGMENT',
      why_now:'顧客Signalがあるため',
      evidence_strength:'GROUNDED',
      evidence_links:[{key:'ev-1',role:'CORROBORATING'}]
    },1,keys),
    /SOCIAL_THREAD_PRIMARY_EVIDENCE_REQUIRED/
  );
  const row=normalizeThreadCandidate({
    title:'候補',
    content_job:'PERSPECTIVE_JUDGMENT',
    why_now:'顧客Signalがあるため',
    evidence_strength:'GROUNDED',
    qc_decision:'READY_FOR_APPROVAL',
    evidence_links:[{key:'ev-1',role:'PRIMARY'}]
  },1,keys);
  assert.deepEqual(row.row.evidence_packet.primary_keys,['ev-1']);
});

test('UNGROUNDED candidate must be blocked or held',()=>{
  const keys=new Set(['ev-1']);
  assert.throws(
    ()=>normalizeThreadCandidate({
      title:'根拠なし',
      content_job:'HUMAN_TEXTURE',
      why_now:'思いつき',
      evidence_strength:'UNGROUNDED',
      qc_decision:'READY_FOR_APPROVAL',
      evidence_links:[{key:'ev-1',role:'PRIMARY'}]
    },1,keys),
    /SOCIAL_THREAD_UNGROUNDED_MUST_BLOCK/
  );
});

test('customer signals reject direct identity fields and require a usable signal',()=>{
  assert.throws(
    ()=>normalizeCustomerSignal({source_type:'TRIAL',email:'x@example.com',question:'不安です'}),
    /SOCIAL_CUSTOMER_SIGNAL_PII_NOT_ALLOWED/
  );
  assert.throws(
    ()=>normalizeCustomerSignal({source_type:'TRIAL'}),
    /SOCIAL_CUSTOMER_SIGNAL_CONTENT_REQUIRED/
  );
  const row=normalizeCustomerSignal({
    source_type:'TRIAL',
    decision_barrier:'何をする場所か分からない',
    consent_scope:'INTERNAL_ONLY'
  });
  assert.equal(row.source_type,'TRIAL');
});

test('Threads bridge and authenticated endpoint expose evidence-first actions',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_customer_signals_ingest',
    'social_customer_signals_list',
    'social_threads_prepare',
    'social_threads_poll',
    'social_threads_choose',
    'social_threads_list',
    'social_threads_publication_link',
    'social_threads_context'
  ]) assert.match(bridge,new RegExp(action));
  assert.match(endpoint,/customer_signals_\(ingest\|list\)/);
  assert.match(endpoint,/threads_\(prepare\|poll\|choose\|list\|publication_link\|context\)/);
});

test('Threads runtime keeps approval and verified publication gates',()=>{
  const source=fs.readFileSync(new URL('../lib/socialThreads.mjs',import.meta.url),'utf8');
  assert.match(source,/READY_FOR_APPROVAL/);
  assert.match(source,/SOCIAL_THREAD_CANDIDATE_NOT_APPROVABLE/);
  assert.match(source,/SOCIAL_PUBLISHED_EVIDENCE_REQUIRED/);
  assert.match(source,/thread_candidate_id/);
  assert.doesNotMatch(source,/publishThread|threads_publish|media_publish/);
});

test('Threads migration is private to service role and RLS protected',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261006234040_social_threads_evidence_runtime_v07.sql',import.meta.url),'utf8');
  for(const table of [
    'social_customer_signals',
    'social_thread_daily_plans',
    'social_thread_evidence',
    'social_thread_candidates',
    'social_thread_candidate_evidence'
  ]) assert.match(sql,new RegExp(table));
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on table public\.social_customer_signals from anon, authenticated/);
  assert.match(sql,/grant select, insert, update, delete on table public\.social_customer_signals to service_role/);
});
