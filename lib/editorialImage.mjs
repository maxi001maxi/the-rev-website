// THE REV. Editorial AI -> deterministic column image planning (Phase 10 Classic)
//
// One route only:
// Editorial article -> image plan/job -> Playwright renderer -> versioned JPGs
// -> Xserver stage/verify -> Review -> Publish.
//
// The image model is intentionally NOT part of the final rendering path.
// This keeps Japanese text exact and makes every future card use the original
// five-column visual grammar.

import crypto from 'node:crypto';
import { getFile, putFile } from './githubContent.mjs';
import { REV_COLUMN_CLASSIC_V1 } from './editorialImageStyle.mjs';
import { buildImageHeadlineShort, validateImageHeadlineShort, imageCopyIsArticleTitle } from './editorialImageCopy.mjs';

export const IMAGE_RENDER_VERSION = 'rev-column-classic-v1';
export const IMAGE_STYLE_TEMPLATE = REV_COLUMN_CLASSIC_V1.id;

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

function slugSafe(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function articleText(article) {
  return [article?.title, article?.description, article?.bodyMarkdown, article?.primaryQuery]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function selectBrandImageSource(article) {
  const category = String(article?.category || 'training');
  const text = articleText(article);

  if (category === 'boxing') return 'assets/images/photo-boxing.jpg';

  if (category === 'recovery') {
    if (/denba|電場|デンバ/.test(text)) return 'assets/images/photo-solution-denba.jpg';
    if (/酸素|oxygen|オキシ/.test(text)) return 'assets/images/photo-oxyroom.jpg';
    return 'assets/images/photo-solution-oxyroom.jpg';
  }

  if (category === 'training') {
    if (/フォーム|姿勢|動作|指導|初心者|パーソナル|カウンセリング/.test(text)) {
      return 'assets/images/trainer-coaching.jpg';
    }
    return 'assets/images/photo-evolgear.jpg';
  }

  if (/姿勢|フォーム|動作|可動|肩|腰|膝/.test(text)) return 'assets/images/trainer-coaching.jpg';
  if (/疲れ|疲労|休|眠|仕事終わり|コンディション|回復/.test(text)) return 'assets/images/photo-evolgear.jpg';
  return 'assets/images/trainer-coaching.jpg';
}

// Retained as a reference helper for tests/documentation. Rendering no longer
// edits this raster master; the original five cards define the CSS grammar.
export function selectColumnMaster(article) {
  const category = String(article?.category || 'training');
  const text = articleText(article);
  if (category === 'boxing') return 'assets/images/blog/columns/column-04-boxing-master.jpg';
  if (category === 'recovery') return 'assets/images/blog/columns/column-05-recovery-master.jpg';
  if (category === 'training') {
    if (/体験|初回|選び方|チェック/.test(text)) return 'assets/images/blog/columns/column-03-trial-master.jpg';
    if (/追い込|限界|強度|疲労|疲れ|仕事終わり/.test(text)) return 'assets/images/blog/columns/column-02-push-master.jpg';
    return 'assets/images/blog/columns/column-01-frequency-master.jpg';
  }
  return 'assets/images/blog/columns/column-02-push-master.jpg';
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

function computeAssetVersion(planSeed) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(planSeed)).digest('hex').slice(0, 10);
  return `classic-v1-${digest}`;
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

export function buildEditorialImagePlan(article) {
  const slug = slugSafe(article?.slug);
  if (!slug) throw new EditorialImageError('image_plan_invalid', '画像設計にslugがありません。', { status: 422 });

  const imageHeadlineShort = buildImageHeadlineShort(article);
  const copyCheck = validateImageHeadlineShort(imageHeadlineShort);
  if (!copyCheck.ok) {
    throw new EditorialImageError('image_copy_invalid', `画像用コピーが不正です: ${copyCheck.errors.join(', ')}`, { status: 422 });
  }
  if (imageCopyIsArticleTitle(article, imageHeadlineShort)) {
    throw new EditorialImageError('image_copy_not_editorial', '画像用コピーが記事タイトルの丸写しです。短いEditorial Copyへ分離してください。', { status: 422 });
  }

  const sourceImage = clean(article?.sourceImage || article?.image_source_path) || selectBrandImageSource(article);
  const category = String(article?.category || 'body-knowledge');
  const categoryLabelValue = clean(article?.imageCategoryLabel || article?.image_category_label) || categoryLabel(category);
  const seriesLabel = clean(article?.imageSeriesLabel || article?.image_series_label || article?.columnLabel || article?.column_label) || 'COLUMN';

  const seed = {
    style: IMAGE_STYLE_TEMPLATE,
    slug,
    copy: imageHeadlineShort,
    sourceImage,
    categoryLabel: categoryLabelValue,
    seriesLabel
  };
  const assetVersion = clean(article?.assetVersion || article?.image_asset_version) || computeAssetVersion(seed);
  const paths = imagePathsForSlug(slug, assetVersion);
  const jobPath = `editorial/image-jobs/${slug}.json`;

  const job = {
    slug,
    category_label: categoryLabelValue,
    column_label: seriesLabel,
    article_title: clean(article?.title),
    image_headline_short: imageHeadlineShort,
    image_style_template: IMAGE_STYLE_TEMPLATE,
    source_image: sourceImage,
    asset_version: assetVersion
  };

  return {
    status: 'PREPARING',
    strategy: 'deterministic-browser-render-classic',
    renderVersion: IMAGE_RENDER_VERSION,
    styleTemplate: IMAGE_STYLE_TEMPLATE,
    imageHeadlineShort,
    categoryLabel: categoryLabelValue,
    seriesLabel,
    sourcePath: sourceImage,
    assetVersion,
    jobPath,
    job,
    assetReady: false,
    qa: {
      pass: true,
      mode: 'deterministic-browser-render',
      template: IMAGE_STYLE_TEMPLATE,
      exact_copy_from_job: true,
      article_title_separated: true
    },
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
      message: `Queue editorial image: ${plan.job.slug}`,
      sha: existing.exists ? existing.sha : null
    });
  }

  // If this exact version was rendered earlier, keep the same paths. Review
  // will still verify that both assets are publicly live before Publish.
  const [thumb, og] = await Promise.all([
    getFile(plan.thumbnailRepoPath),
    getFile(plan.ogRepoPath)
  ]);
  return {
    ...plan,
    githubAssetsExist: thumb.exists && og.exists
  };
}

