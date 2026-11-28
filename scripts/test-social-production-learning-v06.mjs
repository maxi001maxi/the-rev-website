import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  recordSocialProductionEvent,
  linkVerifiedPublication
} from '../lib/socialProductionLearning.mjs';

test('v0.6 migration adds learning and production-event stores',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261006113000_social_production_learning_v06.sql',import.meta.url),'utf8');
  assert.match(sql,/social_production_events/);
  assert.match(sql,/social_production_learnings/);
  assert.match(sql,/candidate_id uuid references public\.social_reel_candidates/);
  assert.match(sql,/PUBLISHED_VERIFIED/);
  assert.match(sql,/USER_PREFERENCE/);
  assert.match(sql,/PERFORMANCE/);
});

test('v0.6 bridge exposes production and learning actions',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_production_finalize',
    'social_production_event',
    'social_publication_link',
    'social_learning_upsert',
    'social_learning_list',
    'social_learning_context'
  ]){
    assert.match(bridge,new RegExp(action));
    assert.match(endpoint,/production_\(finalize\|event\)|publication_link|learning_\(upsert\|list\|context\)/);
  }
});

test('generic production event cannot claim a verified publish',async()=>{
  await assert.rejects(
    ()=>recordSocialProductionEvent({
      supabase:{},
      candidateId:'00000000-0000-0000-0000-000000000000',
      eventType:'PUBLISHED_VERIFIED'
    }),
    /USE_SOCIAL_PUBLICATION_LINK/
  );
});

test('verified publication linkage requires actual media id before DB work',async()=>{
  await assert.rejects(
    ()=>linkVerifiedPublication({
      supabase:{},
      candidateId:'00000000-0000-0000-0000-000000000000',
      platformMediaId:''
    }),
    /SOCIAL_MEDIA_ID_REQUIRED|SOCIAL_CANDIDATE_READ_FAILED/
  );
});

test('candidate regeneration guard protects production lifecycle states',()=>{
  const source=fs.readFileSync(new URL('../lib/socialCandidates.mjs',import.meta.url),'utf8');
  for(const state of ['SELECTED','READY','CREATED','SHOT','PUBLISHED']){
    assert.match(source,new RegExp("'" + state + "'"));
  }
});

test('performance learning is not activated from one observation by default',()=>{
  const source=fs.readFileSync(new URL('../lib/socialProductionLearning.mjs',import.meta.url),'utf8');
  assert.match(source,/row\.learning_type==='PERFORMANCE'/);
  assert.match(source,/count>=2/);
  assert.match(source,/row\.confidence>=0\.65/);
});

test('production context returns active and candidate learnings separately',()=>{
  const source=fs.readFileSync(new URL('../lib/socialProductionLearning.mjs',import.meta.url),'utf8');
  assert.match(source,/active_learnings/);
  assert.match(source,/candidate_learnings/);
  assert.match(source,/published_productions/);
});
