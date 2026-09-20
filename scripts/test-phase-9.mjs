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
  RECENT_CONTENT_REFERENCE_WINDOW,
  CONTENT_REFERENCE_SELECTION_POLICY,
  buildEditorialImagePlan,
  imagePathsForSlug,
  qaReportPathFor,
  selectBrandImageSource,
  selectBrandImageSourceDecision,
  selectContentReferenceWithHistory
} from '../lib/editorialImage.mjs';
import {
  buildImageHeadlineShort,
  imageCopyIsArticleTitle,
  validateImageHeadlineShort
} from '../lib/editorialImageCopy.mjs';
import { REV_COLUMN_REFERENCE_V2 } from '../lib/editorialImageStyle.mjs';
import {
  HYBRID_IMAGE_FORMAT,
  buildHybridImageJob,
  hybridAssetPaths,
  hybridGenerationBrief,
  hybridImageInfoFromDraft,
  hybridQaReady,
  isHybridImageFormat,
  shouldPreserveHybridImageOnEditorialSync
} from '../lib/editorialHybridImageFormat.mjs';

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
assert(IMAGE_RENDER_VERSION === 'rev-column-reference-v2.2', 'Reference V2.2を画像Render Version正本に固定');
assert(IMAGE_STYLE_TEMPLATE === 'rev-column-reference-v2', 'Reference V2を画像Style正本に固定');
assert(REV_COLUMN_REFERENCE_V2.styleReferences.length === 5, '旧5記事すべてをStyle Referencesとして保持');
assert(REV_COLUMN_REFERENCE_V2.generationModel === 'source-photo-lock-playwright', '提供実写を生成改変しないsource-photo-lockを既定化');
assert(REV_COLUMN_REFERENCE_V2.qaModel === 'gpt-5.6-luna', 'Vision Brand QAモデルを既定化');

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
const fatigueDecision = selectBrandImageSourceDecision(fatigueArticle);
assert(selectBrandImageSource(fatigueArticle) === 'assets/images/trainer-coaching.jpg', '疲労・判断系は設備単体よりコーチング実写を選ぶ');
assert(fatigueDecision.intent === 'state-check-coaching', 'Content Referenceの選定意図を保持');
assert(Boolean(fatigueDecision.reason), 'Content Referenceの選定理由を保持');
assert(RECENT_CONTENT_REFERENCE_WINDOW === 4, 'Content Reference重複チェック窓を直近4記事へ固定');
assert(CONTENT_REFERENCE_SELECTION_POLICY === 'relevance-first-lineage-recency-v2', '関連性優先・過去使用履歴・直近4記事の正本ポリシーを固定');

const fatigueRecent = [
  { slug: 'prev-1', contentReference: 'assets/images/trainer-coaching.jpg', checkedAt: '2026-09-19T09:00:00Z' },
  { slug: 'prev-2', contentReference: 'assets/images/photo-lobby.jpg', checkedAt: '2026-09-18T09:00:00Z' },
  { slug: 'prev-3', contentReference: 'assets/images/photo-evolgear.jpg', checkedAt: '2026-09-17T09:00:00Z' },
  { slug: 'prev-4', contentReference: 'assets/images/trainer-top.jpg', checkedAt: '2026-09-16T09:00:00Z' }
];
const fatigueWithHistory = selectContentReferenceWithHistory(fatigueArticle, fatigueRecent);
assert(
  fatigueWithHistory.path === 'assets/images/trainer-top.jpg',
  '同格候補が直近4記事ですべて使用済みなら最も久しく使っていない実写真を選ぶ'
);
assert(fatigueWithHistory.repeatedDueToRelevance === false, '過去使用Registryがない場合はhistorical reuse扱いにしない');

const legacyUsage = [
  {
    slug: 'personal-gym-trial-checkpoints',
    title: 'パーソナルジムの体験では何を見る？入会前に確認したい5つのこと',
    contentReference: 'assets/images/trainer-coaching.jpg',
    status: 'published',
    published: '2026-09-13',
    provenance: 'legacy-confirmed-by-owner'
  }
];
const fatigueWithLegacy = selectContentReferenceWithHistory(fatigueArticle, [], legacyUsage);
assert(
  fatigueWithLegacy.path === 'assets/images/trainer-top.jpg',
  '同じ関連性なら過去記事で未使用の実写真を優先し、trial記事とのtrainer-coaching重複を回避'
);
assert(fatigueWithLegacy.avoidedHistoricalRepeat === true, '過去記事との重複回避を監査情報へ記録');
assert(fatigueWithLegacy.everUsedBefore === false, '選択画像が過去記事で未使用か判定');

