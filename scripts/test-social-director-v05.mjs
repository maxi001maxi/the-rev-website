import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  normalizePublishedPost,
  parseLegacyPerformanceSummary
} from '../lib/socialHistory.mjs';
import {
  prepareSocialCandidates
} from '../lib/socialCandidates.mjs';

test('legacy performance summary parses safely',()=>{
  assert.deepEqual(
    parseLegacyPerformanceSummary('reach=123; views=456; likes=7; comments=0'),
    {reach:123,views:456,likes:7,comments:0}
  );
});

test('published post normalization requires media id and preserves source truth',()=>{
  const row=normalizePublishedPost({
    post_id:'abc123',
    platform:'Instagram',
    publish_date:'2026-10-01T00:00:00+09:00',
    title:'店舗紹介',
    source:'01_POST_HISTORY'
  });
  assert.equal(row.platform,'INSTAGRAM');
  assert.equal(row.platform_media_id,'abc123');
  assert.equal(row.title,'店舗紹介');
  assert.equal(row.source,'01_POST_HISTORY');
  assert.throws(()=>normalizePublishedPost({platform:'Instagram'}),/SOCIAL_MEDIA_ID_REQUIRED/);
});

test('candidate preparation rejects anything except exactly five ideas before DB access',async()=>{
  await assert.rejects(
    ()=>prepareSocialCandidates({
      supabase:{},
      targetDate:'2026-10-06',
      candidates:[{title:'one'}]
    }),
    /SOCIAL_FIVE_CANDIDATES_REQUIRED/
  );
});

test('editorial status bridge exposes social actions without adding a Vercel function',()=>{
  const source=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  assert.match(source,/socialBridgeResponse/);
  assert.match(source,/social_history_upsert/);
  assert.match(source,/social_candidates_prepare/);
  assert.match(source,/social_candidates_choose/);
});

test('GAS add-on blocks stale history and never auto-publishes',()=>{
  const source=fs.readFileSync(new URL('../editorial/gas/SocialDirector_v0.5_ONE_PASTE.gs',import.meta.url),'utf8');
  assert.match(source,/PUBLISHED_HISTORY_STALE/);
  assert.match(source,/HISTORY_STALE/);
  assert.match(source,/THE REV\.\｜今日のReel B候補|THE REV\.｜今日のReel B候補/);
  assert.match(source,/選択はChatGPTへ/);
  assert.doesNotMatch(source,/create_video_post|publishInstagram|media_publish/);
  assert.match(source,/FIRST_VISIT_PROCESS/);
  assert.match(source,/TRAINER_JUDGMENT/);
  assert.match(source,/STORE_SERVICE_EXPERIENCE/);
  assert.match(source,/WILDCARD/);
});
