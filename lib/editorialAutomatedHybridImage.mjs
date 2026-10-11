import { categoryLabelFor } from '../assets/js/blog-taxonomy.mjs';
import { SCENE_PLAUSIBILITY_VERSION } from './editorialScenePlausibility.mjs';
import { SCENE_GROUNDING_VERSION, SEMANTIC_RECENT_WINDOW, planGroundedScene, groundedSceneBrief } from './editorialSceneGrounding.mjs';
import crypto from 'node:crypto';
import { getFile, putFile, listDirectory } from './githubContent.mjs';
import {
  HYBRID_IMAGE_FORMAT,
  buildHybridImageJob,
  hybridAssetPaths
} from './editorialHybridImageFormat.mjs';
import {
  selectUniqueImageHeadlineShort,
  validateImageHeadlineShort
} from './editorialImageCopy.mjs';

const SOURCE_REGISTRY_PATH = 'editorial/automated-image-sources.json';
const QA_DIR = 'editorial/image-qa';
const RECENT_WINDOW = HYBRID_IMAGE_FORMAT.recentReferenceWindow;
const RECENT_COPY_WINDOW = 25;
const RECENT_PRESENTATION_WINDOW = 6;

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
  return categoryLabelFor(clean(category).toLowerCase()) || 'COLUMN';
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
  } catch (error) {
    if (limit === Infinity) throw new Error('image copy history unavailable', { cause:error });
    return [];
  }

  const candidates = entries
    .filter((x) => x.type === 'file' && /\.json$/i.test(x.name))
    ;

  const rows = [];
  for (const entry of candidates) {
    try {
      const file = await getFile(entry.path);
      if (!file.exists || !file.content) {
        if (limit === Infinity) throw new Error('image copy QA unreadable: ' + entry.path);
        continue;
      }
      const qa = JSON.parse(file.content);
      if (
        qa?.pass !== true ||
        clean(qa?.review_mode).toUpperCase() !== 'HYBRID_GENERATED' ||
        !clean(qa?.checked_at)
      ) {
        continue;
      }
      const slug = clean(qa.slug);
      let imageHeadlineShort = clean(qa.image_headline_short);
      let customerPresentation = clean(qa.customer_presentation);
      let articleTitle = clean(qa.article_title);
      if (slug && (!imageHeadlineShort || !customerPresentation || !articleTitle)) {
        try {
          const jobFile = await getFile(`editorial/hybrid-image-jobs/${slug}.json`);
          if (jobFile.exists && jobFile.content) {
            const historicalJob = JSON.parse(jobFile.content);
            imageHeadlineShort ||= clean(historicalJob.image_headline_short);
            customerPresentation ||= clean(historicalJob.customer_presentation);
            articleTitle ||= clean(historicalJob.article_title);
          }
        } catch (error) {
          if (limit === Infinity && !imageHeadlineShort) throw error;
        }
      }
      rows.push({
        slug,
        checkedAt: clean(qa.checked_at),
        driveFileId: clean(qa.background_source_drive_file_id),
        originVideoFileId: clean(qa.background_origin_video_file_id),
        contentReference: clean(qa.content_reference),
        assetVersion: clean(qa.asset_version),
        imageHeadlineShort,
        customerPresentation,
        articleTitle,
        sceneFingerprint: qa.scene_fingerprint || null,
        thumbnail: hybridAssetPaths(slug,qa.asset_version).thumbnailRepoPath
      });
    } catch (error) {
      if (limit === Infinity) throw error;
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

async function selectSource(article, semanticHistory = []) {
  const registry = await loadSourceRegistry();
  const seen = new Set();
  const history = semanticHistory.filter(r=>r.slug!==article.slug && !seen.has(r.slug) && seen.add(r.slug)).slice(0,RECENT_WINDOW);
  const used = recentKeys(history);

  const ranked = [];
  for (const source of registry.sources) {
    if (!clean(source.repo_path) || !clean(source.drive_file_id)) continue;

    const repoFile = await getFile(source.repo_path);
    if (!repoFile.exists) continue;

    const blockedByRecent = sourceKeys(source).some((key) => used.has(key));
    let scenePlan;
    try { scenePlan = planGroundedScene(article,source,semanticHistory); } catch { continue; }
    ranked.push({
      source,
      scenePlan,
      score: relevanceScore(source, article),
      blockedByRecent
    });
  }

  const eligible = ranked
    .filter((x) => !x.blockedByRecent)
    .sort((a, b) => b.score - a.score || a.scenePlan.similarity.penalty - b.scenePlan.similarity.penalty);

  if (!eligible.length) {
    // Product/component explainers may have exactly one source that actually contains
    // the required real equipment. Prefer grounded truth over an unrelated fresh
    // background, but only after at least three intervening articles and only when
    // the scene plan explicitly requires real equipment from that source.
    const relevanceFallback = ranked
      .filter((x) => x.blockedByRecent && Array.isArray(x.scenePlan?.required_equipment) && x.scenePlan.required_equipment.length > 0)
      .map((x) => {
        const keys = new Set(sourceKeys(x.source));
        const priorIndex = history.findIndex((row) => [row.driveFileId,row.originVideoFileId,row.contentReference].some((v) => keys.has(clean(v))));
        return {...x, priorIndex};
      })
      .filter((x) => x.priorIndex >= 3)
      .sort((a,b) => b.score-a.score || a.scenePlan.similarity.penalty-b.scenePlan.similarity.penalty);
    if (relevanceFallback.length) {
      return {
        ...relevanceFallback[0],
        recentHistory: history,
        repeatedDueToRelevance: true,
        repeatDistance: relevanceFallback[0].priorIndex
      };
    }
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
            blocked_by_recent: x.blockedByRecent,
            required_equipment: x.scenePlan?.required_equipment || []
          }))
        }
      }
    );
  }

  return {
    ...eligible[0],
    recentHistory: history,
    repeatedDueToRelevance: false,
    repeatDistance: null
  };
}