const genericBodyArticle = {
  title: '身体の状態を知るために大切なこと',
  slug: 'body-state-basics',
  description: '身体の状態と個別の見方を考える。',
  bodyMarkdown: '身体を見ながら調整します。',
  category: 'body-knowledge'
};
const genericRecent = [
  { slug: 'prev-a', contentReference: 'assets/images/trainer-coaching.jpg', checkedAt: '2026-09-19T09:00:00Z' },
  { slug: 'prev-b', contentReference: 'assets/images/photo-lobby.jpg', checkedAt: '2026-09-18T09:00:00Z' }
];
const genericDecision = selectContentReferenceWithHistory(genericBodyArticle, genericRecent);
assert(
  genericDecision.path === 'assets/images/trainer-top.jpg',
  '同じ関連性レベル内では直近4記事で未使用のContent Referenceを優先'
);
assert(genericDecision.avoidedRecentRepeat === true, '同格候補での短期間再利用回避を記録');
assert(genericDecision.selectionPolicy === CONTENT_REFERENCE_SELECTION_POLICY, '選定ポリシーを監査可能に保持');

const plan = buildEditorialImagePlan(fatigueArticle, {
  recentHistory: [],
  historicalUsage: legacyUsage
});
assert(plan.styleTemplate === 'rev-column-reference-v2', 'Reference V2 templateで画像Jobを設計');
assert(plan.imageHeadlineShort === shortCopy, 'Jobへ短い画像コピーを渡す');
assert(plan.seriesLabel === 'COLUMN 06', 'Column番号をJobへ保持');
assert(plan.styleReferences.length === 5, 'Jobへ承認済み旧5記事をすべて渡す');
assert(plan.sourcePath === 'assets/images/trainer-top.jpg', '記事関連性を維持しつつ過去未使用のTHE REV.実写をContent Referenceへ設定');
assert(plan.sourceIntent === 'state-check-guidance', 'Job planへContent Reference intentを保持');
assert(plan.strategy === 'reference-v2-source-lock-auto-source', 'source-photo-lock自動選定をstrategyに記録');
assert(/^reference-v2-[a-f0-9]{10}$/.test(plan.assetVersion), '画像versionをReference V2内容ハッシュで固定');
assert(
  plan.assetVersion === buildEditorialImagePlan(fatigueArticle, { historicalUsage: legacyUsage }).assetVersion,
  '同じ履歴入力は同じReference V2.2 asset versionへ決定論的に固定'
);
assert(plan.generationModel === 'source-photo-lock-playwright', 'Jobにsource-photo-lock rendererを保持');
assert(plan.qaModel === 'gpt-5.6-luna', 'JobにBrand QAモデルを保持');
assert(plan.qaReportPath === qaReportPathFor(fatigueArticle.slug, plan.assetVersion), 'QA report pathをversioned assetと紐付け');
assert(plan.job.style_references.length === 5 && plan.job.content_reference === plan.sourcePath, 'Style ReferencesとContent Referenceの役割を分離');
assert(plan.job.render_mode === 'source-photo-lock-v1', 'Content Referenceは生成せずcrop/resizeのみで使用');
assert(plan.job.content_preservation === 'crop-resize-only', '提供素材の保持ポリシーをJobへ固定');
assert(plan.job.publish_requires_human_approval === true, '画像準備後もHuman Review & Publish必須');
assert(plan.job.content_reference_intent === plan.sourceIntent && Boolean(plan.job.content_reference_reason), 'JobへContent Reference provenanceを保持');
assert(plan.job.recent_reference_guard.window === 4, 'Jobへ直近4記事の参照窓を保持');
assert(plan.job.recent_reference_guard.selection_policy === CONTENT_REFERENCE_SELECTION_POLICY, 'Jobへ関連性優先ポリシーを保持');
assert(plan.job.recent_reference_guard.priority_order[0] === 'article_relevance', '記事関連性を最優先として記録');
assert(plan.job.recent_reference_guard.priority_order[1] === 'never_used_in_past_articles', '過去未使用を同格候補内の第2優先に設定');
assert(plan.job.recent_reference_guard.avoided_historical_repeat === true, 'Jobへ過去記事重複回避結果を保持');
assert(plan.job.recent_reference_guard.recent_articles.length === 0, '直近履歴なしでも選定可能');
assert(plan.job.recent_reference_guard.historical_matching_articles.length === 0, '選択したtrainer-topには過去使用記事がない');
assert(plan.thumbnail.includes(`-${plan.assetVersion}.jpg`), 'Thumbnailはversioned filename');
assert(plan.ogImage.includes(`-${plan.assetVersion}.jpg`), 'OGPはversioned filename');

