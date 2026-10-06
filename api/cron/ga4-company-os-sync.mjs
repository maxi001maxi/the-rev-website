import { createClient } from '@supabase/supabase-js';
import { fetchDirectGa4DailyMetrics } from '../../lib/ga4CompanyOsSync.mjs';

function bearer(req) {
  const value = String(req.headers?.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function missingConfig() {
  const keys = ['CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GA4_PROPERTY_ID', 'GA4_SERVICE_ACCOUNT_JSON'];
  return keys.filter((key) => !String(process.env[key] || '').trim());
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (!process.env.CRON_SECRET || bearer(req) !== process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const missing = missingConfig();
  if (missing.length) {
    return res.status(503).json({
      ok: false,
      error: 'ga4_direct_not_configured',
      missing: missing.filter((key) => key !== 'GA4_SERVICE_ACCOUNT_JSON')
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const startedAt = new Date().toISOString();

  try {
    const rows = await fetchDirectGa4DailyMetrics({
      propertyId: String(process.env.GA4_PROPERTY_ID).trim(),
      serviceAccountRaw: process.env.GA4_SERVICE_ACCOUNT_JSON,
      startDate: '55daysAgo',
      endDate: 'today'
    });

    const observedAt = new Date().toISOString();
    const payload = rows.map((row) => ({ ...row, observed_at: observedAt, updated_at: observedAt }));

    const upsert = await supabase
      .from('company_os_ga4_daily_metrics')
      .upsert(payload, { onConflict: 'metric_date' });

    if (upsert.error) throw new Error(`GA4_DAILY_UPSERT_FAILED: ${upsert.error.message}`);

    const source = await supabase
      .from('company_os_source_registry')
      .upsert({
        source_id: 'ga4-direct-read',
        domain: 'web_analytics',
        system: 'google_analytics_data_api',
        resource: `properties/${String(process.env.GA4_PROPERTY_ID).trim()}`,
        role: 'Morning Meeting direct GA4 read model',
        canonicality: 'READ_MODEL',
        sensitivity: 'INTERNAL',
        freshness_policy: 'daily before Morning Meeting; today is partial, completed-day trends end yesterday',
        owner: 'Company OS',
        retrieval_method: 'Vercel Cron -> Google Analytics Data API -> Supabase',
        fallback_sources: [],
        allowed_context_profiles: ['COMPANY_OVERVIEW_SAFE', 'MANAGEMENT_PRIVATE', 'WEBSITE_ANALYTICS'],
        status: 'ACTIVE',
        last_observed_at: observedAt,
        last_error: null,
        metadata: {
          property_id: String(process.env.GA4_PROPERTY_ID).trim(),
          provider: 'google-analytics-data-api-direct',
          dependency_on_gsc_wizard: false,
          rows_upserted: payload.length,
          started_at: startedAt,
          completed_at: observedAt
        },
        updated_at: observedAt
      }, { onConflict: 'source_id' });

    if (source.error) throw new Error(`GA4_SOURCE_REGISTRY_UPDATE_FAILED: ${source.error.message}`);

    return res.status(200).json({
      ok: true,
      provider: 'google-analytics-data-api-direct',
      rowsUpserted: payload.length,
      minDate: payload[0]?.metric_date || null,
      maxDate: payload.at(-1)?.metric_date || null,
      observedAt
    });
  } catch (error) {
    const message = String(error?.message || error || 'GA4_DIRECT_SYNC_FAILED').slice(0, 500);
    await supabase
      .from('company_os_source_registry')
      .upsert({
        source_id: 'ga4-direct-read',
        domain: 'web_analytics',
        system: 'google_analytics_data_api',
        resource: `properties/${String(process.env.GA4_PROPERTY_ID || 'unknown').trim()}`,
        role: 'Morning Meeting direct GA4 read model',
        canonicality: 'READ_MODEL',
        sensitivity: 'INTERNAL',
        freshness_policy: 'daily before Morning Meeting',
        owner: 'Company OS',
        retrieval_method: 'Vercel Cron -> Google Analytics Data API -> Supabase',
        fallback_sources: [],
        allowed_context_profiles: ['COMPANY_OVERVIEW_SAFE', 'MANAGEMENT_PRIVATE', 'WEBSITE_ANALYTICS'],
        status: 'DEGRADED',
        last_observed_at: new Date().toISOString(),
        last_error: message,
        metadata: {
          provider: 'google-analytics-data-api-direct',
          dependency_on_gsc_wizard: false,
          started_at: startedAt
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'source_id' });

    return res.status(502).json({ ok: false, error: 'ga4_direct_sync_failed' });
  }
}
