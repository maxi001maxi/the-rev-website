import { assemble as assembleSiteInsights } from '../siteInsights/assemble.mjs';
import { readEditorialSheet, readManagement, readReports, workspaceFailure } from './googleWorkspace.mjs';
import { latestIso, sectionStatus } from './normalize.mjs';
import { buildPeriod, defaultSearchRange, normalizeMode } from './time.mjs';
import { buildFacts, change, isObserved } from './facts.mjs';
import { buildPriorities, buildSignals } from './signals.mjs';
import { buildExecutiveBrief, buildPulse } from './brief.mjs';

const ARTICLE_COLUMNS = [
  'id', 'updated_at', 'editorial_synced_at', 'image_status', 'gbp_image_status', 'publish_status', 'source_path'
].join(', ');

function settled(result, failure) {
  return result.status === 'fulfilled' ? result.value : failure(result.reason);
}

export async function readEditorialDatabase(supabase) {
  const { data, error } = await supabase
    .from('admin_article_drafts')
    .select(ARTICLE_COLUMNS)
    .order('updated_at', { ascending: false });
  if (error) throw Object.assign(new Error('Editorial draft query failed.'), { code: 'db_error' });
  const rows = Array.isArray(data) ? data : [];
  const publishedRows = rows.filter((row) => row.publish_status === 'PUBLISHED');
  const review = rows.filter((row) => row.publish_status !== 'PUBLISHED' && row.image_status === 'READY').length;
  const draft = Math.max(0, rows.length - publishedRows.length - review);
  const errors = rows.filter((row) => row.image_status === 'ERROR' || row.gbp_image_status === 'ERROR').length;
  return {
    status: rows.length ? 'VALUE' : 'ZERO',
    source: 'supabase:admin_article_drafts',
    updatedAt: latestIso(rows.flatMap((row) => [row.updated_at, row.editorial_synced_at])),
    counts: { draft, review, published: publishedRows.length },
    recentPublished: publishedRows.slice(0, 5).map((row) => ({
      publishedAt: row.updated_at || row.editorial_synced_at || null,
      path: typeof row.source_path === 'string' && row.source_path.startsWith('content/blog/') ? row.source_path : null
    })),
    errors
  };
}

function databaseFailure(error) {
  return {
    status: 'ERROR', source: 'supabase:admin_article_drafts', updatedAt: null,
    reasonCode: error?.code || 'db_error', message: 'Editorialの作業状態を取得できませんでした。',
    counts: { draft: null, review: null, published: null }, recentPublished: [], errors: null
  };
}

export function slimSiteInsights(data) {
  const wanted = [
    'searchClicks', 'searchImpressions', 'searchCtr', 'sessions', 'activeUsers', 'pageViews',
    'bookingIntent', 'lineIntent', 'priceIntent', 'articleCtaIntent'
  ];
  const metrics = Object.fromEntries(wanted.map((key) => [key, data?.summary?.[key] || {
    status: 'UNKNOWN', value: null, unit: key === 'searchCtr' ? 'ratio' : 'count', source: null, reasonCode: 'metric_missing'
  }]));
  return {
    status: sectionStatus(Object.values(metrics)),
    providerStatus: data?.status || 'UNAVAILABLE',
    source: 'site_insights', updatedAt: data?.generatedAt || null, range: data?.range || null,
    metrics, trend: data?.trend || [],
    search: {
      queries: data?.search?.queries?.rows || [],
      comparison: data?.search?.comparison?.rows || []
    },
    insights: (data?.insights || []).slice(0, 4).map((insight) => ({
      ruleId: insight.ruleId, headline: insight.headline, confidence: insight.confidence, evidence: insight.evidence || []
    })),
    health: data?.health || {}
  };
}

function siteFailure(error) {
  return {
    status: error?.code === 'not_configured' ? 'NOT_CONFIGURED' : 'ERROR', source: 'site_insights', updatedAt: null,
    reasonCode: error?.code || 'provider_error', message: 'Site Insightsを取得できませんでした。',
    metrics: {}, trend: [], search: { queries: [], comparison: [] }, insights: [], health: {}
  };
}

export function mergeEditorial(sheet, database) {
  return {
    status: sectionStatus([sheet, database]), source: 'editorial_master_sheet + supabase:admin_article_drafts',
    updatedAt: latestIso([sheet.updatedAt, database.updatedAt]),
    counts: database.counts || { draft: null, review: null, published: null },
    recentPublished: database.recentPublished || [],
    gbpDrafts: sheet.gbpDrafts || { ready: null, blocked: null, published: null },
    schedule: sheet.schedule || [],
    syncErrors: typeof sheet.syncErrors === 'number' || typeof database.errors === 'number'
      ? Number(sheet.syncErrors || 0) + Number(database.errors || 0) : null,
    sources: {
      sheet: { status: sheet.status, updatedAt: sheet.updatedAt || null, reasonCode: sheet.reasonCode || null },
      database: { status: database.status, updatedAt: database.updatedAt || null, reasonCode: database.reasonCode || null }
    }
  };
}

