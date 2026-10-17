// GET /api/admin/publish-preview?id={uuid}
//
// Publish Review画面（/admin/articles/review/）を開いた時点で実行されるPreflight。
// Phase 10 Reference V2では、Editorial AI記事が旧画像方式ならReview表示時に
// Reference V2 jobへ自動移行する。生成自体はGitHub Actionsが担当し、
// ReviewはQA report + GitHub assets + Xserver live readinessを確認する。
// 記事MarkdownのPublish自体はここでは行わない。
import { getAuthedContext, sendError } from '../../lib/supabaseAdmin.mjs';
import { runPreflight, draftSummary } from '../../lib/publishFlow.mjs';
import { commitMessageFor } from '../../lib/blogMarkdown.mjs';
import {
  prepareEditorialImageJob,
  checkEditorialImageReady,
  EditorialImageError,
  IMAGE_RENDER_VERSION,
  IMAGE_STYLE_TEMPLATE
} from '../../lib/editorialImage.mjs';
import { buildPendingHybridImageInfo, isHybridImageFormat } from '../../lib/editorialHybridImageFormat.mjs';
import { evaluateEditorialImageReview } from '../../lib/editorialImageReviewGate.mjs';

const IMAGE_RETRY_COOLDOWN_MS = 15 * 1000;

async function refreshStaleEditorialImages(supabase, id) {
  const { data: draft, error } = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !draft || draft.editorial_source !== 'the-rev-editorial-ai') return;

  const sourceLockCurrent =
    draft.image_render_version === IMAGE_RENDER_VERSION &&
    String(draft.image_strategy || '').startsWith('reference-v2-source-lock-') &&
    draft.image_style_template === IMAGE_STYLE_TEMPLATE &&
    draft.image_headline_short &&
    draft.image_qa_report_path;

  const hybridCurrent =
    isHybridImageFormat(draft) &&
    draft.image_style_template === IMAGE_STYLE_TEMPLATE &&
    draft.image_headline_short &&
    draft.image_qa_report_path;

  // V2.4 policy: Hybrid is the only publishable current route.
  // Source-lock may exist for diagnostics, but opening Review must move it back
  // to PREPARING until a generated Hybrid scene is completed.
  const referenceCurrent = hybridCurrent;

  // Existing older/non-current image routes no longer auto-downgrade into
  // source-lock. V2.4 requires an AI Operator to choose the real THE REV.
  // source, generate a customer scene (normally one customer, max two),
  // apply the fixed overlay, and run Visual QC.
  if (!referenceCurrent) {
    const pending = buildPendingHybridImageInfo({
      title: draft.title,
      slug: draft.slug,
      categoryLabel: draft.image_category_label || String(draft.category || '').toUpperCase(),
      columnLabel: draft.image_series_label || '',
      imageHeadlineShort: draft.image_headline_short || ''
    });
    await supabase
      .from('admin_article_drafts')
      .update({
        image_status: 'PREPARING',
        image_render_version: pending.renderVersion,
        image_strategy: pending.strategy,
        image_asset_ready: false,
        image_checked_at: new Date().toISOString(),
        image_style_template: pending.styleTemplate,
        image_job_path: pending.jobPath,
        image_generation_model: pending.generationModel,
        image_qa_model: pending.qaModel,
        image_brand_qa_score: null,
        image_last_error: 'V2.3 Hybrid画像をAI Operatorが生成・Visual QCするまでReview & Publishは停止します。'
      })
      .eq('id', id);
    return;
  }

  const reviewGate = evaluateEditorialImageReview({ draft, qa: draft.image_qa || {} });
  if (
    draft.image_status === 'READY' &&
    draft.image_asset_ready === true &&
    draft.image_qa?.pass === true &&
    reviewGate.ok
  ) return;

  const checkedAt = draft.image_checked_at ? new Date(draft.image_checked_at).getTime() : 0;
  const recentAttempt = Number.isFinite(checkedAt) && (Date.now() - checkedAt) < IMAGE_RETRY_COOLDOWN_MS;
  if (recentAttempt && draft.image_status === 'PREPARING') return;

  const readiness = await checkEditorialImageReady(draft);
  if (!readiness.ready) {
    await supabase
      .from('admin_article_drafts')
      .update({
        image_status: 'PREPARING',
        image_asset_ready: false,
        image_checked_at: new Date().toISOString(),
        image_last_error: null
      })
      .eq('id', id);
    return;
  }

  await supabase
    .from('admin_article_drafts')
    .update({
      image_status: 'READY',
      image_asset_ready: true,
      image_checked_at: new Date().toISOString(),
      image_qa: readiness.qa,
      image_brand_qa_score: Math.min(
        Number(readiness.qa?.series_consistency ?? 0),
        Number(readiness.qa?.article_visual_relevance ?? readiness.qa?.series_consistency ?? 0)
      ) || null,
      image_last_error: null
    })
    .eq('id', id);
}

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'method_not_allowed', 'このHTTPメソッドはサポートされていません。');
  }

  const ctx = await getAuthedContext(req);
  if (ctx.error) {
    return sendError(
      res,
      ctx.status,
      ctx.error,
      ctx.error === 'not_configured' ? 'Supabaseの環境変数が設定されていません。' : 'ログインが必要です。'
    );
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') return sendError(res, 400, 'bad_request', 'idが指定されていません。');

  try {
    await refreshStaleEditorialImages(ctx.supabase, id);
  } catch (e) {
    console.error('Phase 10 image preparation check failed', e);
  }

  let result;
  try {
    result = await runPreflight({ supabase: ctx.supabase, user: ctx.user, articleId: id });
  } catch (e) {
    return sendError(res, 500, 'preflight_failed', 'Preflightの実行中にエラーが発生しました。');
  }

  if (result.blocker && (result.blocker.code === 'not_found' || result.blocker.code === 'db_error')) {
    return sendError(res, result.blocker.status, result.blocker.code, result.blocker.message);
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: result.ok,
    mode: result.mode,
    checks: result.checks,
    blocker: result.blocker,
    article: draftSummary(result.draft),
    markdown: result.markdown,
    targetPath: result.targetPath,
    publicUrl: result.publicUrl,
    canonical: result.canonical,
    commitMessage: result.draft ? commitMessageFor(result.draft, result.mode) : null,
    github: result.github,
    publish_requires_human_approval: true,
    publish_boundary: 'REVIEW_AND_PUBLISH'
  });
}
