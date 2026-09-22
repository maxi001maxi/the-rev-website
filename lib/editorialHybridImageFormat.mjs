// THE REV. Editorial AI — Reference V2.3 Hybrid engine + V2.4 thumbnail policy
//
// This module is the code-level contract for the image style approved on
// 2026-09-19. It intentionally describes a design grammar, not a rigid
// coordinate template: GPT Image can create the editorial composition, while
// the environment must remain recognizably THE REV. and no unknown trainer may
// be invented.

export const HYBRID_IMAGE_FORMAT = Object.freeze({
  id: 'rev-column-reference-v2.3-hybrid',
  policyRevision: 'editorial-thumbnail-v2.4',
  layoutTemplateId: 'rev-column-v24-fixed-overlay-v1',
  status: 'ACTIVE_STANDARD',
  activationMode: 'gpt-operator-orchestrated',
  fallbackBeforeHybridReady: 'reference-v2.2-source-lock',
  jobTemplatePath: 'editorial/hybrid-image-jobs/_template.json',
  validatorScript: 'scripts/validate-hybrid-image-jobs.mjs',
  strategy: 'reference-v2-gpt-image-hybrid-drive-source',
  styleTemplate: 'rev-column-reference-v2',
  generationModel: 'gpt-image-hybrid',
  qaModel: 'gpt-5.6-sol-visual-qc',
  driveRootFolderId: '1I2qrLVBSlnC035b6U6z76dtyHXNc-6iG',
  sourceSelectionPolicy: 'relevance-first-lineage-recency-v2',
  recentReferenceWindow: 4,
  publishBoundary: 'REVIEW_AND_PUBLISH',
  designReferenceAssets: Object.freeze([
    'assets/images/blog/thumb-after-work-tired-strength-training-reference-v23-hybrid-4387-75.jpg',
    'assets/images/blog/thumb-no-time-for-gym-starting-friction-reference-v23-hybrid-3978-20.jpg'
  ]),
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
    generatedCustomerRequired: true,
    defaultGeneratedCustomerCount: 1,
    maxGeneratedCustomerCount: 2,
    trainerPresentForbidden: true,
    unknownTrainerForbidden: true,
    nonCustomerPeopleForbidden: true,
    customerOnlyOrNoPeopleRequired: true,
    facilityOnlyThumbnailForbidden: true,
    fixedOverlayRequired: true,
    hybridGenerationRequiredByDefault: true,
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
    mode: 'fixed-editorial-overlay-flexible-scene',
    intent: 'V2.4では人物情景は記事ごとに生成し、文字・余白・ラベル位置は固定Editorial Overlayへ寄せる。広告バナーではなく既存Columnシリーズの一員として成立させる。',
    requirements: Object.freeze([
      '実THE REV.背景を視覚的なアンカーにする',
      '写真をただ貼るだけでなく、余白・タイポグラフィ・写真処理を一体設計する',
      '記事タイトル丸写しではなく短いEditorial Copyを使う',
      'BODY KNOWLEDGE等のカテゴリとCOLUMN番号を小さく整然と配置する',
      '生成顧客は必須。原則1人、記事上必要な場合のみ2人まで',
      'トレーナー・スタッフ・コーチ風人物は出さない',
      '施設だけの完成サムネイルは禁止',
      '人物情景は記事ごとに変えてよいが、文字・ラベル・余白は固定Overlayへ寄せる',
      '写真の存在感と文字の可読性を両立する'
    ])
  }),
  qc: Object.freeze({
    minSeriesConsistency: 8,
    minEditorialQuality: 8,
    minTypographyHarmony: 8,
    minNegativeSpace: 8,
    minPhotoTreatment: 8,
    minArticleVisualRelevance: 8,
    minRevEnvironmentConsistency: 8,
    minBrandSpaceAuthenticity: 8,
    requireSourceMaterialScopePass: true,
    requireTrainerAbsent: true,
    requireUnknownTrainerAbsent: true,
    requireNonCustomerPeopleAbsent: true,
    requireCustomerOnlyOrNoPeople: true,
    requireGeneratedCustomerPresent: true,
    minGeneratedCustomerCount: 1,
    maxGeneratedCustomerCount: 2,
    requireFacilityOnlyThumbnailFalse: true,
    requireFixedOverlayLayout: true,
    requireRealTheRevBackground: true,
    requireBackgroundSourceRecorded: true,
    requireBackgroundSelectionReasonRecorded: true,
    requireImageGenerationUsed: true,
    requireRecentSimilarityCheck: true,
    requireNoRecentImageReuse: true,
    requireNoRecentBackgroundReuse: true,
    requireNoTrainerPhotoReuse: true,
    recentSimilarityWindow: 4,
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
    Number(qa.typography_harmony || 0) >= HYBRID_IMAGE_FORMAT.qc.minTypographyHarmony &&
    Number(qa.negative_space || 0) >= HYBRID_IMAGE_FORMAT.qc.minNegativeSpace &&
    Number(qa.photo_treatment || 0) >= HYBRID_IMAGE_FORMAT.qc.minPhotoTreatment &&
    Number(qa.article_visual_relevance || 0) >= HYBRID_IMAGE_FORMAT.qc.minArticleVisualRelevance &&
    Number(qa.rev_environment_consistency || 0) >= HYBRID_IMAGE_FORMAT.qc.minRevEnvironmentConsistency &&
    Number(qa.brand_space_authenticity || 0) >= HYBRID_IMAGE_FORMAT.qc.minBrandSpaceAuthenticity &&
    qa.source_material_scope_pass === HYBRID_IMAGE_FORMAT.qc.requireSourceMaterialScopePass &&
    qa.trainer_present === false &&
    qa.unknown_trainer_present === false &&
    qa.non_customer_people_present === false &&
    qa.customer_only_or_no_people === true &&
    (
      HYBRID_IMAGE_FORMAT.acceptedReferences.some((ref) =>
        ref.assetVersion === clean(draft?.image_asset_version || qa.asset_version)
      ) ||
      (
        qa.generated_customer_present === true &&
        Number.isInteger(Number(qa.generated_customer_count)) &&
        Number(qa.generated_customer_count) >= HYBRID_IMAGE_FORMAT.qc.minGeneratedCustomerCount &&
        Number(qa.generated_customer_count) <= HYBRID_IMAGE_FORMAT.qc.maxGeneratedCustomerCount &&
        qa.facility_only_thumbnail === false &&
        qa.fixed_overlay_layout_confirmed === true &&
        clean(qa.layout_template_id) === HYBRID_IMAGE_FORMAT.layoutTemplateId &&
        clean(qa.policy_revision) === HYBRID_IMAGE_FORMAT.policyRevision
      )
    ) &&
    qa.real_the_rev_background_confirmed === true &&
    qa.background_source_recorded === true &&
    qa.background_selection_reason_recorded === true &&
    qa.image_generation_used === true &&
    qa.fallback_used === false &&
    qa.recent_similarity_check_pass === true &&
    qa.same_image_as_recent_articles === false &&
    qa.same_background_as_recent_articles === false &&
    qa.trainer_photo_reused === false &&
    Number(qa.recent_similarity_window || 0) >= HYBRID_IMAGE_FORMAT.qc.recentSimilarityWindow &&
    qa.expected_copy_present === HYBRID_IMAGE_FORMAT.qc.requireExpectedCopyPresent &&
    qa.copy_legible === HYBRID_IMAGE_FORMAT.qc.requireCopyLegible &&
    qa.too_promotional === false
  );
}

