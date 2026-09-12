// 疎通確認用の最小Vercel Function。
// Admin本体（認証・GitHub連携・GA4連携）はPhase B以降でこのディレクトリに追加していく。
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'therev-admin-api',
    time: new Date().toISOString()
  });
}
