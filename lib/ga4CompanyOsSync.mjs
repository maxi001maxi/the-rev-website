import {
  CTA_EVENTS,
  parseServiceAccount,
  getServiceAccountAccessToken,
  runGa4Report
} from './ga4Data.mjs';

const CORE_EVENTS = ['reserve_click', 'line_click', 'price_click', 'article_cta_click'];

function metric(row, index) {
  const value = Number(row?.metricValues?.[index]?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dimension(row, index) {
  return String(row?.dimensionValues?.[index]?.value ?? '');
}

export function normalizeGa4Date(value) {
  const raw = String(value || '');
  if (!/^\d{8}$/.test(raw)) throw new Error('GA4_INVALID_DATE_DIMENSION');
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export async function fetchDirectGa4DailyMetrics({
  propertyId,
  serviceAccountRaw,
  startDate = '55daysAgo',
  endDate = 'today',
  fetchImpl = fetch
}) {
  if (!String(propertyId || '').trim()) throw new Error('GA4_PROPERTY_ID_NOT_CONFIGURED');
  const serviceAccount = parseServiceAccount(serviceAccountRaw);
  const accessToken = await getServiceAccountAccessToken(serviceAccount, fetchImpl);

  const [dailyReport, eventReport] = await Promise.all([
    runGa4Report({
      propertyId,
      accessToken,
      fetchImpl,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'newUsers' }
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 100
      }
    }),
    runGa4Report({
      propertyId,
      accessToken,
      fetchImpl,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }, { name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: { values: CORE_EVENTS }
          }
        },
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 1000
      }
    })
  ]);

  const byDate = new Map();
  for (const row of dailyReport?.rows || []) {
    const date = normalizeGa4Date(dimension(row, 0));
    byDate.set(date, {
      metric_date: date,
      property_id: String(propertyId),
      sessions: metric(row, 0),
      active_users: metric(row, 1),
      page_views: metric(row, 2),
      new_users: metric(row, 3),
      reserve_click: 0,
      line_click: 0,
      price_click: 0,
      article_cta_click: 0,
      source: 'google-analytics-data-api-direct',
      data_status: 'VALUE'
    });
  }

  for (const row of eventReport?.rows || []) {
    const date = normalizeGa4Date(dimension(row, 0));
    const event = dimension(row, 1);
    if (!CORE_EVENTS.includes(event)) continue;
    if (!byDate.has(date)) {
      byDate.set(date, {
        metric_date: date,
        property_id: String(propertyId),
        sessions: 0,
        active_users: 0,
        page_views: 0,
        new_users: 0,
        reserve_click: 0,
        line_click: 0,
        price_click: 0,
        article_cta_click: 0,
        source: 'google-analytics-data-api-direct',
        data_status: 'VALUE'
      });
    }
    byDate.get(date)[event] = metric(row, 0);
  }

  return [...byDate.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

export const GA4_SYNC_EVENTS = [...CORE_EVENTS];
export const GA4_ALL_TRACKED_EVENTS = [...CTA_EVENTS];


export async function syncDirectGa4ToCompanyOs({
  supabase,
  env = process.env,
  fetchImpl = fetch
}) {
  const required = ['GA4_PROPERTY_ID', 'GA4_SERVICE_ACCOUNT_JSON'];
  const missing = required.filter((key) => !String(env[key] || '').trim());
  if (missing.length) {
    return { ok: false, status: 503, error: 'ga4_direct_not_configured', missing };
  }

  const propertyId = String(env.GA4_PROPERTY_ID).trim();
  const startedAt = new Date().toISOString();

  try {
    const rows = await fetchDirectGa4DailyMetrics({
      propertyId,
      serviceAccountRaw: env.GA4_SERVICE_ACCOUNT_JSON,
      startDate: '55daysAgo',
      endDate: 'today',
      fetchImpl
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
        resource: `properties/${propertyId}`,
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
          property_id: propertyId,
          provider: 'google-analytics-data-api-direct',
          dependency_on_gsc_wizard: false,
          rows_upserted: payload.length,
          min_metric_date: payload[0]?.metric_date || null,
          max_metric_date: payload.at(-1)?.metric_date || null,
          started_at: startedAt,
          completed_at: observedAt
        },
        updated_at: observedAt
      }, { onConflict: 'source_id' });
    if (source.error) throw new Error(`GA4_SOURCE_REGISTRY_UPDATE_FAILED: ${source.error.message}`);

    return {
      ok: true,
      status: 200,
      provider: 'google-analytics-data-api-direct',
      rowsUpserted: payload.length,
      minDate: payload[0]?.metric_date || null,
      maxDate: payload.at(-1)?.metric_date || null,
      observedAt
    };
  } catch (error) {
    const message = String(error?.message || error || 'GA4_DIRECT_SYNC_FAILED').slice(0, 500);
    const observedAt = new Date().toISOString();
    await supabase
      .from('company_os_source_registry')
      .upsert({
        source_id: 'ga4-direct-read',
        domain: 'web_analytics',
        system: 'google_analytics_data_api',
        resource: `properties/${propertyId}`,
        role: 'Morning Meeting direct GA4 read model',
        canonicality: 'READ_MODEL',
        sensitivity: 'INTERNAL',
        freshness_policy: 'daily before Morning Meeting',
        owner: 'Company OS',
        retrieval_method: 'Vercel Cron -> Google Analytics Data API -> Supabase',
        fallback_sources: [],
        allowed_context_profiles: ['COMPANY_OVERVIEW_SAFE', 'MANAGEMENT_PRIVATE', 'WEBSITE_ANALYTICS'],
        status: 'DEGRADED',
        last_observed_at: observedAt,
        last_error: message,
        metadata: {
          property_id: propertyId,
          provider: 'google-analytics-data-api-direct',
          dependency_on_gsc_wizard: false,
          started_at: startedAt,
          failed_at: observedAt
        },
        updated_at: observedAt
      }, { onConflict: 'source_id' });

    return { ok: false, status: 502, error: 'ga4_direct_sync_failed' };
  }
}