export function shouldPreserveHybridImageOnEditorialSync(existingDraft, incoming = {}) {
  if (
    !existingDraft ||
    existingDraft.image_status !== 'READY' ||
    existingDraft.image_asset_ready !== true ||
    !hybridQaReady(existingDraft)
  ) {
    return false;
  }

  const checks = [
    ['slug', existingDraft.slug, incoming.slug],
    ['title', existingDraft.title, incoming.title],
    ['category', existingDraft.category, incoming.category]
  ];
  for (const [, current, next] of checks) {
    if (clean(next) && clean(current) !== clean(next)) return false;
  }

  const requestedCopy = clean(incoming.imageHeadlineShort);
  if (requestedCopy && requestedCopy !== clean(existingDraft.image_headline_short)) return false;

  return true;
}

export function hybridImageInfoFromDraft(draft) {
  if (!isHybridImageFormat(draft)) {
    throw new Error('Cannot build Hybrid image info from a non-Hybrid draft.');
  }
  return {
    status: draft.image_status || 'READY',
    preserveReady: draft.image_status === 'READY' && draft.image_asset_ready === true,
    renderVersion: draft.image_render_version,
    strategy: draft.image_strategy,
    styleTemplate: draft.image_style_template || HYBRID_IMAGE_FORMAT.styleTemplate,
    sourcePath: draft.image_source_path || null,
    imageHeadlineShort: draft.image_headline_short || null,
    categoryLabel: draft.image_category_label || null,
    seriesLabel: draft.image_series_label || null,
    assetVersion: draft.image_asset_version || null,
    jobPath: draft.image_job_path || null,
    qaReportPath: draft.image_qa_report_path || null,
    generationModel: draft.image_generation_model || HYBRID_IMAGE_FORMAT.generationModel,
    qaModel: draft.image_qa_model || HYBRID_IMAGE_FORMAT.qaModel,
    thumbnail: draft.thumbnail || null,
    ogImage: draft.og_image || null,
    qa: draft.image_qa || null,
    brandQaScore: draft.image_brand_qa_score ?? null,
    attempts: draft.image_attempts ?? null,
    assetReady: draft.image_asset_ready === true
  };
}

