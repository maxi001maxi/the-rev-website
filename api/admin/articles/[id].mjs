// GET    /api/admin/articles/{id} … 下書き1件の全フィールド取得（Editor読み込み用）
// PATCH  /api/admin/articles/{id} … 下書きの更新（statusは常にdraftへ強制）
// DELETE /api/admin/articles/{id} … 下書きの削除
import { getAuthedContext, normalizeArticleInput, sendError } from '../../../lib/supabaseAdmin.mjs';

export default async function handler(req, res) {
  const ctx = await getAuthedContext(req);
  if (ctx.error) return sendError(res, ctx.status, ctx.error, authErrorMessage(ctx.error));
  const { supabase } = ctx;

  const { id } = req.query;
  if (!id || typeof id !== 'string') return sendError(res, 400, 'bad_request', 'idが指定されていません。');

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_article_drafts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return sendError(res, 500, 'db_error', '記事の取得に失敗しました。');
    if (!data) return sendError(res, 404, 'not_found', '記事が見つかりません。');
    return res.status(200).json({ article: data });
  }

  if (req.method === 'PATCH') {
    const { value, errors } = normalizeArticleInput(req.body || {});
    if (errors) return sendError(res, 422, 'validation_error', errors.join(' '));

    const dup = await supabase
      .from('admin_article_drafts')
      .select('id')
      .eq('slug', value.slug)
      .neq('id', id)
      .maybeSingle();
    if (dup.data) return sendError(res, 409, 'slug_conflict', `slug "${value.slug}" はすでに使用されています。`);

    const { data, error } = await supabase
      .from('admin_article_drafts')
      .update(value)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') return sendError(res, 409, 'slug_conflict', `slug "${value.slug}" はすでに使用されています。`);
      return sendError(res, 500, 'db_error', '下書きの更新に失敗しました。');
    }
    if (!data) return sendError(res, 404, 'not_found', '記事が見つかりません。');
    return res.status(200).json({ article: data });
  }

  if (req.method === 'DELETE') {
    const { error, count } = await supabase
      .from('admin_article_drafts')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) return sendError(res, 500, 'db_error', '下書きの削除に失敗しました。');
    if (!count) return sendError(res, 404, 'not_found', '記事が見つかりません。');
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return sendError(res, 405, 'method_not_allowed', 'このHTTPメソッドはサポートされていません。');
}

function authErrorMessage(code) {
  if (code === 'not_configured') return 'Supabaseの環境変数が設定されていません。';
  return 'ログインが必要です。';
}
