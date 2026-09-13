// /api/admin/** を呼び出す共通クライアント。
// 常にSupabaseの現在のaccess tokenをAuthorizationヘッダへ付与する。
// ネットワークエラー・401・その他エラーを呼び出し側が扱いやすい形に正規化し、
// どのケースでも呼び出し元が無限ローディングにならないようにする。
import { getSupabaseClient } from './admin-auth.mjs';

class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

async function authedFetch(path, options = {}) {
  let token;
  try {
    const supabase = await getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new ApiError(401, 'unauthorized', 'ログインが必要です。');
    token = session.access_token;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'network_error', '認証情報の取得に失敗しました。通信環境をご確認ください。');
  }

  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  } catch (e) {
    throw new ApiError(0, 'network_error', '通信に失敗しました。ネットワーク環境をご確認のうえ再度お試しください。');
  }

  let payload = null;
  try { payload = await res.json(); } catch (e) { /* 本文なし（204等） */ }

  if (!res.ok) {
    if (res.status === 401) {
      throw new ApiError(401, 'unauthorized', 'ログインの有効期限が切れました。再度ログインしてください。');
    }
    const err = new ApiError(res.status, payload?.error || 'error', payload?.message || 'エラーが発生しました。');
    err.payload = payload;
    throw err;
  }

  return payload;
}

// 単体記事は /api/admin/article?id=... （クエリ文字列）方式。
// [id].mjs 形式のパスセグメント動的ルートは、このVercelプロジェクト構成では
// マッチしないことを診断の上で確認したため使用していない（api/admin/article.mjs 冒頭コメント参照）。
export const AdminApi = {
  listArticles: () => authedFetch('/api/admin/articles'),
  createArticle: (data) => authedFetch('/api/admin/articles', { method: 'POST', body: JSON.stringify(data) }),
  getArticle: (id) => authedFetch(`/api/admin/article?id=${encodeURIComponent(id)}`),
  updateArticle: (id, data) => authedFetch(`/api/admin/article?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteArticle: (id) => authedFetch(`/api/admin/article?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Phase D: Publish Review（Preflight）とPublish本体。
  // publishPreview は GitHubへの書き込みを行わない読み取り専用のPreflight。
  publishPreview: (id) => authedFetch(`/api/admin/publish-preview?id=${encodeURIComponent(id)}`),
  publish: (articleId) => authedFetch('/api/admin/publish', { method: 'POST', body: JSON.stringify({ articleId }) })
};

export { ApiError };
