// THE REV. Editorial Console — Phase D: Publish Preflight（共通）
//
// /api/admin/publish-preview と /api/admin/publish の両方から同じ関数を呼び、
// 「Review画面でOKだったからPublishでは省略する」という状態を作らない。
// Publishボタン押下後も、必ずサーバー側でこのPreflightを再実行してから書き込む。

import {
  buildBlogMarkdown,
  canonicalFor,
  contentPathFor,
  publicUrlPathFor,
  validateDraftForPublish,
  isValidSlug
} from './blogMarkdown.mjs';
import { GithubError, checkConnection, getFile, publicGithubConfig } from './githubContent.mjs';

export const CHECK_OK = 'ok';
export const CHECK_ERROR = 'error';
export const CHECK_SKIP = 'skip';

/**
 * Publish権限（GitHubへの書き込み権限）。
 * 認証済みであるだけでは不十分で、ADMIN_PUBLISHER_USER_ID と一致する場合のみ許可する。
 * 環境変数が未設定の場合は「許可しない」側へ倒す（fail closed）。
 */
export function checkPublisher(user) {
  const configured = (process.env.ADMIN_PUBLISHER_USER_ID || '').trim();
  if (!configured) {
    return {
      allowed: false,
      reason: 'publisher_not_configured',
      message: 'ADMIN_PUBLISHER_USER_ID がVercelの環境変数に設定されていないため、公開操作は許可されません。'
    };
  }
  if (!user?.id || user.id !== configured) {
    return {
      allowed: false,
      reason: 'not_publisher',
      message: 'このアカウントには記事を公開する権限がありません。'
    };
  }
  return { allowed: true, reason: null, message: null };
}

function check(id, label, status, message) {
  return { id, label, status, message: message || null };
}

/**
 * Publish前の検査をまとめて実行する。
 * GitHubへの書き込みは一切行わない（読み取りのみ）。
 *
 * @returns {{
 *   ok: boolean,
 *   mode: 'create'|'update'|null,
 *   checks: Array,
 *   draft: object|null,
 *   markdown: string|null,
 *   targetPath: string|null,
 *   publicUrl: string|null,
 *   canonical: string|null,
 *   github: object,
 *   blocker: {code:string, status:number, message:string}|null
 * }}
 */