function healthStatus(raw) {
  if (['VALUE', 'ZERO', 'OK'].includes(raw)) return 'OK';
  if (raw === 'STALE') return 'STALE';
  if (raw === 'NOT_CONFIGURED') return 'NOT_CONFIGURED';
  return 'ERROR';
}

function healthItem(key, label, rawStatus, source, updatedAt, reasonCode = null) {
  const status = healthStatus(rawStatus);
  return {
    key, label, status, rawStatus: rawStatus || 'UNKNOWN', source, updatedAt: updatedAt || null, reasonCode,
    evidence: [{ key: `health.${key}`, status: rawStatus || 'UNKNOWN', value: null, unit: 'state', source, updatedAt, quality: 'SYSTEM' }]
  };
}

function buildDataHealth({ management, webSearch, editorial, analysis }) {
  const siteHealth = webSearch.health || {};
  const ctaStatuses = ['bookingIntent', 'lineIntent', 'priceIntent', 'articleCtaIntent'].map((key) => webSearch.metrics?.[key]?.status);
  const ctaStatus = ctaStatuses.some((status) => ['VALUE', 'ZERO'].includes(status)) ? 'VALUE'
    : ctaStatuses.every((status) => status === 'NOT_CONFIGURED') ? 'NOT_CONFIGURED'
      : ctaStatuses.some((status) => status === 'ERROR') ? 'ERROR' : 'UNKNOWN';
  return [
    healthItem('kpi', 'KPI', management.status, management.source, management.updatedAt, management.reasonCode),
    healthItem('search', 'Search', siteHealth.search?.status || webSearch.status, 'gsc', webSearch.updatedAt, siteHealth.search?.reasonCode),
    healthItem('ga4', 'GA4', siteHealth.ga4?.status || webSearch.status, 'ga4', webSearch.updatedAt, siteHealth.ga4?.reasonCode),
    healthItem('cta', 'CTA', ctaStatus, 'site_insights:cta_events', webSearch.updatedAt),
    healthItem('editorial', 'Editorial', editorial.sources?.sheet?.status || editorial.status, 'editorial_master_sheet', editorial.sources?.sheet?.updatedAt),
    healthItem('supabase', 'Supabase', editorial.sources?.database?.status || editorial.status, 'supabase:admin_article_drafts', editorial.sources?.database?.updatedAt),
    healthItem('drive', 'Drive', analysis.status, 'google_drive', analysis.updatedAt, analysis.reasonCode),
    healthItem('gbp', 'GBP', siteHealth.googleBusiness?.status || 'NOT_CONFIGURED', 'google_business', webSearch.updatedAt)
  ];
}

function conversion(from, to) {
  if (!isObserved(from) || !isObserved(to) || from.value === 0) return { status: 'UNKNOWN', value: null, reasonCode: 'conversion_unavailable' };
  return { status: to.value === 0 ? 'ZERO' : 'VALUE', value: to.value / from.value, unit: 'ratio' };
}

function buildFunnel(facts) {
  const unknown = (key) => ({ key, status: 'UNKNOWN', value: null, unit: 'count', source: null, reasonCode: 'source_not_available' });
  const ctaItems = [facts.growth.reserveCta, facts.growth.lineCta, facts.growth.priceCta, facts.growth.articleCta];
  const ctaFact = ctaItems.every(isObserved)
    ? { key: 'growth.ctaTotal', status: ctaItems.reduce((sum, item) => sum + item.value, 0) === 0 ? 'ZERO' : 'VALUE', value: ctaItems.reduce((sum, item) => sum + item.value, 0), unit: 'count', source: 'site_insights:cta_events' }
    : unknown('growth.ctaTotal');
  const stages = [
    { key: 'impressions', label: 'Search Impressions', fact: facts.growth.searchImpressions },
    { key: 'clicks', label: 'Search Clicks', fact: facts.growth.searchClicks },
    { key: 'sessions', label: 'Sessions', fact: facts.growth.sessions },
    { key: 'cta', label: 'CTA', fact: ctaFact },
    { key: 'inquiry', label: 'Inquiry', fact: unknown('customer.inquiry') },
    { key: 'trial', label: 'Trial', fact: unknown('customer.trial') },
    { key: 'paid', label: 'Paid', fact: facts.customers.newPaid }
  ];
  return {
    stages,
    conversions: stages.slice(0, -1).map((stage, index) => ({
      from: stage.key, to: stages[index + 1].key, ...conversion(stage.fact, stages[index + 1].fact)
    }))
  };
}

function buildOpportunities(facts, signals, webSearch) {
  const trend = (key, label) => {
    const result = change(facts.growth[key], facts.growth[`${key}Previous`]);
    return { key, label, ...result, current: facts.growth[key], previous: facts.growth[`${key}Previous`] };
  };
  return {
    trends: [trend('searchImpressions', 'Impressions'), trend('searchClicks', 'Clicks'), trend('sessions', 'Sessions'), trend('reserveCta', 'Reserve CTA')],
    ranked: signals.filter((item) => ['SEARCH_CTR_OPPORTUNITY', 'TRAFFIC_NOT_CONVERTING', 'WEB_TRAFFIC_DECLINE'].includes(item.id)),
    queries: (webSearch.search?.queries || []).slice(0, 5).map((row) => ({
      query: row.key, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position
    }))
  };
}

