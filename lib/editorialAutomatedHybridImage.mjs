import crypto from 'node:crypto';
import { getFile, putFile, listDirectory } from './githubContent.mjs';
import {
  HYBRID_IMAGE_FORMAT,
  buildHybridImageJob,
  hybridAssetPaths
} from './editorialHybridImageFormat.mjs';
import {
  buildImageHeadlineShort,
  validateImageHeadlineShort
} from './editorialImageCopy.mjs';

const SOURCE_REGISTRY_PATH = 'editorial/automated-image-sources.json';
const QA_DIR = 'editorial/image-qa';
const RECENT_WINDOW = HYBRID_IMAGE_FORMAT.recentReferenceWindow;

function clean(value) {
  return String(value ?? '').trim();
}

function slugSafe(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function categoryLabel(category) {
  const map = {
    training: 'TRAINING',
    boxing: 'BOXING',
    recovery: 'RECOVERY',
    'body-knowledge': 'BODY KNOWLEDGE'
  };
  return map[clean(category).toLowerCase()] || 'BODY KNOWLEDGE';
}

export class AutomatedHybridImageError extends Error {
  constructor(code, message, { status = 422, detail = null } = {}) {
    super(message);
    this.name = 'AutomatedHybridImageError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function loadSourceRegistry() {
  const file = await getFile(SOURCE_REGISTRY_PATH);
  if (!file.exists || !file.content) {
    throw new AutomatedHybridImageError(
      'image_source_registry_missing',
      '自動Hybrid画像のContent Reference registryがGitHubにありません。',
      { status: 502 }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    throw new AutomatedHybridImageError(
      'image_source_registry_invalid',
      '自動Hybrid画像のContent Reference registryがJSONとして不正です。',
      { status: 502 }
    );
  }

  if (
    parsed?.drive_root_folder_id !== HYBRID_IMAGE_FORMAT.driveRootFolderId ||
    !Array.isArray(parsed?.sources) ||
    !parsed.sources.length
  ) {
    throw new AutomatedHybridImageError(
      'image_source_registry_invalid',
      '自動Hybrid画像のContent Reference registryがCurrent Truthと一致しません。',
      { status: 502 }
    );
  }

  return parsed;
}

async function recentHybridHistory(limit = RECENT_WINDOW) {
  let entries = [];
  try {
    entries = await listDirectory(QA_DIR);
  } catch {
    return [];
  }

  const candidates = entries
    .filter((x) => x.type === 'file' && /\.json$/i.test(x.name))
    .slice(-40);

  const rows = [];
  for (const entry of candidates) {
    try {
      const file = await getFile(entry.path);
      if (!file.exists || !file.content) continue;
      const qa = JSON.parse(file.content);
      if (
        qa?.pass !== true ||
        clean(qa?.review_mode).toUpperCase() !== 'HYBRID_GENERATED' ||
        !clean(qa?.checked_at)
      ) {
        continue;
      }
      rows.push({
        slug: clean(qa.slug),
        checkedAt: clean(qa.checked_at),
        driveFileId: clean(qa.background_source_drive_file_id),
        originVideoFileId: clean(qa.background_origin_video_file_id),
        contentReference: clean(qa.content_reference),
        assetVersion: clean(qa.asset_version)
      });
    } catch {
      // One malformed historical QA file must not block the current article.
    }
  }

  return rows
    .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))
    .slice(0, Math.max(0, Number(limit) || 0));
}

function sourceKeys(source) {
  return [
    clean(source.drive_file_id),
    clean(source.origin_video_file_id),
    clean(source.repo_path)
  ].filter(Boolean);
}

function recentKeys(history) {
  return new Set(
    history.flatMap((x) => [
      clean(x.driveFileId),
      clean(x.originVideoFileId),
      clean(x.contentReference)
    ]).filter(Boolean)
  );
}

function relevanceScore(source, article) {
  const category = clean(article?.category).toLowerCase();
  const text = [
    article?.title,
    article?.description,
    article?.body_markdown,
    article?.primary_query
  ].map((x) => clean(x).toLowerCase()).join(' ');

  let score = 1;
  if ((source.categories || []).map((x) => clean(x).toLowerCase()).includes(category)) {
    score += 8;
  }

  let keywordHits = 0;
  for (const keyword of source.keywords || []) {
    const token = clean(keyword).toLowerCase();
    if (token && text.includes(token)) keywordHits += 1;
  }
  score += Math.min(keywordHits, 6) * 2;

  return score;
}

async function selectSource(article) {
  const registry = await loadSourceRegistry();
  const history = await recentHybridHistory();
  const used = recentKeys(history);

  const ranked = [];
  for (const source of registry.sources) {
    if (!clean(source.repo_path) || !clean(source.drive_file_id)) continue;

    const repoFile = await getFile(source.repo_path);
    if (!repoFile.exists) continue;

    const blockedByRecent = sourceKeys(source).some((key) => used.has(key));
    ranked.push({
      source,
      score: relevanceScore(source, article),
      blockedByRecent
    });
  }

  const eligible = ranked
    .filter((x) => !x.blockedByRecent)
    .sort((a, b) => b.score - a.score);

  if (!eligible.length) {
    throw new AutomatedHybridImageError(
      'image_source_pool_exhausted',
      '直近4記事と重複しない、検証済みTHE REV. Content Referenceがありません。新しい実素材をregistryへ追加するまで画像生成を停止します。',
      {
        status: 409,
        detail: {
          recent: history,
          candidates: ranked.map((x) => ({
            source_id: x.source.source_id,
            score: x.score,
            blocked_by_recent: x.blockedByRecent
          }))
        }
      }
    );
  }

  return {
    ...eligible[0],
    recentHistory: history
  };
}

function sceneIntentFor(article, source) {
  const text = [
    article?.title,
    article?.description,
    article?.body_markdown,
    article?.primary_query
  ].map((x) => clean(x).toLowerCase()).join(' ');

  if (/健診|健康診断|血圧|血糖|脂質/.test(text)) {
    return 'THE REV.の実トレーニング空間で、一般顧客役の成人1人が運動を始める前にベンチ付近で落ち着いて自分の状態を確認し、無理なく始めようとしている静かな場面。高強度運動の最中ではなく、準備・判断の瞬間にする。トレーナー、スタッフ、コーチ、医療従事者は出さない。';
  }
  if (/疲労|疲れ|仕事終わり|だる/.test(text)) {
    return 'THE REV.の実トレーニング空間で、一般顧客役の成人1人が仕事終わりに来店し、その日の疲労を見ながら軽く始めるか判断している静かな場面。トレーナー、スタッフ、コーチは出さない。';
  }
  if (/酸素|oxy|denba|回復|リカバリー/.test(text)) {
    return 'THE REV.の実店舗で、一般顧客役の成人1人がトレーニング後の回復時間へ切り替えている穏やかな場面。施設の実構造を維持し、トレーナー、スタッフ、コーチは出さない。';
  }
  if (/ボクシング|boxing/.test(text)) {
    return 'THE REV.の実ボクシング空間で、一般顧客役の成人1人が安全に構えや基本動作を確認している場面。トレーナー、スタッフ、コーチは出さず、過度に激しいスパーリングにはしない。';
  }

  return `THE REV.の実空間で、一般顧客役の成人1人が記事テーマ「${clean(article?.title)}」を自然に想起させる静かな利用場面。広告的なポーズではなく実際の来店者らしい姿勢・表情にし、トレーナー、スタッフ、コーチは出さない。背景は${clean(source.scene_semantics)}`;
}

function stableAssetVersion(article, source, imageCopy) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      slug: clean(article?.slug),
      source: clean(source.drive_file_id),
      copy: clean(imageCopy),
      policy: HYBRID_IMAGE_FORMAT.policyRevision,
      layout: HYBRID_IMAGE_FORMAT.layoutTemplateId
    }))
    .digest('hex')
    .slice(0, 8);

  const lineage = slugSafe(source.lineage_key || source.source_id || 'source').slice(0, 24);
  return `reference-v24-auto-${lineage}-${digest}`;
}

