// Admin（/admin/）のクライアント側で使う「公開してよい」設定値のみを返す。
// SUPABASE_PUBLISHABLE_KEY はSupabaseの設計上ブラウザに公開される前提のキーであり秘密情報ではない
// （実際のアクセス制御はSupabase側のRow Level Security / Authで行う）。
// SUPABASE_SERVICE_ROLE_KEY 等の本当の秘密情報はここでは絶対に返さない。
export default function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';

  if (!supabaseUrl || !supabasePublishableKey) {
    res.status(503).json({
      error: 'not_configured',
      message: 'SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY がVercelの環境変数に設定されていません。'
    });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ supabaseUrl, supabasePublishableKey });
}
