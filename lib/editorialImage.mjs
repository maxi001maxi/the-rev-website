// THE REV. Editorial AI -> Reference V2 image planning
//
// Single active route:
// Editorial article
// -> Reference V2 image job
// -> article-aware selection of an existing THE REV. Content Reference
// -> deterministic source-photo-locked composition (crop/resize only)
// -> exact Japanese typography overlay
// -> brand QA including source-photo fidelity
// -> versioned JPGs + QA report
// -> Xserver stage/verify
// -> Review -> Publish.
//
// The release safety built in Phase 10 remains unchanged. Only the design
// engine is swapped from Classic V1 fixed layout to Reference V2.

import crypto from 'node:crypto';
import { getFile, putFile, listDirectory } from './githubContent.mjs';
import { REV_COLUMN_REFERENCE_V2 } from './editorialImageStyle.mjs';
import { hybridQaReady as hybridFormatQaReady } from './editorialHybridImageFormat.mjs';
import { evaluateEditorialImageReview } from './editorialImageReviewGate.mjs';
import {
  buildImageHeadlineShort,
  validateImageHeadlineShort,
  imageCopyIsArticleTitle
} from './editorialImageCopy.mjs';

export const IMAGE_RENDER_VERSION = REV_COLUMN_REFERENCE_V2.renderVersion;
export const IMAGE_STYLE_TEMPLATE = REV_COLUMN_REFERENCE_V2.id;
export const RECENT_CONTENT_REFERENCE_WINDOW = 4;
export const CONTENT_REFERENCE_SELECTION_POLICY = 'relevance-first-lineage-recency-v2';
export const CONTENT_REFERENCE_USAGE_REGISTRY_PATH = 'editorial/content-reference-usage.json';

