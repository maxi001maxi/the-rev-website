// GET /api/admin/publish-preview?id={uuid}
//
// Publish Review画面（/admin/articles/review/）を開いた時点で実行されるPreflight。
// Phase 10 v2では、Editorial AI記事の画像Render Versionが古い場合だけ、
// Review表示の前に文字入りThumbnail / OGPを自動再生成する。
// 記事MarkdownのPublish自体はここでは行わない。
import { getAuthedContext, sendError } from '../../lib/supabaseAdmin.mjs';
import { runPreflight, draftSummary } from '../../lib/publishFlow.mjs';
import { commitMessageFor } from '../../lib/blogMarkdown.mjs';
import { ensureEditorialImages, EditorialImageError, IMAGE_RENDER_VERSION } from '../../lib/editorialImage.mjs';

const IMAGE_RETRY_COOLDOWN_MS = 5 * 60 * 1000;

async function refreshStaleEditorialImages(supabase, id) {
  const { data: draft, error } = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !draft || draft.editorial_source !== 'the-rev-editorial-ai') return;

  const current =
    draft.image_status === 'READY' &&
    draft.image_asset_ready === true &&
    draft.image_render_version === IMAGE_RENDER_VERSION;
  if (current) return;

  const checkedAt = draft.image_checked_at ? new Date(draft.image_checked_at).getTime() : 0;
  const recentAttempt = Number.isFinite(checkedAt) && (Date.now() - checkedAt) < IMAGE_RETRY_COOLDOWN_MS;
  if (recentAttempt && (draft.image_status === 'GENERATING' || draft.image_status === 'ERROR')) return;

  const now = new Date().toISOString();
  await supabase
    .from('admin_article_drafts')
    .update({
      image_status: 'GENERATING',
      image_asset_ready: false,
      image_last_error: null,
      image_checked_at: now
    })
    .eq('id', id);

  try {
    const image = await ensureEditorialImages({
      title: draft.title,
      slug: draft.slug,
      description: draft.description,
      category: draft.category,
      bodyMarkdown: draft.body_markdown,
      primaryQuery: Array.isArray(draft.keywords) ? draft.keywords[0] : ''
    }, { force: true });

    await supabase
      .from('admin_article_drafts')
      .update({
        thumbnail: image.thumbnail,
        og_image: image.ogImage,
        image_status: 'READY',
        image_render_version: image.renderVersion || IMAGE_RENDER_VERSION,
        image_strategy: image.strategy || null,
        image_source_path: image.sourcePath || null,
        image_asset_ready: image.assetReady === true,
        image_checked_at: new Date().toISOString(),
        image_last_error: null
      })
      .eq('id', id);
  } catch (e) {
    const message = e instanceof Error ? e.message : '記事画像の自動再生成に失敗しました。';
    await supabase
      .from('admin_article_drafts')
      .update({
        image_status: 'ERROR',
        image_asset_ready: false,
        image_last_error: String(message).slice(0, 1000),
        image_checked_at: new Date().toISOString()
      })
      .eq('id', id);

    // The normal preflight below turns this into a visible image_not_ready
    // blocker. Do not turn the whole Review page into a generic 500.
    if (!(e instanceof EditorialImageError)) {
      console.error('Phase 10 image refresh failed', e);
    }
  }
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
    github: result.github
  });
}
