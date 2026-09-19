// THE REV. Editorial Console — Phase D: GitHub Contents API 共通モジュール
//
// GitHubとのやり取りはすべてこのファイルを経由する（APIファイルへ散在させない）。
// 担当範囲：
//   - 環境変数の読み取りと未設定判定
//   - GitHub接続確認（リポジトリ／ブランチの到達性）
//   - ファイル存在確認・取得（SHA取得を含む）
//   - ファイルのcreate / update
//   - GitHub APIエラーの正規化
//
// セキュリティ上の絶対条件：
//   GITHUB_TOKEN はサーバー側（Vercel Functions）でのみ使用し、
//   レスポンス・ログ・エラーメッセージへ一切含めない。
//   この関数群が返すオブジェクトにもトークンは入れない。

const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const TIMEOUT_MS = 15000;

/** 正規化済みのGitHubエラー。message はそのままAdmin画面へ表示してよい日本語。 */
export class GithubError extends Error {
  constructor(code, message, { status = 502, detail = null } = {}) {
    super(message);
    this.name = 'GithubError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
  toJSON() {
    return { error: this.code, message: this.message };
  }
}

/**
 * 環境変数を読む。トークンそのものは戻り値へ含めるが、
 * この戻り値をレスポンスへ渡してはならない（publicConfig() を使うこと）。
 */
export function getGithubConfig() {
  const token = (process.env.GITHUB_TOKEN || '').trim();
  const repo = (process.env.GITHUB_REPO || '').trim();
  const branch = (process.env.GITHUB_BRANCH || 'main').trim();

  const missing = [];
  if (!token) missing.push('GITHUB_TOKEN');
  if (!repo) missing.push('GITHUB_REPO');

  if (missing.length) {
    return {
      configured: false,
      missing,
      repo,
      branch,
      message: `GitHub連携の環境変数が未設定です（${missing.join(' / ')}）。Vercelの Settings → Environment Variables に設定してください。`
    };
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    return {
      configured: false,
      missing: ['GITHUB_REPO'],
      repo,
      branch,
      message: 'GITHUB_REPO の形式が不正です（owner/repo の形式で設定してください）。'
    };
  }

  return { configured: true, missing: [], token, repo, branch };
}

/** 画面・レスポンスへ返してよい設定情報のみ（トークンは絶対に含めない）。 */
export function publicGithubConfig() {
  const cfg = getGithubConfig();
  return {
    configured: cfg.configured,
    repo: cfg.repo || null,
    branch: cfg.branch || null,
    missing: cfg.missing
  };
}

function requireConfig() {
  const cfg = getGithubConfig();
  if (!cfg.configured) {
    throw new GithubError('github_not_configured', cfg.message, { status: 503 });
  }
  return cfg;
}

function timeoutSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(TIMEOUT_MS);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), TIMEOUT_MS).unref?.();
  return controller.signal;
}

/** GitHub APIのエラー応答を、そのままAdminへ出せるエラーへ正規化する。 */
function normalizeHttpError(status, payload) {
  const apiMessage = typeof payload?.message === 'string' ? payload.message : '';

  if (status === 401) {
    return new GithubError('github_auth_failed', 'GitHub Tokenが無効か期限切れです。Vercelの GITHUB_TOKEN を確認してください。', { status: 502 });
  }
  if (status === 403 && /rate limit/i.test(apiMessage)) {
    return new GithubError('github_rate_limited', 'GitHub APIのレート制限に達しました。しばらく待ってから再試行してください。', { status: 502 });
  }
  if (status === 403) {
    return new GithubError('github_forbidden', 'GitHub Tokenにこのリポジトリへの書き込み権限（Contents: Read and write）がありません。', { status: 502 });
  }
  if (status === 404) {
    return new GithubError('github_not_found', 'GitHub上に対象が見つかりません（リポジトリ名・ブランチ名・Tokenのアクセス範囲を確認してください）。', { status: 502 });
  }
  if (status === 409) {
    return new GithubError('github_conflict', 'GitHub側で対象ファイルが更新されているため、書き込みできませんでした。', { status: 409 });
  }
  if (status === 422) {
    return new GithubError('github_conflict', `GitHubがリクエストを受け付けませんでした（${apiMessage || '422 Unprocessable Entity'}）。ファイルが別経路で更新された可能性があります。`, { status: 409 });
  }
  if (status >= 500) {
    return new GithubError('github_unavailable', 'GitHub側で一時的なエラーが発生しています。しばらく待ってから再試行してください。', { status: 502 });
  }
  return new GithubError('github_error', `GitHub APIエラー（HTTP ${status}）${apiMessage ? `：${apiMessage}` : ''}`, { status: 502 });
}

