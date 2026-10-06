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
