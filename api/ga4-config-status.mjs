export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false });
  }
  return res.status(200).json({
    ok: true,
    ga4PropertyIdConfigured: Boolean(String(process.env.GA4_PROPERTY_ID || '').trim()),
    ga4ServiceAccountConfigured: Boolean(String(process.env.GA4_SERVICE_ACCOUNT_JSON || '').trim())
  });
}
