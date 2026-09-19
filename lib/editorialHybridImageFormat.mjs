// THE REV. Editorial AI — Reference V2.3 Hybrid image format
//
// This module is the code-level contract for the image style approved on
// 2026-09-19. It intentionally describes a design grammar, not a rigid
// coordinate template: GPT Image can create the editorial composition, while
// the environment must remain recognizably THE REV. and no unknown trainer may
// be invented.

export const HYBRID_IMAGE_FORMAT = Object.freeze({
  id: 'rev-column-reference-v2.3-hybrid',
  strategy: 'reference-v2-gpt-image-hybrid-drive-source',
  styleTemplate: 'rev-column-reference-v2',
  generationModel: 'gpt-image-hybrid',
  qaModel: 'gpt-5.6-sol-visual-qc',
  driveRootFolderId: '1I2qrLVBSlnC035b6U6z76dtyHXNc-6iG',
  sourceSelectionPolicy: 'relevance-first-lineage-recency-v2',
  recentReferenceWindow: 4,
  publishBoundary: 'REVIEW_AND_PUBLISH',
  output: Object.freeze({
    thumbnail: Object.freeze({ width: 1200, height: 675, ratio: '16:9' }),
    ogp: Object.freeze({ width: 1200, height: 630, ratio: '1.91:1' })
  }),
  sourcePolicy: Object.freeze({
    scope: 'specified-drive-root-only',
    staticImageAllowed: true,
    videoFrameAllowed: true,
    fullDriveSearchAllowed: false,
    preferArticleRelevance: true,
    preferNeverUsedWithinEqualRelevance: true,
    avoidRecentReuseWithinEqualRelevance: true
  }),
  generationPolicy: Object.freeze({
    realTheRevEnvironmentRequired: true,
    generatedCustomerAllowed: true,
    unknownTrainerForbidden: true,
    nonCustomerPeopleForbidden: true,
    fakeGymEnvironmentForbidden: true,
    backgroundTreatmentAllowed: Object.freeze([
      'crop',
      'resize',
      'soften',
      'blur',
      'depth-adjustment',
      'lighting-harmonization',
      'editorial-color-grading'
    ]),
    rule: 'THE REV.の実素材を空間の正本として使う。人物生成は顧客役のみ許可し、未知のトレーナー・スタッフ・第三者は生成しない。背景は実素材の構造がTHE REV.として認識できる範囲でぼかし・柔らかさ・奥行き調整を許可する。'
  }),
  designGrammar: Object.freeze({
    mode: 'editorial-not-rigid-template',
    intent: '静かなプレミアム誌面。広告バナーではなく、既存Columnシリーズの一員として成立させる。',
    requirements: Object.freeze([
      '実THE REV.背景を視覚的なアンカーにする',
      '写真をただ貼るだけでなく、余白・タイポグラフィ・写真処理を一体設計する',
      '記事タイトル丸写しではなく短いEditorial Copyを使う',
      'BODY KNOWLEDGE等のカテゴリとCOLUMN番号を小さく整然と配置する',
      '生成顧客は記事テーマの状況説明に必要な場合だけ使う',
      '写真の存在感と文字の可読性を両立する',
      '構図は記事ごとに変えてよい。固定の左右分割テンプレにはしない'
    ])
  }),
  qc: Object.freeze({
    minSeriesConsistency: 8,
    minEditorialQuality: 8,
    minArticleVisualRelevance: 8,
    minRevEnvironmentConsistency: 8,
    minBrandSpaceAuthenticity: 8,
    requireSourceMaterialScopePass: true,
    requireUnknownTrainerAbsent: true,
    requireNonCustomerPeopleAbsent: true,
    requireCustomerOnlyOrNoPeople: true,
    requireExpectedCopyPresent: true,
    requireCopyLegible: true,
    requireNotTooPromotional: true
  }),
  acceptedReferences: Object.freeze([
    Object.freeze({
      slug: 'after-work-tired-strength-training',
      assetVersion: 'reference-v23-hybrid-4387-75',
      thumbnail: 'assets/images/blog/thumb-after-work-tired-strength-training-reference-v23-hybrid-4387-75.jpg',
      ogp: 'assets/images/blog/og/og-after-work-tired-strength-training-reference-v23-hybrid-4387-75.jpg',
      backgroundOrigin: 'IMG_4387.MOV',
      backgroundFrameRatio: 0.75
    }),
    Object.freeze({
      slug: 'no-time-for-gym-starting-friction',
      assetVersion: 'reference-v23-hybrid-3978-20',
      thumbnail: 'assets/images/blog/thumb-no-time-for-gym-starting-friction-reference-v23-hybrid-3978-20.jpg',
      ogp: 'assets/images/blog/og/og-no-time-for-gym-starting-friction-reference-v23-hybrid-3978-20.jpg',
      backgroundOrigin: 'IMG_3978.MOV',
      backgroundFrameRatio: 0.2
    })
  ])
});