export function sceneIntentFor(article, source) {
  if (source?.scene_inventory) {
    const plan=planGroundedScene(article,source);
    return groundedSceneBrief(plan,source.scene_inventory);
  }
  const text = [
    article?.title,
    article?.description,
    article?.body_markdown,
    article?.primary_query
  ].map((x) => clean(x).toLowerCase()).join(' ');

  if (/新大宮/.test(text) && /(ジム|パーソナルジム)/.test(text) && /(選び|選ぶ|比較|設備)/.test(text)) {
    return '一般顧客役の成人1人が自分に合うジムを考える、始める前の自然な瞬間。実背景の場所と設備位置を維持し、受付で器具を操作しない。設備を追加・移動しない。トレーナー、スタッフ、コーチは出さない。';
  }
  if (/健診|健康診断|血圧|血糖|脂質/.test(text)) {
    return 'THE REV.の実ロビーの席またはベンチで、一般顧客役の成人1人が健診結果らしい紙を静かに見て考える、運動を始める前の自然な瞬間。紙の細かな文字は読めなくてよい。血圧測定・血圧計・医療機器・診察行為は描かない。記事の結論を写真で直訳する必要はない。トレーナー、スタッフ、コーチ、医療従事者は出さない。';
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

function stableAssetVersion(article, source, imageCopy, customerPresentation) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      slug: clean(article?.slug),
      source: clean(source.drive_file_id),
      copy: clean(imageCopy),
      customerPresentation: clean(customerPresentation),
      policy: HYBRID_IMAGE_FORMAT.policyRevision,
      layout: HYBRID_IMAGE_FORMAT.layoutTemplateId,
      designRevision: HYBRID_IMAGE_FORMAT.designRevision,
      layoutVariant: HYBRID_IMAGE_FORMAT.defaultLayoutVariant,
      scenePlausibility: SCENE_PLAUSIBILITY_VERSION
      ,sceneGrounding: SCENE_GROUNDING_VERSION
    }))
    .digest('hex')
    .slice(0, 8);

  const lineage = slugSafe(source.lineage_key || source.source_id || 'source').slice(0, 24);
  return `reference-v26-grounded-auto-${lineage}-${digest}`;
}

function selectCustomerPresentation(article, history = []) {
  const explicit = clean(article?.image_customer_presentation).toLowerCase();
  if (explicit === 'male' || explicit === 'female') return explicit;

  const recent = history
    .map((row) => clean(row.customerPresentation).toLowerCase())
    .filter((value) => value === 'male' || value === 'female')
    .slice(0, RECENT_PRESENTATION_WINDOW);

  if (recent[0] === 'male') return 'female';
  if (recent[0] === 'female') return 'male';

  const digest = crypto.createHash('sha256').update(clean(article?.slug) || clean(article?.title)).digest('hex');
  return parseInt(digest.slice(0, 2), 16) % 2 === 0 ? 'female' : 'male';
}

