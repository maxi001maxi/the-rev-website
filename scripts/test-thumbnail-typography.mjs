import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  typographyAcceptancePass, typographyAcceptanceRequired,
  THUMBNAIL_TYPOGRAPHY_REVISION, TYPOGRAPHY_VISUAL_CHECKS, ART_DIRECTION_CHECKS,
  GOLDEN_LAYOUT_RULES, GOLDEN_REFERENCE_REVISION, GOLDEN_REFERENCE_ASSETS
} from '../lib/editorialThumbnailTypography.mjs';
import { hybridQaReady } from '../lib/editorialHybridImageFormat.mjs';
import { evaluateEditorialImageReview } from '../lib/editorialImageReviewGate.mjs';

function acceptance() {
  const variants = {}, visual = {}, art = {};
  for (const v of ['thumbnail', 'og', 'gbp']) {
    variants[v] = { pass: true, text_preserved: true, font_size_at_320: 24, font_size: 90,
      line_count: 3, lines: ['中では、', '静かに', '休むだけ。'], block_area_ratio: 0.15,
      safe_area_pass: true, line_balance: 0.6, width_occupancy: 0.95,
      fade_contains_text: true, contrast_floor: 6, hierarchy_pass: true, focus_scale: 1.7,
      layout_rule: GOLDEN_LAYOUT_RULES[v === 'gbp' ? 'gbp' : 'wide'].id, asset_sha256: 'a'.repeat(64),
      previews: { 320: { sha256: 'b'.repeat(64) }, 400: { sha256: 'c'.repeat(64) } } };
    art[v] = Object.fromEntries(['pass', ...ART_DIRECTION_CHECKS].map((k) => [k, true]));
    visual[v] = Object.fromEntries(['pass', ...TYPOGRAPHY_VISUAL_CHECKS].map((k) => [k, true]));
  }
  return { thumbnail_typography_revision: THUMBNAIL_TYPOGRAPHY_REVISION,
    thumbnail_typography_acceptance: { pass: true, deterministic: { pass: true, variants }, visual,
      art_direction: { pass: true, variants: art }, golden_reference: { revision: GOLDEN_REFERENCE_REVISION, assets: GOLDEN_REFERENCE_ASSETS } } };
}

test('all three real preview results are mandatory; a single weak variant fails', () => {
  assert.equal(typographyAcceptancePass(acceptance()), true);
  for (const variant of ['thumbnail', 'og', 'gbp']) {
    for (const check of ART_DIRECTION_CHECKS) {
      const qa = acceptance(); qa.thumbnail_typography_acceptance.art_direction.variants[variant][check] = false;
      assert.equal(typographyAcceptancePass(qa), false, `${variant}/art/${check}`);
    }
    for (const check of TYPOGRAPHY_VISUAL_CHECKS) {
      const qa = acceptance(); qa.thumbnail_typography_acceptance.visual[variant][check] = false;
      assert.equal(typographyAcceptancePass(qa), false, `${variant}/${check}`);
    }
    for (const [key, value] of [ ['text_preserved', false], ['font_size_at_320', 9.6], ['line_balance', 0.1],
      ['width_occupancy', 0.2], ['safe_area_pass', false], ['fade_contains_text', false],
      ['contrast_floor', 2], ['hierarchy_pass', false], ['focus_scale', 1], ['layout_rule', 'uniform'], ['line_count', 5], ['asset_sha256', ''] ]) {
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
  qa.checked_at = '2026-10-03T03:00:00Z';
  assert.equal(hybridQaReady(draft), true, 'historical assets must not be invalidated by a clock cutover');
  qa.thumbnail_typography_revision = THUMBNAIL_TYPOGRAPHY_REVISION;
  assert.equal(hybridQaReady(draft), false);
  assert.equal(evaluateEditorialImageReview({ draft }).checks.thumbnail_typography_acceptance, false);
  Object.assign(qa, acceptance());
  assert.equal(hybridQaReady(draft), true);
  assert.equal(evaluateEditorialImageReview({ draft }).ok, true);
  qa.thumbnail_typography_acceptance.visual.og.pass = false;
  assert.equal(hybridQaReady(draft), false);
  assert.equal(evaluateEditorialImageReview({ draft }).ok, false);
});

test('reference drift and missing art direction fail despite machine PASS', () => {
  const qa = acceptance();
  qa.thumbnail_typography_acceptance.golden_reference.assets = [];
  assert.equal(typographyAcceptancePass(qa), false);
  const missing = acceptance(); delete missing.thumbnail_typography_acceptance.art_direction;
  assert.equal(typographyAcceptancePass(missing), false);
  for (const ref of GOLDEN_REFERENCE_ASSETS) {
    assert.equal(createHash('sha256').update(fs.readFileSync(ref.path)).digest('hex'), ref.sha256);
  }
  assert.notDeepEqual(GOLDEN_LAYOUT_RULES.wide, GOLDEN_LAYOUT_RULES.gbp);
});