export class EditorialImageError extends Error {
  constructor(code, message, { status = 502, detail = null } = {}) {
    super(message);
    this.name = 'EditorialImageError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function slugSafe(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function articleText(article) {
  return [article?.title, article?.description, article?.bodyMarkdown, article?.primaryQuery]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function sourceCandidates(article) {
  const category = String(article?.category || 'training');
  const text = articleText(article);
  const pick = (path, intent, reason, relevanceLevel = 'secondary') => ({
    path,
    intent,
    reason,
    relevanceLevel,
    relevanceScore:
      relevanceLevel === 'primary' ? 3 :
      relevanceLevel === 'secondary' ? 2 : 1
  });

  if (category === 'recovery') {
    if (/denba|電場|デンバ/.test(text)) {
      return [pick('assets/images/photo-solution-denba.jpg', 'recovery-denba', 'DENBA / 電場の内容に実機写真を対応', 'primary')];
    }
    if (/酸素|oxygen|オキシ/.test(text)) {
      return [pick('assets/images/photo-oxyroom.jpg', 'recovery-oxygen-room', '酸素ルームの内容に実設備写真を対応', 'primary')];
    }
    return [
      pick('assets/images/photo-solution-oxyroom.jpg', 'recovery-space', 'リカバリー記事に回復設備の実写を対応', 'primary'),
      pick('assets/images/photo-oxyroom.jpg', 'recovery-oxygen-room', 'リカバリー設備の別実写候補', 'primary')
    ];
  }

  if (category === 'boxing') {
    return [
      pick('assets/images/photo-boxing.jpg', 'boxing-environment', 'ボクシング記事にTHE REV.の実ボクシング環境を対応', 'primary'),
      pick('assets/images/photo-lobby.jpg', 'boxing-arrival', '人物を使わず来店文脈を補完', 'secondary')
    ];
  }

  // V2.2: 「行くまで / 帰るまで」の生活動線テーマは、コーチング写真より
  // 来店・移動を想起できるロビー実写を優先する。
  if (/時間がない|通い|通う|仕事帰り|準備|移動|着替え|帰宅|ルーティン|習慣|出発/.test(text)) {
    return [
      pick('assets/images/photo-lobby.jpg', 'arrival-routine', '準備・移動・来店・帰宅までの生活動線をロビー実写で表現', 'primary'),
      pick('assets/images/photo-evolgear.jpg', 'arrival-training-space', '人物を使わず実トレーニング空間で補完', 'secondary')
    ];
  }

  if (/疲れ|疲労|仕事終わり|だる|眠|休む|休息|コンディション|調子|判断|軽く始め|無理|モチベーション/.test(text)) {
    return [
      pick('assets/images/photo-evolgear.jpg', 'state-check-training-space', '疲労・当日の状態判断を人物なしの実トレーニング環境で表現', 'primary'),
      pick('assets/images/photo-lobby.jpg', 'state-check-arrival', '疲労日の来店判断を生活動線の実写で補完', 'secondary')
    ];
  }

  if (/フォーム|姿勢|動作|可動|指導|初心者|パーソナル|カウンセリング|体験|肩|腰|膝/.test(text)) {
    return [
      pick('assets/images/photo-evolgear.jpg', 'form-training-context', 'フォーム・姿勢・初心者テーマを人物なしの実トレーニング環境で表現', 'primary'),
      pick('assets/images/photo-lobby.jpg', 'form-arrival-context', '個別指導前後の来店文脈を人物なしで補完', 'secondary')
    ];
  }

  if (/ラック|マシン|器具|設備|evolgear|重量|負荷|筋力|ベンチ|スクワット|デッドリフト/.test(text)) {
    return [
      pick('assets/images/photo-evolgear.jpg', 'training-equipment', '設備・負荷・筋力テーマにトレーニング設備の実写を対応', 'primary'),
      pick('assets/images/photo-lobby.jpg', 'training-arrival', '人物を使わず施設文脈を補完', 'secondary')
    ];
  }

  if (category === 'training') {
    return [
      pick('assets/images/photo-evolgear.jpg', 'training-space', '一般トレーニング記事にTHE REV.の実設備写真を対応', 'primary'),
      pick('assets/images/photo-lobby.jpg', 'training-arrival', '継続・来店文脈を人物なしの実施設で補完', 'secondary')
    ];
  }

  return [
    pick('assets/images/photo-evolgear.jpg', 'body-knowledge-training', '身体知識を人物なしの実トレーニング環境へ接続', 'primary'),
    pick('assets/images/photo-lobby.jpg', 'body-knowledge-lifestyle', '身体知識を日常・来店文脈へ接続', 'secondary')
  ];
}

export function selectBrandImageSourceDecision(article) {
  return sourceCandidates(article)[0];
}

async function recentContentReferenceHistory(currentSlug, limit = RECENT_CONTENT_REFERENCE_WINDOW) {
  let entries = [];
  try {
    entries = await listDirectory('editorial/image-jobs');
  } catch {
    return [];
  }

  const jobs = [];
  for (const entry of entries.filter((x) => x.type === 'file' && /\.json$/i.test(x.name))) {
    try {
      const file = await getFile(entry.path);
      if (!file.exists || !file.content) continue;
      const job = JSON.parse(file.content);
      if (!job?.slug || job.slug === currentSlug || !job?.content_reference) continue;

      let checkedAt = '';
      let qaPassed = false;
      if (job.qa_report_path) {
        const qaFile = await getFile(job.qa_report_path);
        if (qaFile.exists && qaFile.content) {
          try {
            const qa = JSON.parse(qaFile.content);
            checkedAt = String(qa?.checked_at || '');
            qaPassed = qa?.pass === true;
          } catch {}
        }
      }

      if (!qaPassed || !checkedAt) continue;

      jobs.push({
        slug: String(job.slug),
        contentReference: String(job.content_reference),
        checkedAt
      });
    } catch {
      // 重複チェックの補助情報取得に失敗しても、画像生成本体は止めない。
    }
  }

  return jobs
    .filter((x) => x.checkedAt)
    .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))
    .slice(0, Math.max(0, Number(limit) || 0));
}

function markdownFrontMatterValue(content, key) {
  const prefix = `${key}:`;
  const line = String(content || '')
    .split(/\r?\n/)
    .find((row) => row.startsWith(prefix));
  if (!line) return '';
  const raw = line.slice(prefix.length).trim();
  if (!raw) return '';
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try { return clean(JSON.parse(raw)); } catch {}
  }
  return clean(raw);
}

