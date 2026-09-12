// GET    /api/admin/article?id={id} … 下書き1件の全フィールド取得（Editor読み込み用）
// PATCH  /api/admin/article?id={id} … 下書きの更新（statusは常にdraftへ強制）
// DELETE /api/admin/article?id={id} … 下書きの削除
//
// 注記: 当初は /api/admin/articles/[id].mjs という動的パスセグメント方式で実装していたが、
// このVercelプロジェクト構成（Framework Preset: Other、vercel.jsonでの手動outputDirectory/rewrites指定）では
// [id] 形式のブラケット動的ルートが一切マッチしない（Vercelの汎用404が返る）ことを診断用エンドポイントで
// 複数パターン（フォルダ名・拡張子違い）で確認した。クエリ文字列（?id=）方式は正常に機能するため、
// この方式へ変更した。req.query.id の取得自体はパスパラメータ方式と同じAPIで扱えるため、
// ハンドラのロジックは変更していない。
import { getAuthedContext, normalizeArticleInput, sendError } from '../../lib/supabaseAdmin.mjs';

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