console.log('\n[6. Reference V2.3 Hybrid format]');
assert(HYBRID_IMAGE_FORMAT.id === 'rev-column-reference-v2.3-hybrid', 'V2.3 Hybrid format IDを正本化');
assert(HYBRID_IMAGE_FORMAT.strategy === 'reference-v2-gpt-image-hybrid-drive-source', 'Hybrid image strategyを正本化');
assert(HYBRID_IMAGE_FORMAT.driveRootFolderId === '1I2qrLVBSlnC035b6U6z76dtyHXNc-6iG', '指定DriveルートだけをContent Reference正本に固定');
assert(HYBRID_IMAGE_FORMAT.sourcePolicy.fullDriveSearchAllowed === false, 'Drive全体検索を禁止');
assert(HYBRID_IMAGE_FORMAT.sourcePolicy.videoFrameAllowed === true, '指定Drive動画のフレーム利用を許可');
assert(HYBRID_IMAGE_FORMAT.generationPolicy.generatedCustomerAllowed === true, '生成人物は顧客役のみ許可');
assert(HYBRID_IMAGE_FORMAT.generationPolicy.unknownTrainerForbidden === true, '未知トレーナー生成を禁止');
assert(HYBRID_IMAGE_FORMAT.generationPolicy.nonCustomerPeopleForbidden === true, '顧客以外の第三者生成を禁止');
assert(HYBRID_IMAGE_FORMAT.generationPolicy.realTheRevEnvironmentRequired === true, '実THE REV.環境を背景正本として必須化');
assert(HYBRID_IMAGE_FORMAT.designGrammar.mode === 'editorial-not-rigid-template', '固定座標テンプレではなくデザイン文法として運用');
assert(HYBRID_IMAGE_FORMAT.output.thumbnail.width === 1200 && HYBRID_IMAGE_FORMAT.output.thumbnail.height === 675, 'Thumbnailを1200x675へ固定');
assert(HYBRID_IMAGE_FORMAT.output.ogp.width === 1200 && HYBRID_IMAGE_FORMAT.output.ogp.height === 630, 'OGPを1200x630へ固定');
assert(HYBRID_IMAGE_FORMAT.acceptedReferences.length >= 2, '承認済み2記事をStyle Referenceとして保持');
assert(HYBRID_IMAGE_FORMAT.publishBoundary === 'REVIEW_AND_PUBLISH', '公開境界をReview & Publishへ固定');

const hybridJob = buildHybridImageJob({
  slug: 'sample-hybrid-article',
  title: 'サンプル記事',
  categoryLabel: 'BODY KNOWLEDGE',
  columnLabel: 'COLUMN 08',
  imageHeadlineShort: '実空間から、\n誌面をつくる。',
  assetVersion: 'reference-v23-hybrid-sample',
  qaReportPath: 'editorial/image-qa/sample-hybrid-article-reference-v23-hybrid-sample.json',
  backgroundSource: {
    cachedFrameDriveFileId: 'drive-frame-1',
    originVideoFileId: 'video-1',
    originVideoFileName: 'sample.mov',
    framePositionRatio: 0.4
  }
});
assert(hybridJob.render_version === HYBRID_IMAGE_FORMAT.id, 'Hybrid Jobへformat IDを保持');
assert(hybridJob.image_strategy === HYBRID_IMAGE_FORMAT.strategy, 'Hybrid Jobへstrategyを保持');
assert(hybridJob.policy.drive_root_folder_id === HYBRID_IMAGE_FORMAT.driveRootFolderId, 'Hybrid Jobへ指定Driveルートを保持');
assert(hybridJob.policy.generated_customer_allowed === true && hybridJob.policy.unknown_trainer_forbidden === true, 'Hybrid Jobへ人物ルールを保持');
assert(hybridJob.publish_requires_human_approval === true, 'Hybrid JobはHuman Reviewを必須化');
const hybridPaths = hybridAssetPaths('sample-hybrid-article', 'reference-v23-hybrid-sample');
assert(hybridJob.thumbnail === hybridPaths.thumbnailRepoPath && hybridJob.og_image === hybridPaths.ogRepoPath, 'Hybrid Jobのversioned asset pathを決定論的に生成');
assert(isHybridImageFormat({ image_render_version: hybridJob.render_version, image_strategy: hybridJob.image_strategy }) === true, 'Hybrid format判定が正しい');
const goodHybridQa = {
  pass: true,
  series_consistency: 9,
  editorial_quality: 9,
  article_visual_relevance: 10,
  rev_environment_consistency: 10,
  brand_space_authenticity: 10,
  source_material_scope_pass: true,
  unknown_trainer_present: false,
  non_customer_people_present: false,
  customer_only_or_no_people: true,
  expected_copy_present: true,
  copy_legible: true,
  too_promotional: false
};
const hybridDraftForQa = { image_render_version: HYBRID_IMAGE_FORMAT.id, image_strategy: HYBRID_IMAGE_FORMAT.strategy, image_qa: goodHybridQa };
assert(hybridQaReady(hybridDraftForQa) === true, '承認済みHybrid QCはREADY');
assert(hybridQaReady({ ...hybridDraftForQa, image_qa: { ...goodHybridQa, unknown_trainer_present: true } }) === false, '未知トレーナーがいればHybrid QCを拒否');
assert(hybridQaReady({ ...hybridDraftForQa, image_qa: { ...goodHybridQa, rev_environment_consistency: 7 } }) === false, 'THE REV.環境整合が8未満なら拒否');