function clean(value) {
  return String(value ?? '').trim();
}

function slugSafe(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function isHybridImageFormat(draft) {
  return (
    clean(draft?.image_render_version) === HYBRID_IMAGE_FORMAT.id &&
    clean(draft?.image_strategy) === HYBRID_IMAGE_FORMAT.strategy
  );
}

export function hybridQaReady(draft, qa = draft?.image_qa) {
  if (!isHybridImageFormat(draft) || !qa || qa.pass !== true) return false;
  return (
    Number(qa.series_consistency || 0) >= HYBRID_IMAGE_FORMAT.qc.minSeriesConsistency &&
    Number(qa.editorial_quality || 0) >= HYBRID_IMAGE_FORMAT.qc.minEditorialQuality &&
    Number(qa.article_visual_relevance || 0) >= HYBRID_IMAGE_FORMAT.qc.minArticleVisualRelevance &&
    Number(qa.rev_environment_consistency || 0) >= HYBRID_IMAGE_FORMAT.qc.minRevEnvironmentConsistency &&
    Number(qa.brand_space_authenticity || 0) >= HYBRID_IMAGE_FORMAT.qc.minBrandSpaceAuthenticity &&
    qa.source_material_scope_pass === HYBRID_IMAGE_FORMAT.qc.requireSourceMaterialScopePass &&
    qa.unknown_trainer_present === false &&
    qa.non_customer_people_present === false &&
    qa.customer_only_or_no_people === true &&
    (qa.expected_copy_present === undefined || qa.expected_copy_present === true) &&
    (qa.copy_legible === undefined || qa.copy_legible === true) &&
    (qa.too_promotional === undefined || qa.too_promotional === false)
  );
}

export function hybridAssetPaths(slug, assetVersion) {
  const safeSlug = slugSafe(slug);
  const safeVersion = slugSafe(assetVersion);
  if (!safeSlug || !safeVersion) throw new Error('Hybrid image path requires slug and assetVersion.');
  return {
    thumbnailRepoPath: `assets/images/blog/thumb-${safeSlug}-${safeVersion}.jpg`,
    ogRepoPath: `assets/images/blog/og/og-${safeSlug}-${safeVersion}.jpg`,
    thumbnailPublicPath: `/assets/images/blog/thumb-${safeSlug}-${safeVersion}.jpg`,
    ogPublicPath: `/assets/images/blog/og/og-${safeSlug}-${safeVersion}.jpg`
  };
}

export function buildHybridImageJob({
  slug,
  title,
  categoryLabel,
  columnLabel,
  imageHeadlineShort,
  assetVersion,
  qaReportPath,
  backgroundSource,
  generationModel = HYBRID_IMAGE_FORMAT.generationModel,
  qaModel = HYBRID_IMAGE_FORMAT.qaModel
}) {
  const safeSlug = slugSafe(slug);
  const paths = hybridAssetPaths(safeSlug, assetVersion);
  if (!safeSlug || !clean(title) || !clean(imageHeadlineShort)) {
    throw new Error('Hybrid image job requires slug, title, and imageHeadlineShort.');
  }
  if (!backgroundSource?.originVideoFileId && !backgroundSource?.driveFileId) {
    throw new Error('Hybrid image job requires a Drive image or video-frame source.');
  }

  return {
    slug: safeSlug,
    article_title: clean(title),
    category_label: clean(categoryLabel) || 'BODY KNOWLEDGE',
    column_label: clean(columnLabel) || 'COLUMN',
    image_headline_short: clean(imageHeadlineShort),
    image_style_template: HYBRID_IMAGE_FORMAT.styleTemplate,
    render_version: HYBRID_IMAGE_FORMAT.id,
    image_strategy: HYBRID_IMAGE_FORMAT.strategy,
    asset_version: clean(assetVersion),
    thumbnail: paths.thumbnailRepoPath,
    og_image: paths.ogRepoPath,
    qa_report_path: clean(qaReportPath),
    generation_model: generationModel,
    qa_model: qaModel,
    publish_requires_human_approval: true,
    policy: {
      generated_customer_allowed: HYBRID_IMAGE_FORMAT.generationPolicy.generatedCustomerAllowed,
      unknown_trainer_forbidden: HYBRID_IMAGE_FORMAT.generationPolicy.unknownTrainerForbidden,
      non_customer_people_forbidden: HYBRID_IMAGE_FORMAT.generationPolicy.nonCustomerPeopleForbidden,
      real_the_rev_background_required: HYBRID_IMAGE_FORMAT.generationPolicy.realTheRevEnvironmentRequired,
      source_scope: HYBRID_IMAGE_FORMAT.sourcePolicy.scope,
      drive_root_folder_id: HYBRID_IMAGE_FORMAT.driveRootFolderId,
      recent_reference_window: HYBRID_IMAGE_FORMAT.recentReferenceWindow,
      selection_policy: HYBRID_IMAGE_FORMAT.sourceSelectionPolicy,
      publish_boundary: HYBRID_IMAGE_FORMAT.publishBoundary
    },
    background_source: {
      drive_file_id: clean(backgroundSource.driveFileId),
      cached_frame_drive_file_id: clean(backgroundSource.cachedFrameDriveFileId),
      origin_video_file_id: clean(backgroundSource.originVideoFileId),
      origin_video_file_name: clean(backgroundSource.originVideoFileName),
      frame_position_ratio: backgroundSource.framePositionRatio ?? null,
      treatment: clean(backgroundSource.treatment) || 'real THE REV source; editorial soften/blur/depth allowed'
    }
  };
}

export function hybridGenerationBrief({
  articleTitle,
  editorialCopy,
  categoryLabel,
  columnLabel,
  backgroundDescription = ''
}) {
  return [
    'THE REV. CONDITIONING LAB. のBlog/Column用Editorial画像を作る。',
    'これは固定テンプレへの文字流し込みではなく、既存Columnシリーズの静かなプレミアム誌面感を再現するデザイン生成。',
    '',
    `記事: ${clean(articleTitle)}`,
    `短い画像コピー: ${clean(editorialCopy)}`,
    `ラベル: ${clean(categoryLabel)} / ${clean(columnLabel)}`,
    '',
    '背景・空間ルール:',
    '- 添付/指定されたTHE REV.実素材を空間の正本として使う。',
    '- 壁、天井、受付、マシン、床などの主要構造を別ジムへ置き換えない。',
    '- 実素材は誌面のためのcrop、ぼかし、soften、depth、光の調和、色調整は可。',
    '- 生成人物を入れる場合は顧客役のみ。未知のトレーナー、スタッフ、第三者は生成しない。',
    '- THE REV.ではない架空のジム空間を作らない。',
    backgroundDescription ? `- 背景メモ: ${clean(backgroundDescription)}` : '',
    '',
    'デザインルール:',
    '- quiet luxury / premium editorial / warm ivory / restrained Japanese typography。',
    '- 記事ごとに写真と余白のバランスを設計し、構図は固定しない。',
    '- 広告っぽい強いCTA、派手なグラデーション、過剰な装飾は禁止。',
    '- 既存シリーズと並べたときに同じ編集部が作った一枚に見えること。',
    '- 画像内の日本語は短いEditorial Copyだけ。SEO記事タイトル全文は入れない。'
  ].filter(Boolean).join('\n');
}
