// THE REV. Editorial AI -> Reference V2 image planning
//
// Single active route:
// Editorial article
// -> Reference V2 image job
// -> GPT Image visual generation using the five approved cards + article-aware Content Reference
// -> deterministic Japanese typography overlay
// -> brand QA
// -> versioned JPGs + QA report
// -> Xserver stage/verify
// -> Review -> Publish.
//
// The release safety built in Phase 10 remains unchanged. Only the design
// engine is swapped from Classic V1 fixed layout to Reference V2.

import crypto from 'node:crypto';
import { getFile, putFile } from './githubContent.mjs';
import { REV_COLUMN_REFERENCE_V2 } from './editorialImageStyle.mjs';
import {
  buildImageHeadlineShort,
  validateImageHeadlineShort,
  imageCopyIsArticleTitle
} from './editorialImageCopy.mjs';

export const IMAGE_RENDER_VERSION = REV_COLUMN_REFERENCE_V2.renderVersion;
export const IMAGE_STYLE_TEMPLATE = REV_COLUMN_REFERENCE_V2.id;

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

export function selectBrandImageSourceDecision(article) {
  const category = String(article?.category || 'training');
  const text = articleText(article);
  const pick = (path, intent, reason) => ({ path, intent, reason });

  // Product-specific recovery scenes have the strongest semantic signal.
  if (category === 'recovery') {
    if (/denba|電場|デンバ/.test(text)) {
      return pick('assets/images/photo-solution-denba.jpg', 'recovery-denba', 'DENBA / 電場の内容に実機写真を対応');
    }
    if (/酸素|oxygen|オキシ/.test(text)) {
      return pick('assets/images/photo-oxyroom.jpg', 'recovery-oxygen-room', '酸素ルームの内容に実設備写真を対応');
    }
    return pick('assets/images/photo-solution-oxyroom.jpg', 'recovery-space', 'リカバリー記事に回復設備の実写を対応');
  }

  if (category === 'boxing') {
    return pick('assets/images/photo-boxing.jpg', 'boxing-action', 'ボクシング記事に実際のミット・指導シーンを対応');
  }

  // V2.1: articles about fatigue, decision-making, readiness or "how to start"
  // benefit more from a human coaching/check-in scene than an empty machine.
  if (/疲れ|疲労|仕事終わり|だる|眠|休む|休息|コンディション|調子|判断|軽く始め|無理|モチベーション/.test(text)) {
    return pick(
      'assets/images/trainer-coaching.jpg',
      'state-check-coaching',
      '疲労・当日の状態判断を、設備単体ではなくトレーナーと状態を確認する実写で表現'
    );
  }

  if (/フォーム|姿勢|動作|可動|指導|初心者|パーソナル|カウンセリング|体験|肩|腰|膝/.test(text)) {
    return pick(
      'assets/images/trainer-coaching.jpg',
      'coaching-form',
      'フォーム・姿勢・初心者・個別指導の内容にコーチング実写を対応'
    );
  }

  if (/ラック|マシン|器具|設備|evolgear|重量|負荷|筋力|ベンチ|スクワット|デッドリフト/.test(text)) {
    return pick(
      'assets/images/photo-evolgear.jpg',
      'training-equipment',
      '設備・負荷・筋力テーマにトレーニング設備の実写を対応'
    );
  }

  if (category === 'training') {
    return pick(
      'assets/images/photo-evolgear.jpg',
      'training-space',
      '一般トレーニング記事にTHE REV.の実設備写真を対応'
    );
  }

  return pick(
    'assets/images/trainer-coaching.jpg',
    'body-knowledge-coaching',
    '身体知識の記事は人の動き・指導との接続を優先'
  );
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

export function buildEditorialImagePlan(article) {
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

  const explicitSource = clean(article?.sourceImage || article?.image_source_path);
  const sourceDecision = explicitSource
    ? {
        path: explicitSource,
        intent: 'editor-specified',
        reason: 'Editorial側で明示指定されたContent Referenceを使用'
      }
    : selectBrandImageSourceDecision(article);
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
    generation_model: REV_COLUMN_REFERENCE_V2.generationModel,
    qa_model: REV_COLUMN_REFERENCE_V2.qaModel,
    qa_report_path: qaReportPath
  };

  return {
    status: 'PREPARING',
    strategy: explicitSource
      ? 'reference-v2-gpt-image-hybrid-explicit-source'
      : 'reference-v2-gpt-image-hybrid-auto-source',
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
  const plan = buildEditorialImagePlan(article);
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
  if (!qa || qa.pass !== true) {
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