function buildEditorialImpact(editorial, facts) {
  const searchChange = change(facts.growth.searchClicks, facts.growth.searchClicksPrevious);
  const sessionsChange = change(facts.growth.sessions, facts.growth.sessionsPrevious);
  const ctaChange = change(facts.growth.reserveCta, facts.growth.reserveCtaPrevious);
  return {
    facts: facts.editorial,
    schedule: editorial.schedule || [], recentPublished: editorial.recentPublished || [],
    observedAfterPublishing: isObserved(facts.editorial.published) && facts.editorial.published.value > 0
      ? { statement: '公開済み記事と同じ比較期間の変化です。記事が原因とは断定しません。', search: searchChange, sessions: sessionsChange, reserveCta: ctaChange }
      : null
  };
}

function normalizeRequest(request) {
  if (typeof request === 'string') return { mode: 'week', searchRange: request, legacy: true };
  const mode = normalizeMode(request?.mode || 'week');
  const searchRange = request?.searchRange || defaultSearchRange(mode);
  return { mode, searchRange, legacy: false };
}

export async function assembleIntelligence(request = {}, {
  supabase, userId, env = process.env, now = new Date(), dependencies = {}
} = {}) {
  const { mode, searchRange, legacy } = normalizeRequest(request);
  if (!mode || !['7d', '28d', '90d'].includes(searchRange)) throw Object.assign(new Error('Invalid period.'), { code: 'invalid_query' });
  const period = buildPeriod(mode, now);
  const managementReader = dependencies.readManagement || readManagement;
  const editorialReader = dependencies.readEditorialSheet || readEditorialSheet;
  const reportsReader = dependencies.readReports || readReports;
  const databaseReader = dependencies.readEditorialDatabase || readEditorialDatabase;
  const siteReader = dependencies.assembleSiteInsights || assembleSiteInsights;
  const options = { env, now };
  const [managementResult, siteResult, editorialSheetResult, editorialDbResult, reportsResult] = await Promise.allSettled([
    managementReader(options), siteReader(searchRange, { userId }), editorialReader(options), databaseReader(supabase), reportsReader(options)
  ]);
  const management = settled(managementResult, (error) => ({
    ...workspaceFailure(error, 'KPI_70_AI_MEETING_EXPORT'), metrics: {}, priorities: [], dataQuality: { status: 'UNKNOWN', label: 'UNKNOWN', issues: null }
  }));
  const webSearch = siteResult.status === 'fulfilled' ? slimSiteInsights(siteResult.value) : siteFailure(siteResult.reason);
  const editorialSheet = settled(editorialSheetResult, (error) => ({
    ...workspaceFailure(error, 'editorial_master_sheet'), schedule: [], gbpDrafts: { ready: null, blocked: null, published: null }, syncErrors: null
  }));
  const editorialDatabase = settled(editorialDbResult, databaseFailure);
  const editorial = mergeEditorial(editorialSheet, editorialDatabase);
  const analysis = settled(reportsResult, (error) => ({ ...workspaceFailure(error, 'google_drive'), reports: [] }));

  const facts = buildFacts({ period, management, webSearch, editorial, analysis }, now);
  const dataHealth = buildDataHealth({ management, webSearch, editorial, analysis });
  const signals = buildSignals({ facts, editorialSchedule: editorial.schedule, dataHealth, searchRange, now });
  const priorities = buildPriorities(signals);
  const executive = {
    pulse: buildPulse({ facts, signals, dataHealth }),
    brief: buildExecutiveBrief({ period, facts, signals, priorities })
  };
  const revenueComparison = change(facts.revenue.current, facts.revenue.previousComparable);
  const responseStatus = dataHealth.some((item) => item.status !== 'OK') ? 'PARTIAL' : 'VALUE';

  const response = {
    schemaVersion: '0.2', generatedAt: now.toISOString(), status: responseStatus,
    period, searchRange,
    executive,
    revenue: {
      current: facts.revenue.current, previousComparable: facts.revenue.previousComparable,
      previousFull: facts.revenue.previousFull, difference: revenueComparison,
      newPaid: facts.revenue.newPaid, monthly: facts.revenue.monthly,
      trend: [facts.revenue.previousComparable, facts.revenue.current].filter(Boolean)
    },
    growth: { facts: facts.growth, funnel: buildFunnel(facts), opportunities: buildOpportunities(facts, signals, webSearch) },
    customers: facts.customers,
    editorial: buildEditorialImpact(editorial, facts),
    intelligence: signals,
    priorities,
    reports: analysis,
    dataHealth,
    evidence: {
      sources: { management: management.source, growth: webSearch.source, editorial: editorial.source, reports: analysis.source },
      updatedAt: facts.updatedAt
    }
  };

  // Keep the v0.1 reader contract only for legacy range-only callers while the
  // v0.2 UI and API use the normalized executive response above.
  if (legacy) response.sections = { management, webSearch, editorial, analysis };
  return response;
}