async function historicalContentReferenceUsage(currentSlug) {
  const merged = new Map();
  const add = (item) => {
    if (!item?.slug || item.slug === currentSlug || !item.contentReference) return;
    const key = `${item.slug}::${item.contentReference}`;
    if (!merged.has(key)) merged.set(key, item);
  };

  // 1) Legacy seed registry for articles created before lineage metadata existed.
  try {
    const file = await getFile(CONTENT_REFERENCE_USAGE_REGISTRY_PATH);
    if (file.exists && file.content) {
      const parsed = JSON.parse(file.content);
      for (const x of (Array.isArray(parsed?.usages) ? parsed.usages : [])) {
        if (!x || String(x.status || '').toLowerCase() === 'rejected') continue;
        add({
          slug: String(x.slug || ''),
          title: String(x.title || ''),
          contentReference: String(x.content_reference || ''),
          status: String(x.status || ''),
          published: String(x.published || ''),
          provenance: String(x.provenance || 'legacy-registry')
        });
      }
    }
  } catch {
    // Legacy registry is a fallback. Published Markdown below is the durable source.
  }

  // 2) Published Markdown automatically records lineage for all new articles.
  try {
    const entries = await listDirectory('content/blog');
    for (const entry of entries.filter((x) => x.type === 'file' && /\.md$/i.test(x.name))) {
      try {
        const file = await getFile(entry.path);
        if (!file.exists || !file.content) continue;
        const slug = markdownFrontMatterValue(file.content, 'slug');
        const contentReference = markdownFrontMatterValue(file.content, 'content_reference');
        const status = markdownFrontMatterValue(file.content, 'status');
        if (!slug || !contentReference || status !== 'published') continue;
        add({
          slug,
          title: markdownFrontMatterValue(file.content, 'title'),
          contentReference,
          status,
          published: markdownFrontMatterValue(file.content, 'published'),
          provenance: 'published-markdown'
        });
      } catch {
        // One malformed article must not break image planning.
      }
    }
  } catch {
    // Keep legacy registry results if content directory lookup is temporarily unavailable.
  }

  return [...merged.values()];
}

export function selectContentReferenceWithHistory(article, recentHistory = [], historicalUsage = []) {
  const candidates = sourceCandidates(article);
  if (!candidates.length) {
    throw new EditorialImageError('content_reference_missing', '記事に適したContent Reference候補がありません。', { status: 422 });
  }

  const history = recentHistory
    .filter((x) => x?.contentReference)
    .slice(0, RECENT_CONTENT_REFERENCE_WINDOW);
  const recentRefs = history.map((x) => x.contentReference);
  const lineage = historicalUsage.filter((x) => x?.contentReference);
  const lineageRefs = lineage.map((x) => x.contentReference);

  // 正本仕様:
  // 1. 記事との関連性を最優先する。まず最高relevanceの候補だけを残す。
  // 2. その同格候補内で、過去記事で一度も使っていない実写真を優先する。
  // 3. 次に、直近4記事で未使用の実写真を優先する。
  // 4. すべて使用済みなら、直近4記事で最も久しく使っていない写真を選ぶ。
  // 5. 重複回避だけを理由に関連性の低い候補へ降格しない。
  const bestRelevance = Math.max(...candidates.map((x) => Number(x.relevanceScore || 0)));
  const relevantPool = candidates.filter((x) => Number(x.relevanceScore || 0) === bestRelevance);

  const recencyIndex = (path) => recentRefs.indexOf(path);
  const everUsed = (path) => lineageRefs.includes(path);
  const recencyDistance = (path) => {
    const i = recencyIndex(path);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };

  const selected = [...relevantPool].sort((a, b) => {
    const aEver = everUsed(a.path);
    const bEver = everUsed(b.path);
    if (aEver !== bEver) return aEver ? 1 : -1;

    const da = recencyDistance(a.path);
    const db = recencyDistance(b.path);
    if (da !== db) return db - da;

    return candidates.indexOf(a) - candidates.indexOf(b);
  })[0];

  const defaultCandidate = relevantPool[0];
  const selectedRecentIndex = recencyIndex(selected.path);
  const defaultRecentIndex = recencyIndex(defaultCandidate.path);
  const selectedEverUsed = everUsed(selected.path);
  const defaultEverUsed = everUsed(defaultCandidate.path);
  const avoidedHistoricalRepeat =
    selected.path !== defaultCandidate.path &&
    defaultEverUsed &&
    !selectedEverUsed;
  const avoidedRecentRepeat =
    selected.path !== defaultCandidate.path &&
    defaultRecentIndex >= 0 &&
    selectedRecentIndex < 0;
  const repeatedDueToRelevance =
    selectedEverUsed &&
    relevantPool.every((x) => everUsed(x.path));

  return {
    ...selected,
    avoidedHistoricalRepeat,
    avoidedRecentRepeat,
    repeatedDueToRelevance,
    everUsedBefore: selectedEverUsed,
    historicalMatches: lineage.filter((x) => x.contentReference === selected.path),
    historicalUsage: lineage,
    recentReferences: recentRefs,
    recentHistory: history,
    selectionPolicy: CONTENT_REFERENCE_SELECTION_POLICY,
    relevantCandidatePool: relevantPool.map((x) => ({
      path: x.path,
      intent: x.intent,
      relevanceLevel: x.relevanceLevel,
      ever_used_before: everUsed(x.path),
      recent_4_used: recencyIndex(x.path) >= 0
    }))
  };
}

