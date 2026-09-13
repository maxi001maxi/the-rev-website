// GET  /api/admin/articles  … 自分の下書き一覧（一覧表示に必要な列のみ）
// POST /api/admin/articles  … 新規下書きの作成（statusは常にdraftへ強制）
import { getAuthedContext, normalizeArticleInput, sendError } from '../../../lib/supabaseAdmin.mjs';

// source_path は一覧で「公開済み / 未公開」を出し分けるために取得する（Phase D）。
const LIST_COLUMNS = 'id, title, slug, category, status, updated_at, created_at, source_path';

export default async function handler(req, res) {
  const ctx = await getAuthedContext(req);
  if (ctx.error) return sendError(res, ctx.status, ctx.error, authErrorMessage(ctx.error));
  const { supabase, user } = ctx;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_article_drafts')
      .select(LIST_COLUMNS)
      .order('updated_at', { ascending: false });

    if (error) return sendError(res, 500, 'db_error', '記事一覧の取得に失敗しました。');
    return res.status(200).json({ articles: data });
  }

  if (req.method === 'POST') {
    const { value, errors } = normalizeArticleInput(req.body || {});
    if (errors) return sendError(res, 422, 'validation_error', errors.join(' '));

    const dup = await supabase
      .from('admin_article_drafts')
      .select('id')
      .eq('slug', value.slug)
      .maybeSingle();
    if (dup.data) return sendError(res, 409, 'slug_conflict', `slug "${value.slug}" はすでに使用されています。`);

    const { data, error } = await supabase
      .from('admin_article_drafts')
      .insert({ ...value, user_id: user.id })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return sendError(res, 409, 'slug_conflict', `slug "${value.slug}" はすでに使用されています。`);
      return sendError(res, 500, 'db_error', '下書きの作成に失敗しました。');
    }
    return res.status(201).json({ article: data });
  }

  res.setHeader('Allow', 'GET, POST');
  return sendError(res, 405, 'method_not_allowed', 'このHTTPメソッドはサポートされていません。');
}

function authErrorMessage(code) {
  if (code === 'not_configured') return 'Supabaseの環境変数が設定されていません。';
  return 'ログインが必要です。';
}
