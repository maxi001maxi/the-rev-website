import { latestIso } from './normalize.mjs';

const OBSERVED = new Set(['VALUE', 'ZERO']);
const VALID = new Set(['VALUE', 'ZERO', 'UNKNOWN', 'NOT_CONFIGURED', 'STALE', 'ERROR', 'PARTIAL']);

function ageHours(updatedAt, now) {
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return null;
  return Math.max(0, (now.getTime() - Date.parse(updatedAt)) / 3600000);
}

export function fact(metric, {
  key,
  source = metric?.source || null,
  updatedAt = metric?.updatedAt || metric?.asOf || null,
  quality = 'OBSERVED',
  staleAfterHours = 48,
  reasonCode = metric?.reasonCode || null,
  evidence = []
} = {}, now = new Date()) {
  const inputStatus = VALID.has(metric?.status) ? metric.status : 'UNKNOWN';
  const freshnessAge = ageHours(updatedAt, now);
  const stale = inputStatus === 'STALE' || (OBSERVED.has(inputStatus) && freshnessAge !== null && freshnessAge > staleAfterHours);
  const status = stale ? 'STALE' : inputStatus;
  return {
    key,
    status,
    value: OBSERVED.has(status) || status === 'PARTIAL' ? metric?.value ?? null : null,
    unit: metric?.unit || 'count',
    source,
    updatedAt,
    freshness: stale ? 'STALE' : freshnessAge === null ? 'UNKNOWN' : 'CURRENT',
    quality: status === 'PARTIAL' ? 'PARTIAL' : quality,
    reasonCode: stale ? 'source_stale' : reasonCode,
    evidence
  };
}

export function unknownFact(key, { source = null, unit = 'count', reasonCode = 'not_available', status = 'UNKNOWN' } = {}, now = new Date()) {
  return fact({ status, value: null, unit, source, reasonCode }, { key, source, reasonCode }, now);
}

function comparable(metric, key, now) {
  return metric?.previous
    ? fact(metric.previous, { key, source: metric.previous.source || metric.source, updatedAt: metric.previous.asOf || metric.asOf }, now)
    : unknownFact(key, { source: metric?.source, unit: metric?.unit, reasonCode: 'comparison_unavailable' }, now);
}

function metricFact(metric, key, now) {
  return fact(metric, { key, updatedAt: metric?.asOf || metric?.updatedAt, staleAfterHours: 72 }, now);
}

