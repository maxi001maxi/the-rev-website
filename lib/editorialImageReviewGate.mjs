// THE REV. Editorial Image Review Gate
// Single fail-closed contract shared by Review, Publish and CI.

export const IMAGE_REVIEW_MODE_HYBRID = 'HYBRID_GENERATED';
export const IMAGE_REVIEW_MODE_FALLBACK = 'SOURCE_LOCK_FALLBACK';
export const IMAGE_REVIEW_RECENT_WINDOW = 4;

const SCORE_FIELDS = Object.freeze([
  'series_consistency',
  'editorial_quality',
  'typography_harmony',
  'negative_space',
  'photo_treatment',
  'article_visual_relevance',
  'rev_environment_consistency',
  'brand_space_authenticity'
]);

function clean(value) {
  return String(value ?? '').trim();
}

function boolIs(value, expected) {
  return value === expected;
}

function inferredMode(draft = {}, qa = {}) {
  if (clean(qa.review_mode)) return clean(qa.review_mode);
  if (
    clean(draft.image_render_version) === 'rev-column-reference-v2.3-hybrid' ||
    clean(draft.image_strategy) === 'reference-v2-gpt-image-hybrid-drive-source'
  ) return IMAGE_REVIEW_MODE_HYBRID;
  if (
    clean(draft.image_render_version) === 'rev-column-reference-v2.2' ||
    clean(draft.image_strategy).startsWith('reference-v2-source-lock-')
  ) return IMAGE_REVIEW_MODE_FALLBACK;
  return 'UNKNOWN';
}

function sourceLooksLikeTrainer(value) {
  return /(^|\/)(trainer-|career-boxing|career-asia|career-racing)/i.test(clean(value));
}

function provenanceIds(draft = {}, qa = {}) {
  return new Set([
    draft.image_source_path,
    qa.content_reference,
    qa.background_source_drive_file_id,
    qa.background_origin_video_file_id,
    qa.background_origin_video_file_name,
    qa.current_background_source_id
  ].map(clean).filter(Boolean));
}

function recentProvenanceIds(qa = {}, recentHistory = []) {
  const ids = new Set();
  for (const x of Array.isArray(qa.recent_background_source_ids) ? qa.recent_background_source_ids : []) {
    if (clean(x)) ids.add(clean(x));
  }
  const guard = qa.recent_reference_guard || {};
  for (const x of Array.isArray(guard.recent_content_references) ? guard.recent_content_references : []) {
    if (clean(x)) ids.add(clean(x));
  }
  for (const item of Array.isArray(recentHistory) ? recentHistory : []) {
    for (const v of [
      item?.thumbnail,
      item?.contentReference,
      item?.backgroundSourceDriveFileId,
      item?.backgroundOriginVideoFileId,
      item?.backgroundOriginVideoFileName
    ]) {
      if (clean(v)) ids.add(clean(v));
    }
  }
  return ids;
}

export function evaluateEditorialImageReview({ draft = {}, qa = draft?.image_qa || {}, recentHistory = [] } = {}) {
  const errors = [];
  const checks = {};
  const mode = inferredMode(draft, qa);

  const add = (key, ok, message) => {
    checks[key] = ok;
    if (!ok) errors.push(message);
  };

  add('qa_pass', qa?.pass === true, '画像QAがPASSしていません。');

  add('trainer_absent', boolIs(qa.trainer_present, false), 'トレーナーが画像に含まれています、またはtrainer_present判定が未記録です。');
  add('unknown_trainer_absent', boolIs(qa.unknown_trainer_present, false), '未知のトレーナー/スタッフ/コーチが含まれています、または判定が未記録です。');
  add('non_customer_people_absent', boolIs(qa.non_customer_people_present, false), '顧客以外の人物が含まれています、または判定が未記録です。');
  add('customer_only_or_no_people', boolIs(qa.customer_only_or_no_people, true), '人物は顧客役のみ、または人物なしにしてください。');

  add('real_the_rev_background', boolIs(qa.real_the_rev_background_confirmed, true), 'THE REV.実背景の確認ができていません。');
  add('source_scope', boolIs(qa.source_material_scope_pass, true), '指定Driveルート外の素材、または素材スコープ未確認です。');
  add('background_source_recorded', boolIs(qa.background_source_recorded, true), '背景素材のprovenanceが未記録です。');
  add('background_selection_reason_recorded', boolIs(qa.background_selection_reason_recorded, true), '背景素材を選んだ理由が未記録です。');

  add('recent_similarity_checked', boolIs(qa.recent_similarity_check_pass, true), '直近記事との画像類似チェックが未完了です。');
  add('same_image_absent', boolIs(qa.same_image_as_recent_articles, false), '直近4記事と同一画像です、または判定が未記録です。');
  add('same_background_absent', boolIs(qa.same_background_as_recent_articles, false), '直近4記事と同一背景です、または判定が未記録です。');
  add('trainer_photo_not_reused', boolIs(qa.trainer_photo_reused, false), 'トレーナー写真が再利用されています、または判定が未記録です。');
  add(
    'recent_window',
    Number(qa.recent_similarity_window) >= IMAGE_REVIEW_RECENT_WINDOW,
    '直近4記事の比較履歴が不足しています。'
  );

  for (const field of SCORE_FIELDS) {
    add(field, Number(qa?.[field] || 0) >= 8, `${field} が8未満、または未記録です。`);
  }

  add('expected_copy_present', boolIs(qa.expected_copy_present, true), '画像用Editorial Copyが確認できません。');
  add('copy_legible', boolIs(qa.copy_legible, true), '画像コピーの可読性が不足しています。');
  add('not_too_promotional', boolIs(qa.too_promotional, false), '画像が広告的すぎます。');

  if (mode === IMAGE_REVIEW_MODE_HYBRID) {
    add('image_generation_used', boolIs(qa.image_generation_used, true), 'Hybrid標準なのに画像生成が確認できません。');
    add('fallback_not_used', boolIs(qa.fallback_used, false), 'Hybrid画像でfallback_used=trueになっています。');
  } else if (mode === IMAGE_REVIEW_MODE_FALLBACK) {
    add('fallback_used', boolIs(qa.fallback_used, true), 'Source-lock fallbackなのにfallback_used=trueが記録されていません。');
    add('fallback_reason', Boolean(clean(qa.fallback_reason)), 'Source-lock fallbackの理由が未記録です。');
  } else {
    add('known_review_mode', false, '画像Review modeを判定できません。');
  }

  const currentIds = provenanceIds(draft, qa);
  const recentIds = recentProvenanceIds(qa, recentHistory);
  const deterministicBackgroundRepeat = [...currentIds].some((id) => recentIds.has(id));
  add('provenance_no_recent_repeat', !deterministicBackgroundRepeat, 'provenance照合で直近記事と同一背景/素材が検出されました。');

  const trainerSourceDetected =
    sourceLooksLikeTrainer(draft.image_source_path) ||
    sourceLooksLikeTrainer(qa.content_reference) ||
    Boolean(clean(qa.known_trainer_identity));
  add('trainer_source_absent', !trainerSourceDetected, 'トレーナー素材をContent Referenceとして使用しています。');

  return {
    ok: errors.length === 0,
    mode,
    errors,
    checks,
    recentWindow: IMAGE_REVIEW_RECENT_WINDOW,
    deterministicBackgroundRepeat
  };
}
