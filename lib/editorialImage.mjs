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
import {
  buildImageHeadlineShort,
  validateImageHeadlineShort,
  imageCopyIsArticleTitle
} from './editorialImageCopy.mjs';

export const IMAGE_RENDER_VERSION = REV_COLUMN_REFERENCE_V2.renderVersion;
export const IMAGE_STYLE_TEMPLATE = REV_COLUMN_REFERENCE_V2.id;
export const RECENT_CONTENT_REFERENCE_WINDOW = 4;

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
  const pick = (path, intent, reason) => ({ path, intent, reason });

  if (category === 'recovery') {
    if (/denba|電場|デンバ/.test(text)) {
      return [pick('assets/images/photo-solution-denba.jpg', 'recovery-denba', 'DENBA / 電場の内容に実機写真を対応')];
    }
    if (/酸素|oxygen|オキシ/.test(text)) {
      return [pick('assets/images/photo-oxyroom.jpg', 'recovery-oxygen-room', '酸素ルームの内容に実設備写真を対応')];
    }
    return [
      pick('assets/images/photo-solution-oxyroom.jpg', 'recovery-space', 'リカバリー記事に回復設備の実写を対応'),
      pick('assets/images/photo-oxyroom.jpg', 'recovery-oxygen-room', '直近重複を避けつつリカバリー設備の文脈を維持')
    ];
  }

  if (category === 'boxing') {
    return [pick('assets/images/photo-boxing.jpg', 'boxing-action', 'ボクシング記事に実際のミット・指導シーンを対応')];
  }

  // V2.2: 「行くまで / 帰るまで」の生活動線テーマは、コーチング写真より
  // 来店・移動を想起できるロビー実写を優先する。
  if (/時間がない|通い|通う|仕事帰り|準備|移動|着替え|帰宅|ルーティン|習慣|出発/.test(text)) {
    return [
      pick('assets/images/photo-lobby.jpg', 'arrival-routine', '準備・移動・来店・帰宅までの生活動線をロビー実写で表現'),
      pick('assets/images/trainer-top.jpg', 'arrival-guidance', '来店・継続テーマを人物の存在感で補完'),
      pick('assets/images/trainer-coaching.jpg', 'state-check-coaching', '個別調整の文脈をコーチング実写で表現')
    ];
  }

  if (/疲れ|疲労|仕事終わり|だる|眠|休む|休息|コンディション|調子|判断|軽く始め|無理|モチベーション/.test(text)) {
    return [
      pick('assets/images/trainer-coaching.jpg', 'state-check-coaching', '疲労・当日の状態判断をトレーナーと状態を確認する実写で表現'),
      pick('assets/images/photo-lobby.jpg', 'state-check-arrival', '疲労日の来店判断を生活動線の実写で補完'),
      pick('assets/images/photo-evolgear.jpg', 'light-training-space', '軽く始める選択肢をトレーニング空間で表現')
    ];
  }

  if (/フォーム|姿勢|動作|可動|指導|初心者|パーソナル|カウンセリング|体験|肩|腰|膝/.test(text)) {
    return [
      pick('assets/images/trainer-coaching.jpg', 'coaching-form', 'フォーム・姿勢・初心者・個別指導の内容にコーチング実写を対応'),
      pick('assets/images/trainer-top.jpg', 'trainer-guidance', '直近重複を避けつつ指導者の存在を維持'),
      pick('assets/images/photo-evolgear.jpg', 'training-context', '指導が行われる実トレーニング環境を補完')
    ];
  }

  if (/ラック|マシン|器具|設備|evolgear|重量|負荷|筋力|ベンチ|スクワット|デッドリフト/.test(text)) {
    return [
      pick('assets/images/photo-evolgear.jpg', 'training-equipment', '設備・負荷・筋力テーマにトレーニング設備の実写を対応'),
      pick('assets/images/trainer-top.jpg', 'training-guidance', '設備テーマを人の利用文脈で補完'),
      pick('assets/images/trainer-coaching.jpg', 'coaching-context', '設備を使う個別指導の文脈で補完')
    ];
  }

  if (category === 'training') {
    return [
      pick('assets/images/photo-evolgear.jpg', 'training-space', '一般トレーニング記事にTHE REV.の実設備写真を対応'),
      pick('assets/images/trainer-top.jpg', 'training-guidance', '直近重複を避けつつトレーニング文脈を維持'),
      pick('assets/images/photo-lobby.jpg', 'training-arrival', '継続・来店文脈を実施設で補完')
    ];
  }

  return [
    pick('assets/images/trainer-coaching.jpg', 'body-knowledge-coaching', '身体知識の記事は人の動き・指導との接続を優先'),
    pick('assets/images/trainer-top.jpg', 'body-knowledge-trainer', '直近重複を避けつつ人物中心の身体知識文脈を維持'),
    pick('assets/images/photo-lobby.jpg', 'body-knowledge-lifestyle', '身体知識を日常・来店文脈へ接続'),
    pick('assets/images/photo-evolgear.jpg', 'body-knowledge-training', '身体知識を実トレーニング環境へ接続')
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
      if (job.qa_report_path) {
        const qaFile = await getFile(job.qa_report_path);
        if (qaFile.exists && qaFile.content) {
          try { checkedAt = String(JSON.parse(qaFile.content)?.checked_at || ''); } catch {}
        }
      }

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

function selectSourceAvoidingRecent(article, recentHistory = []) {
  const candidates = sourceCandidates(article);
  if (candidates.length <= 1) {
    return {
      ...candidates[0],
      avoidedRecentRepeat: false,
      recentReferences: recentHistory.map((x) => x.contentReference)
    };
  }

  const recentRefs = recentHistory.map((x) => x.contentReference);
  const unused = candidates.find((x) => !recentRefs.includes(x.path));
  const selected = unused || candidates[0];

  return {
    ...selected,
    avoidedRecentRepeat: selected.path !== candidates[0].path,
    recentReferences: recentRefs
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

export function buildEditorialImagePlan(article, { sourceDecisionOverride = null, recentHistory = [] } = {}) {
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
        avoidedRecentRepeat: false,
        recentReferences: recentHistory.map((x) => x.contentReference)
      }
    : (sourceDecisionOverride || selectSourceAvoidingRecent(article, recentHistory));
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
    generation_model: REV_COLUMN_REFERENCE_V2.generationModel,
    qa_model: REV_COLUMN_REFERENCE_V2.qaModel,
    qa_report_path: qaReportPath,
    recent_reference_guard: {
      window: RECENT_CONTENT_REFERENCE_WINDOW,
      recent_content_references: sourceDecision.recentReferences || [],
      selected_content_reference: sourceImage,
      avoided_repeat: sourceDecision.avoidedRecentRepeat === true
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
  const recentHistory = await recentContentReferenceHistory(slug, RECENT_CONTENT_REFERENCE_WINDOW);
  const sourceDecision = clean(article?.sourceImage)
    ? null
    : selectSourceAvoidingRecent(article, recentHistory);
  const plan = buildEditorialImagePlan(article, { sourceDecisionOverride: sourceDecision, recentHistory });
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
  const toRepo = (value) => value.startsWith('/assets/') ? value.slice(1) : null;
  const thumbPath = toRepo(thumbnail);
  const ogPath = toRepo(ogImage);

  if (!thumbPath || !ogPath) {
    return { ready: false, reason: 'paths_missing' };
  }

  const qaReportPath =
    String(draft?.image_qa_report_path || '').trim() ||
    qaReportPathFor(draft?.slug, draft?.image_asset_version);

  const [thumb, og, qaFile] = await Promise.all([
    getFile(thumbPath),
    getFile(ogPath),
    getFile(qaReportPath)
  ]);

  if (!thumb.exists || !og.exists) {
    return { ready: false, reason: 'github_assets_missing' };
  }

  const qa = parseQaReport(qaFile);
  if (
    !qa ||
    qa.pass !== true ||
    Number(qa.source_identity_preservation || 0) < 9 ||
    qa.invented_people_or_objects !== false ||
    qa.source_photo_changed_materially !== false
  ) {
    return {
      ready: false,
      reason: qa ? 'brand_qa_failed' : 'brand_qa_missing',
      qa
    };
  }

  const [thumbLive, ogLive] = await Promise.all([
    publicAssetSizeMatches(thumbnail, thumb.size, env),
    publicAssetSizeMatches(ogImage, og.size, env)
  ]);

  if (!thumbLive || !ogLive) {
    return { ready: false, reason: 'xserver_assets_pending', qa };
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
      article_title_separated: true
    }
  };
}