export function selectBrandImageSource(article) {
  return selectBrandImageSourceDecision(article).path;
}

function categoryLabel(category) {
  const map = {
    training: 'TRAINING',
    boxing: 'BOXING',
    recovery: 'RECOVERY',
    'body-knowledge': 'BODY KNOWLEDGE'
  };
  return map[String(category || '')] || 'COLUMN';
}

function computeAssetVersion(seed) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(seed))
    .digest('hex')
    .slice(0, 10);
  return `reference-v2-${digest}`;
}

export function imagePathsForSlug(slug, assetVersion = '') {
  const safe = slugSafe(slug);
  const version = slugSafe(assetVersion);
  const suffix = version ? `-${version}` : '';
  return {
    thumbnailRepoPath: `assets/images/blog/thumb-${safe}${suffix}.jpg`,
    ogRepoPath: `assets/images/blog/og/og-${safe}${suffix}.jpg`,
    thumbnailPublicPath: `/assets/images/blog/thumb-${safe}${suffix}.jpg`,
    ogPublicPath: `/assets/images/blog/og/og-${safe}${suffix}.jpg`
  };
}

export function qaReportPathFor(slug, assetVersion) {
  return `editorial/image-qa/${slugSafe(slug)}-${slugSafe(assetVersion)}.json`;
}