export function buildFacts({ period, management = {}, webSearch = {}, editorial = {}, analysis = {} }, now = new Date()) {
  const managementMetrics = management.metrics || {};
  let revenueCurrent;
  let revenuePreviousComparable;
  let revenuePreviousFull;
  if (period.key === 'THIS_WEEK') {
    revenueCurrent = metricFact(managementMetrics.currentRevenue, 'revenue.current', now);
    revenuePreviousComparable = unknownFact('revenue.previousComparable', { source: 'KPI_70_AI_MEETING_EXPORT', unit: 'yen', reasonCode: 'kpi_export_has_previous_full_only' }, now);
    revenuePreviousFull = metricFact(managementMetrics.lastClosedRevenue, 'revenue.previousFull', now);
  } else if (period.key === 'THIS_MONTH') {
    revenueCurrent = metricFact(managementMetrics.monthToDateRevenue, 'revenue.current', now);
    revenuePreviousComparable = unknownFact('revenue.previousComparable', { source: 'KPI_70_AI_MEETING_EXPORT', unit: 'yen', reasonCode: 'previous_month_comparable_missing' }, now);
    revenuePreviousFull = unknownFact('revenue.previousFull', { source: 'KPI_70_AI_MEETING_EXPORT', unit: 'yen', reasonCode: 'previous_month_full_missing' }, now);
  } else {
    revenueCurrent = unknownFact('revenue.current', { source: 'KPI_70_AI_MEETING_EXPORT', unit: 'yen', reasonCode: 'daily_revenue_not_exported' }, now);
    revenuePreviousComparable = unknownFact('revenue.previousComparable', { source: 'KPI_70_AI_MEETING_EXPORT', unit: 'yen', reasonCode: 'daily_revenue_not_exported' }, now);
    revenuePreviousFull = null;
  }

  const weekOnly = (metric, key) => {
    if (period.key === 'THIS_WEEK') return metricFact(metric, key, now);
    if (period.key === 'THIS_MONTH' && OBSERVED.has(metric?.status)) {
      return fact({ ...metric, status: 'PARTIAL' }, { key, quality: 'PARTIAL', reasonCode: 'current_week_only' }, now);
    }
    return unknownFact(key, { source: metric?.source || 'KPI_70_AI_MEETING_EXPORT', unit: metric?.unit, reasonCode: 'mode_granularity_unavailable' }, now);
  };

  const site = webSearch.metrics || {};
  const growth = {};
  for (const [key, metric] of Object.entries({
    searchImpressions: site.searchImpressions,
    searchClicks: site.searchClicks,
    searchCtr: site.searchCtr,
    sessions: site.sessions,
    activeUsers: site.activeUsers,
    pageViews: site.pageViews,
    reserveCta: site.bookingIntent,
    lineCta: site.lineIntent,
    priceCta: site.priceIntent,
    articleCta: site.articleCtaIntent
  })) {
    growth[key] = metricFact(metric, `growth.${key}`, now);
    growth[`${key}Previous`] = comparable(metric, `growth.${key}.previous`, now);
  }

  const countFact = (value, key, source) => metricFact({
    status: typeof value === 'number' ? (value === 0 ? 'ZERO' : 'VALUE') : 'UNKNOWN', value, unit: 'count', source, updatedAt: editorial.updatedAt
  }, key, now);
  const editorialFacts = {
    draft: countFact(editorial.counts?.draft, 'editorial.draft', 'supabase:admin_article_drafts'),
    ready: countFact(editorial.counts?.review, 'editorial.ready', 'supabase:admin_article_drafts'),
    published: countFact(editorial.counts?.published, 'editorial.published', 'supabase:admin_article_drafts'),
    errors: countFact(editorial.syncErrors, 'editorial.errors', 'editorial_sheet + supabase'),
    gbpReady: countFact(editorial.gbpDrafts?.ready, 'editorial.gbpReady', 'editorial_master_sheet')
  };

  return {
    revenue: {
      current: revenueCurrent,
      previousComparable: revenuePreviousComparable,
      previousFull: revenuePreviousFull,
      newPaid: weekOnly(managementMetrics.newPaidCustomers, 'customer.newPaid'),
      monthly: metricFact(managementMetrics.monthToDateRevenue, 'revenue.monthly', now)
    },
    customers: {
      newPaid: weekOnly(managementMetrics.newPaidCustomers, 'customer.newPaid'),
      paid: weekOnly(managementMetrics.paidCustomers, 'customer.paid'),
      followUp: weekOnly(managementMetrics.followUp, 'customer.followUp'),
      nextBooking: weekOnly(managementMetrics.nextBooking, 'customer.nextBooking')
    },
    growth,
    editorial: editorialFacts,
    reports: {
      status: analysis.status || 'UNKNOWN', source: analysis.source || 'google_drive',
      updatedAt: analysis.updatedAt || null, count: Array.isArray(analysis.reports) ? analysis.reports.length : 0
    },
    updatedAt: latestIso([management.updatedAt, webSearch.updatedAt, editorial.updatedAt, analysis.updatedAt])
  };
}

export function isObserved(item) {
  return OBSERVED.has(item?.status);
}

export function change(current, previous) {
  if (!isObserved(current) || !isObserved(previous)) return { status: 'UNKNOWN', absolute: null, percent: null, direction: 'UNKNOWN' };
  const absolute = current.value - previous.value;
  const percent = previous.value === 0 ? null : absolute / previous.value;
  return { status: absolute === 0 ? 'ZERO' : 'VALUE', absolute, percent, direction: absolute > 0 ? 'UP' : absolute < 0 ? 'DOWN' : 'FLAT' };
}
