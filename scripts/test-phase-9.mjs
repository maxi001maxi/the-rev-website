// THE REV. Phase 9/10 — Editorial AI bridge safety tests
import {
  bridgeConfig,
  computeEditorialSyncHash,
  safeSecretEqual,
  validateBridgeEnvelope
} from '../lib/editorialBridge.mjs';
import {
  IMAGE_RENDER_VERSION,
  IMAGE_STYLE_TEMPLATE,
  buildEditorialImagePlan,
  imagePathsForSlug,
  qaReportPathFor,
  selectBrandImageSource
} from '../lib/editorialImage.mjs';
import {
  buildImageHeadlineShort,
  imageCopyIsArticleTitle,
  validateImageHeadlineShort
} from '../lib/editorialImageCopy.mjs';
import { REV_COLUMN_REFERENCE_V2 } from '../lib/editorialImageStyle.mjs';

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
assert(IMAGE_RENDER_VERSION === 'rev-column-reference-v2', 'Reference V2を画像Render Version正本に固定');
assert(IMAGE_STYLE_TEMPLATE === 'rev-column-reference-v2', 'Reference V2を画像Style正本に固定');
assert(REV_COLUMN_REFERENCE_V2.styleReferences.length === 5, '旧5記事すべてをStyle Referencesとして保持');
assert(REV_COLUMN_REFERENCE_V2.generationModel === 'gpt-image-2.5-sunburst', '高品質画像編集モデルを既定化');
assert(REV_COLUMN_REFERENCE_V2.qaModel === 'gpt-5.4-mini', 'Vision Brand QAモデルを既定化');

const fatigueArticle = {
  title: '仕事終わり、疲れている日は筋トレに行くべき？軽く始めて決める目安',
  slug: 'after-work-tired-strength-training',
  description: '疲れている日の負荷調整を考える。',
  bodyMarkdown: '仕事終わりの疲労と休息を見ながら判断します。',
  category: 'body-knowledge',
  imageSeriesLabel: 'COLUMN 06'
};

const shortCopy = buildImageHeadlineShort(fatigueArticle);
assert(shortCopy === '疲れた日は、\n軽く始めて決める。', '記事タイトルと分離した短いEditorial Copyを生成');
assert(imageCopyIsArticleTitle(fatigueArticle, shortCopy) === false, '画像コピーはSEO記事タイトルの丸写しではない');
assert(validateImageHeadlineShort(shortCopy).ok === true, '画像コピーが長さ・トーン規則を通過');
assert(selectBrandImageSource(fatigueArticle) === 'assets/images/photo-evolgear.jpg', '疲労系BODY KNOWLEDGEは実在する設備写真を選ぶ');

const plan = buildEditorialImagePlan(fatigueArticle);
assert(plan.styleTemplate === 'rev-column-reference-v2', 'Reference V2 templateで画像Jobを設計');
assert(plan.imageHeadlineShort === shortCopy, 'Jobへ短い画像コピーを渡す');
assert(plan.seriesLabel === 'COLUMN 06', 'Column番号をJobへ保持');
assert(plan.styleReferences.length === 5, 'Jobへ承認済み旧5記事をすべて渡す');
assert(plan.sourcePath === 'assets/images/photo-evolgear.jpg', 'THE REV.実写をContent Referenceへ設定');
assert(/^reference-v2-[a-f0-9]{10}$/.test(plan.assetVersion), '画像versionをReference V2内容ハッシュで固定');
assert(plan.generationModel === 'gpt-image-2.5-sunburst', 'JobにGPT Imageモデルを保持');
assert(plan.qaModel === 'gpt-5.4-mini', 'JobにBrand QAモデルを保持');
assert(plan.qaReportPath === qaReportPathFor(fatigueArticle.slug, plan.assetVersion), 'QA report pathをversioned assetと紐付け');
assert(plan.job.style_references.length === 5 && plan.job.content_reference === plan.sourcePath, 'Style ReferencesとContent Referenceの役割を分離');
assert(plan.thumbnail.includes(`-${plan.assetVersion}.jpg`), 'Thumbnailはversioned filename');
assert(plan.ogImage.includes(`-${plan.assetVersion}.jpg`), 'OGPはversioned filename');

const imgPaths = imagePathsForSlug(fatigueArticle.slug, plan.assetVersion);
assert(imgPaths.thumbnailPublicPath === plan.thumbnail, 'Thumbnail公開パスをplanと一致');
assert(imgPaths.ogPublicPath === plan.ogImage, 'OGP公開パスをplanと一致');

console.log(`\nPhase 9/10 tests: ${passed} passed / ${failed.length} failed`);
if (failed.length) process.exitCode = 1;