function ensureCopy(article) {
  const copy = buildImageHeadlineShort({
    title: article?.title,
    description: article?.description,
    bodyMarkdown: article?.body_markdown,
    primaryQuery: article?.primary_query,
    imageHeadlineShort: article?.image_headline_short
  });
  const check = validateImageHeadlineShort(copy);
  if (!check.ok) {
    throw new AutomatedHybridImageError(
      'image_copy_invalid',
      `自動生成したEditorial CopyがV2.4規約を満たしません: ${check.errors.join(', ')}`,
      { status: 422 }
    );
  }
  return copy;
}

export async function prepareAutomatedHybridImageJob(article) {
  const slug = slugSafe(article?.slug);
  if (!slug || !clean(article?.title)) {
    throw new AutomatedHybridImageError(
      'image_article_invalid',
      '自動Hybrid画像にはslugとtitleが必要です。',
      { status: 422 }
    );
  }

  const imageCopy = ensureCopy(article);
  const selected = await selectSource(article);
  const source = selected.source;
  const assetVersion = stableAssetVersion(article, source, imageCopy);
  const paths = hybridAssetPaths(slug, assetVersion);
  const qaReportPath = `editorial/image-qa/${slug}-${assetVersion}.json`;

  const job = buildHybridImageJob({
    slug,
    title: clean(article.title),
    categoryLabel: clean(article.image_category_label) || categoryLabel(article.category),
    columnLabel: clean(article.image_series_label) || 'COLUMN',
    imageHeadlineShort: imageCopy,
    assetVersion,
    qaReportPath,
    backgroundSource: {
      driveFileId: clean(source.drive_file_id),
      cachedFrameDriveFileId: clean(source.cached_frame_drive_file_id),
      originVideoFileId: clean(source.origin_video_file_id),
      originVideoFileName: clean(source.origin_video_file_name || source.drive_file_name),
      framePositionRatio: source.frame_position_ratio ?? null,
      selectionReason: clean(source.selection_reason),
      treatment: 'real THE REV source preserved as spatial truth; scene-aware customer generation; crop/depth/light harmonization allowed'
    },
    sceneIntent: sceneIntentFor(article, source),
    generatedCustomerCount: 1
  });

  // The Responses image-generation tool returns image bytes as PNG by default.
  // Keep the generated scene lossless; the deterministic overlay renderer emits JPEG.
  job.generated_scene_path = `assets/images/editorial-generated/${slug}-${assetVersion}-scene.png`;
  job.automation = {
    mode: 'unattended-github-actions-v1',
    source_registry: SOURCE_REGISTRY_PATH,
    selected_source_id: source.source_id,
    source_repo_path: source.repo_path,
    recent_similarity_window: RECENT_WINDOW,
    recent_articles: selected.recentHistory
  };

  const jobPath = `editorial/hybrid-image-jobs/${slug}.json`;
  const body = JSON.stringify(job, null, 2) + '\n';
  const existing = await getFile(jobPath);
  if (!existing.exists || existing.content !== body) {
    await putFile({
      path: jobPath,
      content: body,
      message: `Queue automated Hybrid image: ${slug}`,
      sha: existing.exists ? existing.sha : null
    });
  }

  return {
    status: 'PREPARING',
    preserveReady: false,
    renderVersion: HYBRID_IMAGE_FORMAT.id,
    strategy: HYBRID_IMAGE_FORMAT.strategy,
    styleTemplate: HYBRID_IMAGE_FORMAT.styleTemplate,
    sourcePath: source.repo_path,
    imageHeadlineShort: imageCopy,
    categoryLabel: job.category_label,
    seriesLabel: job.column_label,
    assetVersion,
    jobPath,
    qaReportPath,
    generationModel: HYBRID_IMAGE_FORMAT.generationModel,
    qaModel: HYBRID_IMAGE_FORMAT.qaModel,
    thumbnail: paths.thumbnailPublicPath,
    ogImage: paths.ogPublicPath,
    qa: null,
    brandQaScore: null,
    attempts: null,
    assetReady: false,
    operatorRequired: false,
    automatedOperator: true,
    selectedSource: {
      source_id: source.source_id,
      repo_path: source.repo_path,
      drive_file_id: source.drive_file_id
    }
  };
}

export async function ensureAutomatedHybridImageJob(article) {
  const jobPath = clean(article?.image_job_path);
  const assetVersion = clean(article?.image_asset_version);
  if (jobPath && assetVersion) {
    const file = await getFile(jobPath);
    if (file.exists) {
      return {
        status: 'EXISTS',
        jobPath,
        assetVersion,
        thumbnail: clean(article?.thumbnail),
        ogImage: clean(article?.og_image)
      };
    }
  }
  return prepareAutomatedHybridImageJob(article);
}
