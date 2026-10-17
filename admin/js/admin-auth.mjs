// THE REV. Editorial Console — Supabase Auth 共有ヘルパー。
// Reactやビルドツールは使わず、Supabase JS SDKをESM CDNから直接importする。
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let clientPromise = null;

// SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY は /api/config から取得する。
// publishable keyはSupabaseの設計上ブラウザに公開される前提の値（秘密情報ではない）。
async function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error('config_fetch_failed');
        return r.json();
      })
      .then(({ supabaseUrl, supabasePublishableKey }) => createClient(supabaseUrl, supabasePublishableKey));
  }
  return clientPromise;
}

// ログイン画面など「未ログインでもよい」ページで、既存セッションの有無だけ知りたい場合。
export async function getSession() {
  const supabase = await getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return { supabase, session };
}

// 認証必須ページの入口で呼ぶ。未ログイン、またはセッション確認自体に失敗した場合
// （/api/config未設定・ネットワークエラー等）は、ハングさせず安全側に倒して
// /admin/login/ へ遷移してnullを返す。
export async function requireSession() {
  try {
    const { supabase, session } = await getSession();
    if (!session) {
      location.replace('/admin/login/');
      return null;
    }
    return { supabase, session };
  } catch (e) {
    location.replace('/admin/login/');
    return null;
  }
}

export async function signInWithPassword(email, password) {
  const supabase = await getSupabaseClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  await supabase.auth.signOut();
  location.replace('/admin/login/');
}

export { getSupabaseClient };
