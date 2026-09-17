// THE REV. Phase 9/10 — Editorial AI bridge safety tests
import {
  bridgeConfig,
  computeEditorialSyncHash,
  safeSecretEqual,
  validateBridgeEnvelope
} from '../lib/editorialBridge.mjs';
import {
  buildEditorialIllustrationPrompt,
  imagePathsForSlug,
  selectBrandImageSource,
  shouldGenerateIllustration
} from '../lib/editorialImage.mjs';

let passed = 0;
const failed = [];
function assert(cond, name, detail = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed.push({ name, detail }); console.log(`  ✕ ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\n[1. fail-closed config]');
const cfg = bridgeConfig({});
assert(cfg.configured === false, '環境変数不足ではconfigured=false');
assert(cfg.missing.includes('EDITORIAL_BRIDGE_SECRET'), 'shared secret不足を検出');
assert(cfg.missing.includes('SUPABASE_SERVICE_ROLE_KEY'), 'service-role key不足を検出');

console.log('\n[2. secret comparison]');
assert(safeSecretEqual('abc123', 'abc123') === true, '同一secretは一致');
assert(safeSecretEqual('abc123', 'abc124') === false, '異なるsecretは拒否');
assert(safeSecretEqual('', '') === false, '空secretは一致扱いにしない');

console.log('\n[3. editorial gates]');
const base = {
  content_id: 'BLOG-20260914-test',
  week_start: '2026-09-14',
  editorial_status: 'READY',
  fact_check_status: 'PASS',
  topic_gate_decision: 'PUBLISH',
  category: 'training',
  cta_type: 'personal-training'
};
assert(validateBridgeEnvelope(base).errors.length === 0, '正常payloadはgate通過');
assert(validateBridgeEnvelope({ ...base, editorial_status: 'DRAFT' }).errors.some((x) => x.includes('READY')), 'READY以外は拒否');
assert(validateBridgeEnvelope({ ...base, fact_check_status: 'FAIL' }).errors.some((x) => x.includes('PASS')), 'Fact Gate PASS以外は拒否');
assert(validateBridgeEnvelope({ ...base, topic_gate_decision: 'HOLD' }).errors.some((x) => x.includes('PUBLISH')), 'Topic Gate PUBLISH以外は拒否');
assert(validateBridgeEnvelope({ ...base, category: 'invalid' }).errors.some((x) => x.includes('category')), '不正categoryを拒否');

console.log('\n[4. idempotent sync hash]');
const article = { title: 'A', slug: 'a', body_markdown: 'body', category: 'training' };
const meta = { content_id: 'x', editor_score: 93 };
const h1 = computeEditorialSyncHash(article, meta);
const h2 = computeEditorialSyncHash({ slug: 'a', category: 'training', title: 'A', body_markdown: 'body' }, { editor_score: 93, content_id: 'x' });
const h3 = computeEditorialSyncHash({ ...article, body_markdown: 'changed' }, meta);
assert(h1 === h2, 'キー順に依存せず同内容は同じhash');
assert(h1 !== h3, '本文変更でhashが変わる');

console.log('\n[5. editorial image planning]');
const imgPaths = imagePathsForSlug('after-work-tired-strength-training');
assert(imgPaths.thumbnailPublicPath === '/assets/images/blog/thumb-after-work-tired-strength-training.jpg', 'Thumbnail公開パスをslugから生成');
assert(imgPaths.ogPublicPath === '/assets/images/blog/og/og-after-work-tired-strength-training.jpg', 'OGP公開パスをslugから生成');

const fatigueArticle = {
  title: '仕事終わり、疲れている日は筋トレに行くべき？',
  description: '疲れている日の負荷調整を考える。',
  bodyMarkdown: '仕事終わりの疲労と休息を見ながら判断します。',
  category: 'body-knowledge'
};
assert(selectBrandImageSource(fatigueArticle) === 'assets/images/photo-evolgear.jpg', '疲労系BODY KNOWLEDGEは実在する設備写真をfallbackに選ぶ');
assert(shouldGenerateIllustration(fatigueArticle, {}) === false, 'OpenAI keyなしではAI画像生成を必須にしない');
assert(shouldGenerateIllustration(fatigueArticle, { OPENAI_API_KEY: 'dummy' }) === true, 'keyありBODY KNOWLEDGEは図解生成対象');
assert(shouldGenerateIllustration({ ...fatigueArticle, category: 'boxing' }, { OPENAI_API_KEY: 'dummy' }) === false, 'conceptual_onlyではboxing実写を優先');
assert(shouldGenerateIllustration(fatigueArticle, { OPENAI_API_KEY: 'dummy', EDITORIAL_IMAGE_AI_MODE: 'off' }) === false, 'AI mode offなら実写選定のみ');

const prompt = buildEditorialIllustrationPrompt(fatigueArticle);
assert(prompt.includes('NOT a photograph'), '生成画像は実在施設の偽写真にしない');
assert(prompt.includes('No readable text'), '生成図解に読めない文字を入れない');
assert(prompt.includes('3:2') && prompt.includes('1.91:1'), 'Thumbnail/OGP両方のcrop safeを指示');

console.log(`\nPhase 9/10 tests: ${passed} passed / ${failed.length} failed`);
if (failed.length) process.exitCode = 1;
