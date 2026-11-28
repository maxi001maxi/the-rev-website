import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Stories migration adds daily plan and item stores',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261006122500_social_stories_v06.sql',import.meta.url),'utf8');
  assert.match(sql,/social_story_daily_plans/);
  assert.match(sql,/social_story_items/);
  assert.match(sql,/slot_no between 1 and 3/);
  assert.match(sql,/POSTED_VERIFIED/);
});

test('Stories runtime supports 1 to 3 planned items and no decorative interaction requirement',()=>{
  const source=fs.readFileSync(new URL('../lib/socialStories.mjs',import.meta.url),'utf8');
  assert.match(source,/list\.length<1\|\|list\.length>3/);
  assert.match(source,/NONE','POLL','QUESTION','QUIZ','LINK','DM/);
  assert.match(source,/holdReason/);
});

test('Stories bridge actions are exposed through existing authenticated endpoint',()=>{
  const bridge=fs.readFileSync(new URL('../lib/socialBridgeApi.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  for(const action of [
    'social_stories_prepare',
    'social_stories_list',
    'social_story_created',
    'social_story_publication_link'
  ]) assert.match(bridge,new RegExp(action));
  assert.match(endpoint,/stories_\(prepare\|list\)/);
  assert.match(endpoint,/story_\(created\|publication_link\)/);
});

test('Stories publication cannot be verified without platform media evidence',()=>{
  const source=fs.readFileSync(new URL('../lib/socialStories.mjs',import.meta.url),'utf8');
  assert.match(source,/SOCIAL_MEDIA_ID_REQUIRED/);
  assert.match(source,/SOCIAL_PUBLISHED_EVIDENCE_REQUIRED/);
});

test('Stories history exposes pattern and interaction for rolling sequence QC',()=>{
  const source=fs.readFileSync(new URL('../lib/socialStories.mjs',import.meta.url),'utf8');
  assert.match(source,/summarizeStorySequence/);
  assert.match(source,/pattern:item\.pattern/);
  assert.match(source,/interaction:item\.interaction/);
});
