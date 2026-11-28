import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  THREADS_V11,
  THREADS_OPERATIONS_V11,
  validateThreadsOperationsV11
} from '../lib/socialThreadParticipationV11.mjs';

const productionBase=()=>({
  version:THREADS_V11,
  run_mode:'PRODUCTION',
  conversation_source_status:'FRESH',
  conversation_capabilities:{MENTIONS:{status:'FRESH'}},
  daily_mode:'PARTICIPATION_ONLY',
  participation_opportunities:[{
    opportunity_key:'mention-1',
    surface:'REPLY',
    decision:'SELECT',
    source_capability:'MENTIONS',
    source_ref:'threads:m1',
    source_observed_at:'2026-10-08T09:00:00+09:00',
    source_summary:'実在するThreads会話',
    why_this_conversation:'THE REV.の専門判断を短く足せる',
    THE_REV_role:'PERSPECTIVE',
    risk_notes:'医療断定をしない',
    draft_text:'まず状態を見て、できる範囲から始めるのがいいと思います。'
  }],
  original_required:false,
  original_reason:null,
  hold_reason:null,
  measurement_windows:[7,30],
  one_post_rule_promotion:false,
  human_approval_required:true,
  auto_reply:false,
  auto_publish:false
});

test('unified Threads v1.1 supports Production while preserving human approval',()=>{
  const out=validateThreadsOperationsV11(productionBase());
  assert.equal(out.version,THREADS_V11);
  assert.equal(out.run_mode,'PRODUCTION');
  assert.equal(out.selected_participation_count,1);
  assert.equal(out.human_approval_required,true);
  assert.equal(out.auto_reply,false);
  assert.equal(out.auto_publish,false);
});

test('legacy Operations v1.1 identifier remains SHADOW only',()=>{
  const x=productionBase();
  x.version=THREADS_OPERATIONS_V11;
  assert.throws(()=>validateThreadsOperationsV11(x),/LEGACY_SHADOW_ONLY/);
});

test('Production participation still requires a FRESH exact capability',()=>{
  const x=productionBase();
  x.conversation_capabilities.MENTIONS.status='UNKNOWN';
  assert.throws(()=>validateThreadsOperationsV11(x),/SOURCE_CAPABILITY_NOT_FRESH/);
});

test('unified runtime exposes prepare, poll and approve without send action',()=>{
  const runtime=fs.readFileSync(new URL('../lib/socialThreadsV11.mjs',import.meta.url),'utf8');
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  assert.match(runtime,/prepareThreadsV11Decision/);
  assert.match(runtime,/pollThreadsV11Decision/);
  assert.match(runtime,/approveThreadsV11Participation/);
  assert.match(runtime,/send_performed:false/);
  assert.match(bridge,/social_threads_v11_prepare/);
  assert.match(bridge,/social_threads_v11_poll/);
  assert.match(bridge,/social_threads_v11_approve/);
  assert.match(endpoint,/v11_\(prepare\|poll\|approve\)/);
});

test('v1.0 original persistence preserves v1.1 source context',()=>{
  const threads=fs.readFileSync(new URL('../lib/socialThreads.mjs',import.meta.url),'utf8');
  assert.match(threads,/source_context:\{\.\.\.obj\(existing\?\.source_context\),\.\.\.obj\(sourceContext\)\}/);
});