async function githubRequest(path, { method = 'GET', body = null, allow404 = false } = {}) {
  const cfg = requireConfig();

  let res;
  try {
    res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'therev-editorial-console',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: timeoutSignal()
    });
  } catch (e) {
    // fetch自体の失敗（DNS・タイムアウト等）。原因文字列にトークンは含まれない。
    const aborted = e?.name === 'AbortError' || e?.name === 'TimeoutError';
    throw new GithubError(
      aborted ? 'github_timeout' : 'github_unreachable',
      aborted ? 'GitHubへの接続がタイムアウトしました。' : 'GitHubへ接続できませんでした。しばらく待ってから再試行してください。',
      { status: 502 }
    );
  }

  if (res.status === 404 && allow404) return { status: 404, data: null };

  let data = null;
  try { data = await res.json(); } catch { /* 本文なし */ }

  if (!res.ok) throw normalizeHttpError(res.status, data);
  return { status: res.status, data };
}

function encodeContentPath(filePath) {
  return String(filePath).split('/').map(encodeURIComponent).join('/');
}

/**
 * 接続確認。リポジトリとブランチの両方へ到達できるかを見る。
 * @returns {{ok:true, repo:string, branch:string, defaultBranch:string}}
 */
export async function checkConnection() {
  const cfg = requireConfig();
  const repoRes = await githubRequest(`/repos/${cfg.repo}`);
  const branchRes = await githubRequest(`/repos/${cfg.repo}/branches/${encodeURIComponent(cfg.branch)}`, { allow404: true });
  if (branchRes.status === 404) {
    throw new GithubError('github_branch_not_found', `ブランチ "${cfg.branch}" がGitHub上に見つかりません（GITHUB_BRANCH を確認してください）。`, { status: 502 });
  }
  return {
    ok: true,
    repo: cfg.repo,
    branch: cfg.branch,
    defaultBranch: repoRes.data?.default_branch || null
  };
}

/**
 * ファイル取得。存在しない場合は { exists:false }。
 * @returns {{exists:boolean, sha?:string, path?:string, content?:string, size?:number, htmlUrl?:string}}
 */
export async function getFile(filePath) {
  const cfg = requireConfig();
  const res = await githubRequest(
    `/repos/${cfg.repo}/contents/${encodeContentPath(filePath)}?ref=${encodeURIComponent(cfg.branch)}`,
    { allow404: true }
  );
  if (res.status === 404 || !res.data) return { exists: false };

  const data = res.data;
  if (Array.isArray(data)) {
    throw new GithubError('github_not_a_file', `GitHub上の ${filePath} はファイルではありません。`, { status: 502 });
  }
  return {
    exists: true,
    sha: data.sha,
    path: data.path,
    size: data.size,
    htmlUrl: data.html_url || null,
    content: typeof data.content === 'string' ? Buffer.from(data.content, 'base64').toString('utf8') : null
  };
}

/**
 * ディレクトリ一覧を取得。直近画像Jobの重複チェックなど、
 * Contents APIの一覧情報だけで足りる用途に使う。
 */
export async function listDirectory(directoryPath) {
  const cfg = requireConfig();
  const res = await githubRequest(
    `/repos/${cfg.repo}/contents/${encodeContentPath(directoryPath)}?ref=${encodeURIComponent(cfg.branch)}`,
    { allow404: true }
  );
  if (res.status === 404 || !res.data) return [];
  if (!Array.isArray(res.data)) {
    throw new GithubError('github_not_a_directory', `GitHub上の ${directoryPath} はディレクトリではありません。`, { status: 502 });
  }
  return res.data.map((item) => ({
    name: item.name,
    path: item.path,
    sha: item.sha,
    size: item.size,
    type: item.type,
    htmlUrl: item.html_url || null
  }));
}

/** 存在確認のみ（本文は読まない用途でもContents APIは本文を返すが、呼び出し側の意図を明示するための薄いラッパ）。 */
export async function fileExists(filePath) {
  const file = await getFile(filePath);
  return file.exists;
}

/** 現在のSHAを返す。存在しなければ null。 */
export async function getFileSha(filePath) {
  const file = await getFile(filePath);
  return file.exists ? file.sha : null;
}

/**
 * ファイルのcreate / update。
 * sha を渡した場合は update（GitHubは渡されたSHAが現在のSHAと異なれば409を返す）、
 * 渡さない場合は create（既に存在すれば GitHub が422を返す）。
 */
export async function putFile({ path: filePath, content, message, sha = null }) {
  const cfg = requireConfig();
  const res = await githubRequest(`/repos/${cfg.repo}/contents/${encodeContentPath(filePath)}`, {
    method: 'PUT',
    body: {
      message,
      content: Buffer.from(String(content), 'utf8').toString('base64'),
      branch: cfg.branch,
      ...(sha ? { sha } : {})
    }
  });
  return {
    path: res.data?.content?.path || filePath,
    contentSha: res.data?.content?.sha || null,
    commitSha: res.data?.commit?.sha || null,
    commitUrl: res.data?.commit?.html_url || null,
    htmlUrl: res.data?.content?.html_url || null
  };
}

/** GithubError を Vercel Function のレスポンスへそのまま変換する。 */
export function sendGithubError(res, err) {
  if (err instanceof GithubError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return res.status(502).json({ error: 'github_error', message: 'GitHubとの通信で予期しないエラーが発生しました。' });
}