export function buildPendingHybridImageInfo({
  slug,
  title,
  categoryLabel,
  columnLabel,
  imageHeadlineShort
}) {
  const safeSlug = slugSafe(slug);
  if (!safeSlug || !clean(title)) {
    throw new Error('Pending Hybrid image info requires slug and title.');
  }
  return {
    status: 'PREPARING',
    preserveReady: false,
    renderVersion: HYBRID_IMAGE_FORMAT.id,
    strategy: HYBRID_IMAGE_FORMAT.strategy,
    styleTemplate: HYBRID_IMAGE_FORMAT.styleTemplate,
    sourcePath: null,
    imageHeadlineShort: clean(imageHeadlineShort) || null,
    categoryLabel: clean(categoryLabel) || null,
    seriesLabel: clean(columnLabel) || null,
    assetVersion: null,
    jobPath: `editorial/hybrid-image-jobs/${safeSlug}.json`,
    qaReportPath: null,
    generationModel: HYBRID_IMAGE_FORMAT.generationModel,
    qaModel: HYBRID_IMAGE_FORMAT.qaModel,
    thumbnail: null,
    ogImage: null,
    qa: null,
    brandQaScore: null,
    attempts: null,
    assetReady: false,
    operatorRequired: true
  };
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
  sceneIntent,
  generatedCustomerCount = HYBRID_IMAGE_FORMAT.generationPolicy.defaultGeneratedCustomerCount,
  generationModel = HYBRID_IMAGE_FORMAT.generationModel,
  qaModel = HYBRID_IMAGE_FORMAT.qaModel
}) {
  const safeSlug = slugSafe(slug);
  const paths = hybridAssetPaths(safeSlug, assetVersion);
  if (!safeSlug || !clean(title) || !clean(imageHeadlineShort)) {
    throw new Error('Hybrid image job requires slug, title, and imageHeadlineShort.');
  }
  const customerCount = Number(generatedCustomerCount);
  if (!Number.isInteger(customerCount) || customerCount < 1 || customerCount > HYBRID_IMAGE_FORMAT.generationPolicy.maxGeneratedCustomerCount) {
    throw new Error('Hybrid image job requires generatedCustomerCount between 1 and 2.');
  }
  if (!clean(sceneIntent)) {
    throw new Error('Hybrid image job requires sceneIntent for the generated customer scene.');
  }
  if (
    !backgroundSource?.originVideoFileId &&
    !backgroundSource?.driveFileId &&
    !backgroundSource?.cachedFrameDriveFileId
  ) {
    throw new Error('Hybrid image job requires Drive provenance for an image, cached frame, or origin video.');
  }

  return {
    slug: safeSlug,
    article_title: clean(title),
    category_label: clean(categoryLabel) || 'BODY KNOWLEDGE',
    column_label: clean(columnLabel) || 'COLUMN',
    image_headline_short: clean(imageHeadlineShort),
    image_style_template: HYBRID_IMAGE_FORMAT.styleTemplate,
    policy_revision: HYBRID_IMAGE_FORMAT.policyRevision,
    layout_template_id: HYBRID_IMAGE_FORMAT.layoutTemplateId,
    scene_intent: clean(sceneIntent),
    generated_customer_count: customerCount,
    generated_scene_path: `assets/images/editorial-generated/${safeSlug}-${slugSafe(assetVersion)}-scene.jpg`,
    style_references: [...HYBRID_IMAGE_FORMAT.designReferenceAssets],
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
      generated_customer_required: HYBRID_IMAGE_FORMAT.generationPolicy.generatedCustomerRequired,
      generated_customer_default_count: HYBRID_IMAGE_FORMAT.generationPolicy.defaultGeneratedCustomerCount,
      generated_customer_max_count: HYBRID_IMAGE_FORMAT.generationPolicy.maxGeneratedCustomerCount,
      facility_only_thumbnail_forbidden: HYBRID_IMAGE_FORMAT.generationPolicy.facilityOnlyThumbnailForbidden,
      fixed_overlay_required: HYBRID_IMAGE_FORMAT.generationPolicy.fixedOverlayRequired,
      layout_template_id: HYBRID_IMAGE_FORMAT.layoutTemplateId,
      policy_revision: HYBRID_IMAGE_FORMAT.policyRevision,
      trainer_present_forbidden: HYBRID_IMAGE_FORMAT.generationPolicy.trainerPresentForbidden,
      unknown_trainer_forbidden: HYBRID_IMAGE_FORMAT.generationPolicy.unknownTrainerForbidden,
      non_customer_people_forbidden: HYBRID_IMAGE_FORMAT.generationPolicy.nonCustomerPeopleForbidden,
      customer_only_or_no_people_required: HYBRID_IMAGE_FORMAT.generationPolicy.customerOnlyOrNoPeopleRequired,
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
      selection_reason: clean(backgroundSource.selectionReason),
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
    'V2.4では、THE REV.実空間に記事固有の顧客シーンを生成し、文字は後段の固定Editorial Overlayで合成する。',
    '',
    `記事: ${clean(articleTitle)}`,
    `短い画像コピー: ${clean(editorialCopy)}`,
    `ラベル: ${clean(categoryLabel)} / ${clean(columnLabel)}`,
    '',
    '背景・空間ルール:',
    '- 添付/指定されたTHE REV.実素材を空間の正本として使う。',
    '- 壁、天井、受付、マシン、床などの主要構造を別ジムへ置き換えない。',
    '- 実素材は誌面のためのcrop、ぼかし、soften、depth、光の調和、色調整は可。',
    '- 顧客役を必ず生成する。原則1人、記事上必要な場合のみ2人まで。',
    '- 顧客の表情・姿勢・動作は記事テーマのscene intentに合わせる。',
    '- 実在・生成を問わず、トレーナー、スタッフ、コーチ風人物は画像に入れない。',
    '- 施設だけの完成サムネイルにしない。',
    '- 直近4記事で使用した同一画像・同一背景provenanceを再利用しない。',
    '- THE REV.ではない架空のジム空間を作らない。',
    backgroundDescription ? `- 背景メモ: ${clean(backgroundDescription)}` : '',
    '',
    'デザインルール:',
    '- 承認済みV2.3 Hybridの2枚をStyle Referenceとして使い、人物情景の品質・写真処理・シリーズの静けさを参照する。',
    `- 最終文字レイアウトは ${HYBRID_IMAGE_FORMAT.layoutTemplateId} の固定Overlayを使う。画像生成モデルに日本語文字を描かせない。`,
    ...HYBRID_IMAGE_FORMAT.designReferenceAssets.map((p) => `- Style Reference: ${p}`),
    '- quiet luxury / premium editorial / warm ivory / restrained Japanese typography。',
    '- 人物情景は記事ごとに設計するが、最終の文字・ラベル・ヘアライン・余白位置は固定Overlayで統一する。',
    '- 広告っぽい強いCTA、派手なグラデーション、過剰な装飾は禁止。',
    '- 既存シリーズと並べたときに同じ編集部が作った一枚に見えること。',
    '- 生成シーンには日本語文字を描かせない。短いEditorial Copyは固定Overlay rendererだけが描画する。'
  ].filter(Boolean).join('\n');
}