function ensureCopy(article, recentHistory = []) {
  const selection = selectUniqueImageHeadlineShort({
    title: article?.title,
    description: article?.description,
    bodyMarkdown: article?.body_markdown,
    primaryQuery: article?.primary_query,
    imageHeadlineShort: article?.image_headline_short
  }, recentHistory.map((row) => row.imageHeadlineShort).filter(Boolean), { window: RECENT_COPY_WINDOW });

  if (!selection.copy) {
    throw new AutomatedHybridImageError(
      'image_copy_recently_repeated',
      '全履歴の完全一致または直近25件の近似を避けるThumbnail Copyがありません。記事の切り口または明示Copyを変えるまで画像生成を停止します。',
      {
        status: 409,
        detail: {
          recent_thumbnail_headlines: selection.recentHeadlines,
          blocked_candidates: selection.blockedCandidates
        }
      }
    );
  }

  const check = validateImageHeadlineShort(selection.copy);
  if (!check.ok) {
    throw new AutomatedHybridImageError(
      'image_copy_invalid',
      `自動生成したEditorial Copyが規約を満たしません: ${check.errors.join(', ')}`,
      { status: 422 }
    );
  }
  return selection.copy;
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

  const recentEditorialHistory = (await recentHybridHistory(Infinity))
    .filter((row) => clean(row.slug) !== slug);
  // Include every canonical job, even a pending job that has reserved its copy.
  const jobEntries = await listDirectory('editorial/hybrid-image-jobs');
  const copies = [];
  for (const entry of jobEntries.filter(e=>e.type==='file' && e.name.endsWith('.json') && e.name!=='_template.json')) {
    const file = await getFile(entry.path);
    if (!file.exists || !file.content) throw new Error('image copy history unavailable');
    const historic = JSON.parse(file.content);
    if (historic.slug !== slug && historic.image_headline_short) copies.push({imageHeadlineShort:historic.image_headline_short});
  }
  const imageCopy = ensureCopy(article, [...recentEditorialHistory, ...copies]);
  const customerPresentation = selectCustomerPresentation(article, recentEditorialHistory);
  const seenSemantic = new Set();
  const semanticHistory = recentEditorialHistory.filter(r=>!seenSemantic.has(r.slug) && seenSemantic.add(r.slug)).slice(0,SEMANTIC_RECENT_WINDOW);
  const selected = await selectSource(article,semanticHistory);
  const source = selected.source;
  const assetVersion = stableAssetVersion(article, source, imageCopy, customerPresentation);
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
    sceneIntent: groundedSceneBrief(selected.scenePlan, source.scene_inventory),
    generatedCustomerCount: 1,
    customerPresentation
  });

  // The Responses image-generation tool returns image bytes as PNG by default.
  // Keep the generated scene lossless; the deterministic overlay renderer emits JPEG.
  job.scene_plausibility_version = SCENE_PLAUSIBILITY_VERSION;
  job.scene_grounding_version = SCENE_GROUNDING_VERSION;
  job.scene_plan = selected.scenePlan;
  job.source_scene_inventory = source.scene_inventory;
  job.policy.scene_plausibility_version = SCENE_PLAUSIBILITY_VERSION;
  job.generated_scene_path = `assets/images/editorial-generated/${slug}-${assetVersion}-scene.png`;

  const warmupArticle = /(ストレッチ|ウォームアップ|準備運動)/.test([
    article?.title, article?.description, article?.body_markdown, article?.primary_query
  ].map(clean).join(' ')) && /(運動前|筋トレ|ボクシング|ランニング)/.test([
    article?.title, article?.description, article?.body_markdown, article?.primary_query
  ].map(clean).join(' '));
  if (warmupArticle) {
    job.composition_hint = 'Medium three-quarter editorial portrait. Customer is the dominant visual subject at roughly 60-70% attention, framed close enough that face and dynamic warm-up action remain obvious at small-card size. Preserve the exact source geometry and equipment positions. Do not create extra floor/walls/windows/storage or a wider gym. Use strong but natural shallow depth-of-field: keep one THE REV anchor recognizable while racks, weight stacks and other equipment remain visibly soft and secondary.';
    const preferredEmphasis = ['動く準備。','動く準備を。','動きにつなげる。']
      .find((phrase) => imageCopy.includes(phrase));
    if (preferredEmphasis) job.typography_emphasis_text = preferredEmphasis;
  }

  job.automation = {
    mode: 'unattended-github-actions-v1',
    source_registry: SOURCE_REGISTRY_PATH,
    selected_source_id: source.source_id,
    source_repo_path: source.repo_path,
    recent_similarity_window: RECENT_WINDOW,
    recent_articles: selected.recentHistory,
    recent_semantic_articles: semanticHistory,
    repeated_due_to_relevance: selected.repeatedDueToRelevance === true,
    repeat_distance: selected.repeatDistance ?? null,
    recent_thumbnail_copy_window: RECENT_COPY_WINDOW,
    recent_thumbnail_headlines: recentEditorialHistory
      .map((row) => row.imageHeadlineShort)
      .filter(Boolean)
      .slice(0, RECENT_COPY_WINDOW),
    recent_customer_presentations: recentEditorialHistory
      .map((row) => row.customerPresentation)
      .filter(Boolean)
      .slice(0, RECENT_PRESENTATION_WINDOW)
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
    gbpImage: paths.gbpPublicPath,
    gbpImageStatus: 'PREPARING',
    gbpImageAssetVersion: assetVersion,
    gbpImageQa: null,
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
        ogImage: clean(article?.og_image),
        gbpImage: clean(article?.gbp_image),
        gbpImageStatus: clean(article?.gbp_image_status),
        gbpImageAssetVersion: clean(article?.gbp_image_asset_version)
      };
    }
  }
  return prepareAutomatedHybridImageJob(article);
}
