import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  typographyAcceptancePass, typographyAcceptanceRequired,
  THUMBNAIL_TYPOGRAPHY_REVISION, TYPOGRAPHY_VISUAL_CHECKS
} from '../lib/editorialThumbnailTypography.mjs';
import { hybridQaReady } from '../lib/editorialHybridImageFormat.mjs';
import { evaluateEditorialImageReview } from '../lib/editorialImageReviewGate.mjs';

function acceptance() {
  const variants = {}, visual = {};
  for (const v of ['thumbnail', 'og', 'gbp']) {
    variants[v] = { pass: true, text_preserved: true, font_size_at_320: 24, font_size: 90,
      line_count: 3, lines: ['中では、', '静かに', '休むだけ。'], block_area_ratio: 0.15,
      safe_area_pass: true, line_balance: 0.6, width_occupancy: 0.95,
      fade_contains_text: true, contrast_floor: 11, asset_sha256: 'a'.repeat(64),
      previews: { 320: { sha256: 'b'.repeat(64) }, 400: { sha256: 'c'.repeat(64) } } };
    visual[v] = Object.fromEntries(['pass', ...TYPOGRAPHY_VISUAL_CHECKS].map((k) => [k, true]));
  }
  return { thumbnail_typography_revision: THUMBNAIL_TYPOGRAPHY_REVISION,
    thumbnail_typography_acceptance: { pass: true, deterministic: { pass: true, variants }, visual } };
}

test('all three real preview results are mandatory; a single weak variant fails', () => {
  assert.equal(typographyAcceptancePass(acceptance()), true);
  for (const variant of ['thumbnail', 'og', 'gbp']) {
    for (const check of TYPOGRAPHY_VISUAL_CHECKS) {
      const qa = acceptance(); qa.thumbnail_typography_acceptance.visual[variant][check] = false;
      assert.equal(typographyAcceptancePass(qa), false, `${variant}/${check}`);
    }
    for (const [key, value] of [ ['text_preserved', false], ['font_size_at_320', 9.6], ['line_balance', 0.1],
      ['width_occupancy', 0.2], ['safe_area_pass', false], ['fade_contains_text', false],
      ['contrast_floor', 2], ['line_count', 5], ['asset_sha256', ''] ]) {
      const qa = acceptance(); qa.thumbnail_typography_acceptance.deterministic.variants[variant][key] = value;
      assert.equal(typographyAcceptancePass(qa), false, `${variant}/${key}`);
    }
    const qa = acceptance(); delete qa.thumbnail_typography_acceptance.deterministic.variants[variant].previews[320];
    assert.equal(typographyAcceptancePass(qa), false);
  }
});

test('new QA cannot bypass acceptance with high legacy scores; old approved assets remain intact', () => {
  const qa = JSON.parse(fs.readFileSync('editorial/image-qa/oxygen-room-how-to-spend-time-reference-v26-auto-oxyroom-20260924-ef33bf94.json'));
  const draft = { image_render_version: 'rev-column-reference-v2.3-hybrid',
    image_strategy: 'reference-v2-gpt-image-hybrid-drive-source', image_qa: qa };
  assert.equal(typographyAcceptanceRequired(qa), false);
  assert.equal(hybridQaReady(draft), true);
  assert.equal(evaluateEditorialImageReview({ draft }).ok, true);
  qa.checked_at = '2026-10-02T00:00:00Z';
  assert.equal(hybridQaReady(draft), false);
  assert.equal(evaluateEditorialImageReview({ draft }).checks.thumbnail_typography_acceptance, false);
  Object.assign(qa, acceptance());
  assert.equal(hybridQaReady(draft), true);
  assert.equal(evaluateEditorialImageReview({ draft }).ok, true);
  qa.thumbnail_typography_acceptance.visual.og.pass = false;
  assert.equal(hybridQaReady(draft), false);
  assert.equal(evaluateEditorialImageReview({ draft }).ok, false);
});
