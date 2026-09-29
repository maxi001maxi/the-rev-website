import { createClient } from '@supabase/supabase-js';
import { buildDailyManagerSnapshot, jstDateKey, isBusinessDay } from '../../lib/dailyManager.mjs';

function send(res, status, body) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const secret = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.authorization || '');
  if (!secret || auth !== `Bearer ${secret}`) {
    return send(res, 401, { ok: false, error: 'unauthorized' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GSC_WIZARD_API_KEY) {
    return send(res, 503, { ok: false, error: 'not_configured' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const businessDate = jstDateKey();
  if (!isBusinessDay()) {
    return send(res, 200, { ok: true, skipped: true, businessDate, reason: 'closed_day' });
  }
  try {
    const snapshot = await buildDailyManagerSnapshot({ supabase, businessDate, finalize: false });
    return send(res, 200, {
      ok: true,
      businessDate,
      status: snapshot.snapshot_status,
      generatedAt: snapshot.generated_at
    });
  } catch (error) {
    console.error('[cron/daily-manager] failed:', error?.code || error?.message || 'unknown');
    return send(res, 500, { ok: false, error: 'snapshot_failed' });
  }
}