async function publicAssetSizeMatches(publicPath, expectedSize, env = process.env) {
  const base = String(env.PRODUCTION_URL || 'https://therev-lab.com').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  timer.unref?.();
  try {
    const res = await fetch(`${base}${publicPath}?phase10_classic=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });
    if (!res.ok) return false;
    const bytes = (await res.arrayBuffer()).byteLength;
    return bytes === Number(expectedSize);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkEditorialImageReady(draft, { env = process.env } = {}) {
  const thumbnail = String(draft?.thumbnail || '').trim();
  const ogImage = String(draft?.og_image || '').trim();
  const toRepo = (value) => value.startsWith('/assets/') ? value.slice(1) : null;
  const thumbPath = toRepo(thumbnail);
  const ogPath = toRepo(ogImage);
  if (!thumbPath || !ogPath) return { ready: false, reason: 'paths_missing' };

  const [thumb, og] = await Promise.all([getFile(thumbPath), getFile(ogPath)]);
  if (!thumb.exists || !og.exists) return { ready: false, reason: 'github_assets_missing' };

  const [thumbLive, ogLive] = await Promise.all([
    publicAssetSizeMatches(thumbnail, thumb.size, env),
    publicAssetSizeMatches(ogImage, og.size, env)
  ]);

  if (!thumbLive || !ogLive) return { ready: false, reason: 'xserver_assets_pending' };

  return {
    ready: true,
    reason: null,
    qa: {
      ...(draft?.image_qa || {}),
      pass: true,
      mode: 'deterministic-browser-render',
      template: IMAGE_STYLE_TEMPLATE,
      github_assets_present: true,
      xserver_live_verify_passed: true,
      article_title_separated: true
    }
  };
}
