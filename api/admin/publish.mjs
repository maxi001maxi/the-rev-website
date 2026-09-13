// POST /api/admin/publish   Body: { "articleId": "<uuid>" }
//
// Supabase Working Draft → GitHub content/blog/{slug}.md へ書き込む。
// 書き込み成功後にのみ、Supabase Draftへ source_path / source_sha を保存する。
//
// 重要：
//   - Review画面のPreflight結果は信用せず、ここで必ず再実行する。
//   - Publish権限は ADMIN_PUBLISHER_USER_ID と一致するユーザーのみ（不一致は403）。
//   - GitHubが失敗した場合、Supabase Draftは一切変更しない（Draftを壊さない）。
//   - Force overwrite は Phase D v1.0 では提供しない。
import { getAuthedContext, sendError } from '../../lib/supabaseAdmin.mjs';
import { runPreflight, checkPublisher } from '../../lib/publishFlow.mjs';
import { GithubError, putFile, sendGithubError } from '../../lib/githubContent.mjs';
import { commitMessageFor } from '../../lib/blogMarkdown.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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
  const { supabase, user } = ctx;

  // 認証済みであるだけでは書き込ませない。
  const publisher = checkPublisher(user);
  if (!publisher.allowed) {
    return sendError(res, 403, publisher.reason, publisher.message);
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const articleId = typeof body?.articleId === 'string' ? body.articleId.trim() : '';
  if (!articleId) return sendError(res, 400, 'bad_request', 'articleId が指定されていません。');

  // --- Preflight再実行（Review時の結果は信用しない） ---
  let pre;
  try {
    pre = await runPreflight({ supabase, user, articleId });
  } catch (e) {
    return sendError(res, 500, 'preflight_failed', 'Preflightの実行中にエラーが発生しました。');
  }

  if (!pre.ok) {
    const blocker = pre.blocker || { code: 'preflight_failed', status: 409, message: '公開前チェックに失敗しました。' };
    return res.status(blocker.status).json({ error: blocker.code, message: blocker.message, checks: pre.checks });
  }

  const draft = pre.draft;
  const mode = pre.mode;
  const targetPath = pre.targetPath;
  const markdown = pre.markdown;

  if (!targetPath || !markdown) {
    return sendError(res, 422, 'validation_error', '公開用のMarkdownを生成できませんでした。');
  }

  // --- GitHubへ書き込み ---
  let written;
  try {
    written = await putFile({
      path: targetPath,
      content: markdown,
      message: commitMessageFor(draft, mode),
      // 新規はsha無し（既に存在すればGitHubが422を返す）。更新は現在SHAを渡す（不一致なら409）。
      sha: mode === 'update' ? pre.github.currentSha : null
    });
  } catch (e) {
    if (e instanceof GithubError) {
      // 書き込み直前にGitHub側が変わった場合も source_conflict として扱う。
      if (e.code === 'github_conflict') {
        return res.status(409).json({
          error: 'source_conflict',
          message: 'GitHub側の記事が別経路で変更されています。ページを再読み込みして最新状態を確認してください。'
        });
      }
      return sendGithubError(res, e);
    }
    return sendError(res, 502, 'github_error', 'GitHubへの書き込みで予期しないエラーが発生しました。');
  }

  // --- GitHub成功後にのみ Supabase Draft の同期情報を更新する ---
  let syncWarning = null;
  const { error: updateError } = await supabase
    .from('admin_article_drafts')
    .update({ source_path: written.path, source_sha: written.contentSha })
    .eq('id', articleId);

  if (updateError) {
    // GitHubへは書き込み済み。Draftは削除も破壊もせず、警告として返す。
    syncWarning = 'GitHubへの反映は成功しましたが、Admin側の同期情報（source_sha）の保存に失敗しました。'
      + 'このまま続けて更新すると競合検知が働くため、Review画面を再読み込みして状態を確認してください。';
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    mode,
    path: written.path,
    commitSha: written.commitSha,
    contentSha: written.contentSha,
    commitUrl: written.commitUrl,
    publicUrl: pre.publicUrl,
    repo: pre.github.repo,
    branch: pre.github.branch,
    syncWarning
  });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