export async function runPreflight({ supabase, user, articleId }) {
  const checks = [];
  const githubConfig = publicGithubConfig();
  let blocker = null;

  // --- 1. 認証（ここへ来ている時点で認証済み） ---
  checks.push(check('auth', '認証', CHECK_OK, `ログイン中：${user?.email || user?.id || '不明'}`));

  // --- 2. Publisher権限 ---
  const publisher = checkPublisher(user);
  if (publisher.allowed) {
    checks.push(check('publisher', 'Publisher権限', CHECK_OK, '公開権限があります。'));
  } else {
    checks.push(check('publisher', 'Publisher権限', CHECK_ERROR, publisher.message));
    blocker = blocker || { code: publisher.reason, status: 403, message: publisher.message };
  }

  // --- 3. Draft存在 ---
  const { data: draft, error: dbError } = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('id', articleId)
    .maybeSingle();

  if (dbError) {
    checks.push(check('draft', 'Draft存在', CHECK_ERROR, '下書きの取得に失敗しました。'));
    return {
      ok: false, mode: null, checks, draft: null, markdown: null,
      targetPath: null, publicUrl: null, canonical: null, github: githubConfig,
      blocker: { code: 'db_error', status: 500, message: '下書きの取得に失敗しました。' }
    };
  }
  if (!draft) {
    checks.push(check('draft', 'Draft存在', CHECK_ERROR, '対象の下書きが見つかりません。'));
    return {
      ok: false, mode: null, checks, draft: null, markdown: null,
      targetPath: null, publicUrl: null, canonical: null, github: githubConfig,
      blocker: { code: 'not_found', status: 404, message: '対象の下書きが見つかりません。' }
    };
  }
  checks.push(check('draft', 'Draft存在', CHECK_OK, '下書きを読み込みました。'));

  const mode = draft.source_path ? 'update' : 'create';

  // --- 4. 必須項目 / 5. slug形式 ---
  const validationErrors = validateDraftForPublish(draft);
  const slugErrors = validationErrors.filter((m) => m.startsWith('Slug '));
  const fieldErrors = validationErrors.filter((m) => !m.startsWith('Slug '));

  if (fieldErrors.length) {
    checks.push(check('required', '必須項目', CHECK_ERROR, fieldErrors.join(' ')));
    blocker = blocker || { code: 'validation_error', status: 422, message: fieldErrors.join(' ') };
  } else {
    checks.push(check('required', '必須項目', CHECK_OK, '必要な項目はすべて入力されています。'));
  }

  if (slugErrors.length || !isValidSlug(draft.slug || '')) {
    const msg = slugErrors[0] || 'Slug は半角英数字とハイフン（a-z 0-9 -）のみ使用できます。';
    checks.push(check('slug_format', 'Slug形式', CHECK_ERROR, msg));
    blocker = blocker || { code: 'validation_error', status: 422, message: msg };
  } else {
    checks.push(check('slug_format', 'Slug形式', CHECK_OK, `/blog/${draft.slug}/ として公開されます。`));
  }

  const targetPath = draft.source_path || (isValidSlug(draft.slug || '') ? contentPathFor(draft.slug) : null);
  const publicUrl = isValidSlug(draft.slug || '') ? publicUrlPathFor(draft.slug) : null;

  // --- 公開済み記事のslug変更が起きていないか（DB側の保険） ---
  if (mode === 'update' && isValidSlug(draft.slug || '') && draft.source_path !== contentPathFor(draft.slug)) {
    const msg = `公開済み記事のSlugが変更されています（公開時: ${draft.source_path}）。Phase Dではslug変更に対応していません。`;
    checks.push(check('slug_locked', 'Slug固定', CHECK_ERROR, msg));
    blocker = blocker || { code: 'slug_locked', status: 409, message: msg };
  }

  const markdown = fieldErrors.length || slugErrors.length ? null : buildBlogMarkdown(draft);

  // --- 6〜9. GitHub側の確認 ---
  // finish() から参照するため、GitHubへアクセスしない分岐より前に宣言しておく。
  let githubCurrentSha = null;
  let githubHtmlUrl = null;

  // Publisher権限がない場合はGitHubへ一切アクセスしない（トークンを使わない）。
  if (!publisher.allowed) {
    checks.push(check('github_connection', 'GitHub接続', CHECK_SKIP, 'Publisher権限がないため確認をスキップしました。'));
    checks.push(check('github_target', mode === 'create' ? 'GitHub上のslug衝突' : 'GitHub上の記事', CHECK_SKIP, '確認をスキップしました。'));
    checks.push(check('source_sync', 'source_path / source_sha', CHECK_SKIP, '確認をスキップしました。'));
    return finish();
  }

  try {
    const conn = await checkConnection();
    checks.push(check('github_connection', 'GitHub接続', CHECK_OK, `${conn.repo} @ ${conn.branch} へ接続できました。`));

    if (!targetPath) {
      checks.push(check('github_target', 'GitHub上の記事', CHECK_ERROR, 'Slugが不正なため書き込み先を決定できません。'));
      checks.push(check('source_sync', 'source_path / source_sha', CHECK_SKIP, '確認をスキップしました。'));
      return finish();
    }

    const file = await getFile(targetPath);
    githubCurrentSha = file.exists ? file.sha : null;
    githubHtmlUrl = file.exists ? file.htmlUrl : null;

    if (mode === 'create') {
      // --- 8. 新規公開時のslug衝突防止（Supabase内の重複チェックだけでは不十分） ---
      if (file.exists) {
        const msg = `GitHubに ${targetPath} がすでに存在します。別のSlugを使用してください。`;
        checks.push(check('github_target', 'GitHub上のslug衝突', CHECK_ERROR, msg));
        blocker = blocker || { code: 'slug_exists_on_github', status: 409, message: msg };
      } else {
        checks.push(check('github_target', 'GitHub上のslug衝突', CHECK_OK, `${targetPath} は未使用です（新規作成）。`));
      }
      checks.push(check('source_sync', 'source_path / source_sha', CHECK_OK, '新規公開のため未設定です（公開成功後に保存されます）。'));
    } else {
      // --- 9. 既存記事更新時の競合防止 ---
      if (!file.exists) {
        const msg = `GitHub上に ${targetPath} が見つかりません。別経路で削除・移動された可能性があります。`;
        checks.push(check('github_target', 'GitHub上の記事', CHECK_ERROR, msg));
        blocker = blocker || { code: 'source_conflict', status: 409, message: msg };
        checks.push(check('source_sync', 'source_path / source_sha', CHECK_ERROR, 'GitHub側のファイルが存在しないため照合できません。'));
      } else {
        checks.push(check('github_target', 'GitHub上の記事', CHECK_OK, `${targetPath} を更新します。`));
        if (!draft.source_sha) {
          const msg = 'source_sha が保存されていないため、上書きの安全性を確認できません。';
          checks.push(check('source_sync', 'source_path / source_sha', CHECK_ERROR, msg));
          blocker = blocker || { code: 'source_conflict', status: 409, message: msg };
        } else if (draft.source_sha !== githubCurrentSha) {
          const msg = 'GitHub側の記事が別経路で変更されています。Adminからの上書きはできません。';
          checks.push(check('source_sync', 'source_path / source_sha', CHECK_ERROR, msg));
          blocker = blocker || { code: 'source_conflict', status: 409, message: msg };
        } else {
          checks.push(check('source_sync', 'source_path / source_sha', CHECK_OK, `SHA一致（${String(githubCurrentSha).slice(0, 7)}）。安全に更新できます。`));
        }
      }
    }
  } catch (e) {
    if (e instanceof GithubError) {
      checks.push(check('github_connection', 'GitHub接続', CHECK_ERROR, e.message));
      checks.push(check('github_target', 'GitHub上の記事', CHECK_SKIP, 'GitHubへ接続できないため確認できません。'));
      checks.push(check('source_sync', 'source_path / source_sha', CHECK_SKIP, 'GitHubへ接続できないため確認できません。'));
      blocker = blocker || { code: e.code, status: e.status, message: e.message };
    } else {
      throw e;
    }
  }

  return finish();

  function finish() {
    const ok = !blocker && checks.every((c) => c.status !== CHECK_ERROR);
    return {
      ok,
      mode,
      checks,
      draft: draft || null,
      markdown,
      targetPath,
      publicUrl,
      canonical: draft && isValidSlug(draft.slug || '') ? (draft.canonical || canonicalFor(draft.slug)) : null,
      github: { ...githubConfig, currentSha: githubCurrentSha, htmlUrl: githubHtmlUrl },
      blocker
    };
  }
}

/** Review画面へ返す用に、Draftから必要な項目だけを取り出す（body_markdownは別途返す）。 */
export function draftSummary(draft) {
  if (!draft) return null;
  return {
    id: draft.id,
    title: draft.title,
    slug: draft.slug,
    description: draft.description,
    category: draft.category,
    category_label: draft.category_label,
    author: draft.author,
    author_role: draft.author_role,
    published: draft.published,
    updated: draft.updated,
    thumbnail: draft.thumbnail,
    og_image: draft.og_image,
    cta_type: draft.cta_type,
    keywords: draft.keywords || [],
    featured: draft.featured,
    noindex: draft.noindex,
    canonical: draft.canonical,
    status: draft.status,
    source_path: draft.source_path,
    source_sha: draft.source_sha,
    body_markdown: draft.body_markdown,
    updated_at: draft.updated_at
  };
}
