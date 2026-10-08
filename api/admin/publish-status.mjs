// GET /api/admin/publish-status?id={uuid}
// Authenticated publication-state probe for Review & Publish.
//
// This endpoint never publishes. It reconciles the durable Publication State
// against the exact GitHub publish commit's Deploy to Xserver workflow run and
// the production article URL.

import { getAuthedContext, sendError } from '../../lib/supabaseAdmin.mjs';
import { PUBLISH_STATUS } from '../../lib/editorialPublication.mjs';
import { reconcilePublication } from '../../lib/editorialPublicationStatus.mjs';

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

  const id = typeof req.query?.id === 'string' ? req.query.id.trim() : '';
  if (!id) return sendError(res, 400, 'bad_request', 'idが指定されていません。');

  const { supabase } = ctx;
  const found = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (found.error) return sendError(res, 500, 'db_error', '記事の公開状態を取得できませんでした。');
  if (!found.data) return sendError(res, 404, 'not_found', '記事が見つかりません。');

  const publication = await reconcilePublication({ supabase, article: found.data });
  const article = publication.article || found.data;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    article: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      source_path: article.source_path || null,
      source_sha: article.source_sha || null,
      publish_status: article.publish_status || PUBLISH_STATUS.NOT_PUBLISHED,
      publish_commit_sha: article.publish_commit_sha || null,
      published_url: article.published_url || null,
      publish_committed_at: article.publish_committed_at || null,
      published_at: article.published_at || null,
      publish_verified_at: article.publish_verified_at || null
    },
    publication
  });
}