const readyHybridDraft = {
  ...hybridDraftForQa,
  slug: 'sample-hybrid-article',
  title: 'サンプル記事',
  category: 'body-knowledge',
  image_status: 'READY',
  image_asset_ready: true,
  image_headline_short: '実空間から、\n誌面をつくる。',
  image_style_template: HYBRID_IMAGE_FORMAT.styleTemplate,
  image_source_path: 'assets/images/editorial-source/drive/sample.jpg',
  image_asset_version: 'reference-v23-hybrid-sample',
  image_job_path: 'editorial/hybrid-image-jobs/sample-hybrid-article.json',
  image_qa_report_path: 'editorial/image-qa/sample-hybrid-article-reference-v23-hybrid-sample.json',
  image_generation_model: HYBRID_IMAGE_FORMAT.generationModel,
  image_qa_model: HYBRID_IMAGE_FORMAT.qaModel,
  image_brand_qa_score: 9,
  thumbnail: '/assets/images/blog/thumb-sample-hybrid-article-reference-v23-hybrid-sample.jpg',
  og_image: '/assets/images/blog/og/og-sample-hybrid-article-reference-v23-hybrid-sample.jpg'
};
assert(
  shouldPreserveHybridImageOnEditorialSync(readyHybridDraft, {
    slug: readyHybridDraft.slug,
    title: readyHybridDraft.title,
    category: readyHybridDraft.category
  }) === true,
  'Editorial本文の再同期では承認済みHybrid画像を保持'
);
assert(
  shouldPreserveHybridImageOnEditorialSync(readyHybridDraft, {
    slug: readyHybridDraft.slug,
    title: '画像意味が変わる別タイトル',
    category: readyHybridDraft.category
  }) === false,
  '記事タイトルが変わればHybrid画像を自動保持しない'
);
assert(
  shouldPreserveHybridImageOnEditorialSync(readyHybridDraft, {
    slug: readyHybridDraft.slug,
    title: readyHybridDraft.title,
    category: readyHybridDraft.category,
    imageHeadlineShort: '別の画像コピー'
  }) === false,
  '明示画像コピー変更時はHybrid画像を自動保持しない'
);
const preservedHybridInfo = hybridImageInfoFromDraft(readyHybridDraft);
assert(
  preservedHybridInfo.preserveReady === true &&
  preservedHybridInfo.thumbnail === readyHybridDraft.thumbnail &&
  preservedHybridInfo.assetVersion === readyHybridDraft.image_asset_version,
  '既存Hybrid DraftからREADY imageInfoを再構成'
);
const hybridBrief = hybridGenerationBrief({
  articleTitle: 'サンプル記事',
  editorialCopy: '実空間から、誌面をつくる。',
  categoryLabel: 'BODY KNOWLEDGE',
  columnLabel: 'COLUMN 08'
});
assert(hybridBrief.includes('未知のトレーナー') && hybridBrief.includes('固定テンプレ'), '生成Briefへ禁止事項と非固定テンプレ方針を含める');

const equipmentArticle = {
  title: '筋トレの負荷はどう決める？ラックと重量設定の考え方',
  slug: 'training-load-equipment',
  description: '設備と負荷設定を考える。',
  bodyMarkdown: 'ラックや重量、筋力に合わせて負荷を調整します。',
  category: 'training'
};
assert(selectBrandImageSource(equipmentArticle) === 'assets/images/photo-evolgear.jpg', '設備・重量テーマはEVOLGEAR実写を選ぶ');

const imgPaths = imagePathsForSlug(fatigueArticle.slug, plan.assetVersion);
assert(imgPaths.thumbnailPublicPath === plan.thumbnail, 'Thumbnail公開パスをplanと一致');
assert(imgPaths.ogPublicPath === plan.ogImage, 'OGP公開パスをplanと一致');

console.log(`\nPhase 9/10 tests: ${passed} passed / ${failed.length} failed`);
if (failed.length) process.exitCode = 1;