export function buildEditorialImagePlan(article, {
  sourceDecisionOverride = null,
  recentHistory = [],
  historicalUsage = []
} = {}) {
  const slug = slugSafe(article?.slug);
  if (!slug) {
    throw new EditorialImageError('image_plan_invalid', '画像設計にslugがありません。', { status: 422 });
  }

  const imageHeadlineShort = cleanMultiline(buildImageHeadlineShort(article));
  const copyCheck = validateImageHeadlineShort(imageHeadlineShort);
  if (!copyCheck.ok) {
    throw new EditorialImageError(
      'image_copy_invalid',
      `画像用コピーが不正です: ${copyCheck.errors.join(', ')}`,
      { status: 422 }
    );
  }
  if (imageCopyIsArticleTitle(article, imageHeadlineShort)) {
    throw new EditorialImageError(
      'image_copy_not_editorial',
      '画像用コピーが記事タイトルの丸写しです。短いEditorial Copyへ分離してください。',
      { status: 422 }
    );
  }

  const explicitSource = clean(article?.sourceImage);
  const sourceDecision = explicitSource
    ? {
        path: explicitSource,
        intent: 'editor-specified',
        reason: 'Editorial側で明示指定されたContent Referenceを使用',
        avoidedHistoricalRepeat: false,
        avoidedRecentRepeat: false,
        repeatedDueToRelevance: false,
        everUsedBefore: historicalUsage.some((x) => x.contentReference === explicitSource),
        historicalMatches: historicalUsage.filter((x) => x.contentReference === explicitSource),
        historicalUsage,
        recentReferences: recentHistory.map((x) => x.contentReference),
        recentHistory,
        selectionPolicy: 'editor-specified',
        relevantCandidatePool: []
      }
    : (sourceDecisionOverride || selectContentReferenceWithHistory(article, recentHistory, historicalUsage));
  const sourceImage = sourceDecision.path;
  const category = String(article?.category || 'body-knowledge');
  const categoryLabelValue =
    clean(article?.imageCategoryLabel || article?.image_category_label) ||
    categoryLabel(category);
  const seriesLabel =
    clean(
      article?.imageSeriesLabel ||
      article?.image_series_label ||
      article?.columnLabel ||
      article?.column_label
    ) || 'COLUMN';

  const styleReferences = [...REV_COLUMN_REFERENCE_V2.styleReferences];
  const seed = {
    style: IMAGE_STYLE_TEMPLATE,
    promptRevision: REV_COLUMN_REFERENCE_V2.promptRevision,
    slug,
    copy: imageHeadlineShort,
    sourceImage,
    contentReferenceIntent: sourceDecision.intent,
    categoryLabel: categoryLabelValue,
    seriesLabel,
    styleReferences,
    generationModel: REV_COLUMN_REFERENCE_V2.generationModel,
    qaModel: REV_COLUMN_REFERENCE_V2.qaModel
  };

  const assetVersion =
    clean(article?.assetVersion || article?.image_asset_version) ||
    computeAssetVersion(seed);
  const paths = imagePathsForSlug(slug, assetVersion);
  const jobPath = `editorial/image-jobs/${slug}.json`;
  const qaReportPath = qaReportPathFor(slug, assetVersion);

  const job = {
    slug,
    article_title: clean(article?.title),
    category_label: categoryLabelValue,
    column_label: seriesLabel,
    image_headline_short: imageHeadlineShort,
    image_style_template: IMAGE_STYLE_TEMPLATE,
    style_references: styleReferences,
    content_reference: sourceImage,
    content_reference_intent: sourceDecision.intent,
    content_reference_reason: sourceDecision.reason,
    asset_version: assetVersion,
    render_mode: 'source-photo-lock-v1',
    content_preservation: 'crop-resize-only',
    publish_requires_human_approval: true,
    fallback_reason: clean(article?.fallbackReason || article?.image_fallback_reason),
    generation_model: REV_COLUMN_REFERENCE_V2.generationModel,
    qa_model: REV_COLUMN_REFERENCE_V2.qaModel,
    qa_report_path: qaReportPath,
    recent_reference_guard: {
      window: RECENT_CONTENT_REFERENCE_WINDOW,
      selection_policy: sourceDecision.selectionPolicy || CONTENT_REFERENCE_SELECTION_POLICY,
      priority_order: ['article_relevance', 'never_used_in_past_articles', 'not_used_in_recent_4', 'least_recently_used'],
      recent_articles: (sourceDecision.recentHistory || []).map((x) => ({
        slug: x.slug,
        content_reference: x.contentReference,
        checked_at: x.checkedAt
      })),
      recent_content_references: sourceDecision.recentReferences || [],
      historical_usage_registry: CONTENT_REFERENCE_USAGE_REGISTRY_PATH,
      historical_matching_articles: (sourceDecision.historicalMatches || []).map((x) => ({
        slug: x.slug,
        title: x.title,
        status: x.status,
        published: x.published,
        provenance: x.provenance
      })),
      ever_used_before: sourceDecision.everUsedBefore === true,
      relevant_candidate_pool: sourceDecision.relevantCandidatePool || [],
      selected_content_reference: sourceImage,
      selected_relevance_level: sourceDecision.relevanceLevel || null,
      avoided_historical_repeat: sourceDecision.avoidedHistoricalRepeat === true,
      avoided_repeat: sourceDecision.avoidedRecentRepeat === true,
      repeated_due_to_relevance: sourceDecision.repeatedDueToRelevance === true
    }
  };

  return {
    status: 'PREPARING',
    strategy: explicitSource
      ? 'reference-v2-source-lock-explicit-source'
      : 'reference-v2-source-lock-auto-source',
    renderVersion: IMAGE_RENDER_VERSION,
    styleTemplate: IMAGE_STYLE_TEMPLATE,
    imageHeadlineShort,
    categoryLabel: categoryLabelValue,
    seriesLabel,
    sourcePath: sourceImage,
    sourceIntent: sourceDecision.intent,
    sourceReason: sourceDecision.reason,
    styleReferences,
    generationModel: REV_COLUMN_REFERENCE_V2.generationModel,
    qaModel: REV_COLUMN_REFERENCE_V2.qaModel,
    assetVersion,
    jobPath,
    qaReportPath,
    job,
    assetReady: false,
    thumbnail: paths.thumbnailPublicPath,
    ogImage: paths.ogPublicPath,
    thumbnailRepoPath: paths.thumbnailRepoPath,
    ogRepoPath: paths.ogRepoPath
  };
}

