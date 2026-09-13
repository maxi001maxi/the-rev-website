// GET /api/admin/publish-preview?id={uuid}
//
// Publish Review画面（/admin/articles/review/）を開いた時点で実行されるPreflight。
// GitHubへの書き込みは行わず、読み取りと検査のみを行う。
//
// 注記: このVercelプロジェクト構成では [id] 形式のブラケット動的ルートがマッチしないため、
// Phase Dでもクエリ文字列（?id=）方式で統一している（api/admin/article.mjs 冒頭コメント参照）。
import { getAuthedContext, sendError } from '../../lib/supabaseAdmin.mjs';
import { runPreflight, draftSummary } from '../../lib/publishFlow.mjs';
import { commitMessageFor } from '../../lib/blogMarkdown.mjs';

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

  let result;
  try {
    result = await runPreflight({ supabase: ctx.supabase, user: ctx.user, articleId: id });
  } catch (e) {
    return sendError(res, 500, 'preflight_failed', 'Preflightの実行中にエラーが発生しました。');
  }

  // 記事そのものが無い / DBエラーはHTTPステータスでも表現する。
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
    // github にはリポジトリ名とブランチ名のみ。GITHUB_TOKEN は絶対に含めない。
    github: result.github
  });
}