export async function prepareEditorialImageJob(article) {
  const slug = slugSafe(article?.slug);
  const [recentHistory, historicalUsage] = await Promise.all([
    recentContentReferenceHistory(slug, RECENT_CONTENT_REFERENCE_WINDOW),
    historicalContentReferenceUsage(slug)
  ]);
  const sourceDecision = clean(article?.sourceImage)
    ? null
    : selectContentReferenceWithHistory(article, recentHistory, historicalUsage);
  const plan = buildEditorialImagePlan(article, {
    sourceDecisionOverride: sourceDecision,
    recentHistory,
    historicalUsage
  });
  const body = JSON.stringify(plan.job, null, 2) + '\n';
  const existing = await getFile(plan.jobPath);

  if (!existing.exists || existing.content !== body) {
    await putFile({
      path: plan.jobPath,
      content: body,
      message: `Queue Reference V2 image: ${plan.job.slug}`,
      sha: existing.exists ? existing.sha : null
    });
  }

  const [thumb, og, qa] = await Promise.all([
    getFile(plan.thumbnailRepoPath),
    getFile(plan.ogRepoPath),
    getFile(plan.qaReportPath)
  ]);

  return {
    ...plan,
    githubAssetsExist: thumb.exists && og.exists,
    githubQaExists: qa.exists
  };
}

async function publicAssetSizeMatches(publicPath, expectedSize, env = process.env) {
  const base = String(env.PRODUCTION_URL || 'https://therev-lab.com').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  timer.unref?.();

  try {
    const res = await fetch(
      `${base}${publicPath}?phase10_reference_v2=${Date.now()}`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal
      }
    );
    if (!res.ok) return false;
    const bytes = (await res.arrayBuffer()).byteLength;
    return bytes === Number(expectedSize);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function parseQaReport(file) {
  if (!file?.exists || !file.content) return null;
  try {
    const parsed = JSON.parse(file.content);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function checkEditorialImageReady(draft, { env = process.env } = {}) {
  const thumbnail = String(draft?.thumbnail || '').trim();
  const ogImage = String(draft?.og_image || '').trim();
  const gbpImage = String(draft?.gbp_image || '').trim();
  const gbpRequired = Boolean(String(draft?.gbp_image_asset_version || '').trim());
  const toRepo = (value) => value.startsWith('/assets/') ? value.slice(1) : null;
  const thumbPath = toRepo(thumbnail);
  const ogPath = toRepo(ogImage);
  const gbpPath = gbpImage ? toRepo(gbpImage) : null;

  if (!thumbPath || !ogPath || (gbpRequired && !gbpPath)) {
    return { ready: false, reason: gbpRequired && !gbpPath ? 'gbp_path_missing' : 'paths_missing' };
  }

  const qaReportPath =
    String(draft?.image_qa_report_path || '').trim() ||
    qaReportPathFor(draft?.slug, draft?.image_asset_version);

  const [thumb, og, gbp, qaFile] = await Promise.all([
    getFile(thumbPath),
    getFile(ogPath),
    gbpRequired ? getFile(gbpPath) : Promise.resolve({ exists: false, size: 0 }),
    getFile(qaReportPath)
  ]);

  if (!thumb.exists || !og.exists || (gbpRequired && !gbp.exists)) {
    return { ready: false, reason: gbpRequired && !gbp.exists ? 'github_gbp_asset_missing' : 'github_assets_missing' };
  }

  const qa = parseQaReport(qaFile);
  // V2.4 publish readiness is Hybrid-only. Source-lock QA can still be
  // generated for diagnostics, but it never promotes an Editorial AI draft to READY.
  const hybridQaReady = hybridFormatQaReady(draft, qa);
  const imageReview = qa ? evaluateEditorialImageReview({ draft, qa }) : { ok: false, errors: ['画像QAがありません。'] };

  if (!qa || !hybridQaReady || !imageReview.ok) {
    return {
      ready: false,
      reason: qa ? 'brand_qa_failed' : 'brand_qa_missing',
      qa
    };
  }

  const [thumbLive, ogLive, gbpLive] = await Promise.all([
    publicAssetSizeMatches(thumbnail, thumb.size, env),
    publicAssetSizeMatches(ogImage, og.size, env),
    gbpRequired ? publicAssetSizeMatches(gbpImage, gbp.size, env) : Promise.resolve(true)
  ]);

  if (!thumbLive || !ogLive || !gbpLive) {
    return { ready: false, reason: gbpRequired && !gbpLive ? 'xserver_gbp_asset_pending' : 'xserver_assets_pending', qa };
  }

  return {
    ready: true,
    reason: null,
    qa: {
      ...qa,
      pass: true,
      template: IMAGE_STYLE_TEMPLATE,
      github_assets_present: true,
      xserver_live_verify_passed: true,
      gbp_image_required: gbpRequired,
      gbp_github_asset_present: gbpRequired ? gbp.exists === true : null,
      gbp_xserver_live_verify_passed: gbpRequired ? gbpLive === true : null,
      article_title_separated: true
    }
  };
}
