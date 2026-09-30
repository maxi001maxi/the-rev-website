import { assemble as assembleSiteInsights } from '../siteInsights/assemble.mjs';
import { readEditorialSheet, readManagement, readReports, workspaceFailure } from './googleWorkspace.mjs';
import { latestIso, sectionStatus } from './normalize.mjs';

const ARTICLE_COLUMNS = [
  'id',
  'updated_at',
  'editorial_synced_at',
  'image_status',
  'gbp_image_status',
  'publish_status',
  'source_path'
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
  const published = rows.filter((row) => row.publish_status === 'PUBLISHED').length;
  const review = rows.filter((row) => row.publish_status !== 'PUBLISHED' && row.image_status === 'READY').length;
  const draft = Math.max(0, rows.length - published - review);
  const errors = rows.filter((row) => row.image_status === 'ERROR' || row.gbp_image_status === 'ERROR').length;
  return {
    status: rows.length ? 'VALUE' : 'ZERO',
    source: 'supabase:admin_article_drafts',
    updatedAt: latestIso(rows.flatMap((row) => [row.updated_at, row.editorial_synced_at])),
    counts: { draft, review, published },
    errors
  };
}

function databaseFailure(error) {
  return {
    status: 'ERROR',
    source: 'supabase:admin_article_drafts',
    updatedAt: null,
    reasonCode: error?.code || 'db_error',
    message: 'Editorialの作業状態を取得できませんでした。',
    counts: { draft: null, review: null, published: null },
    errors: null
  };
}

export function slimSiteInsights(data) {
  const wanted = [
    'searchClicks',
    'searchImpressions',
    'sessions',
    'activeUsers',
    'pageViews',
    'bookingIntent',
    'lineIntent',
    'priceIntent',
    'articleCtaIntent'
  ];
  const metrics = Object.fromEntries(wanted.map((key) => [key, data?.summary?.[key] || {
    status: 'UNKNOWN', value: null, unit: 'count', source: null, reasonCode: 'metric_missing'
  }]));
  return {
    status: sectionStatus(Object.values(metrics)),
    providerStatus: data?.status || 'UNAVAILABLE',
    source: 'site_insights',
    updatedAt: data?.generatedAt || null,
    range: data?.range || null,
    metrics,
    insights: (data?.insights || []).slice(0, 4).map((insight) => ({
      ruleId: insight.ruleId,
      headline: insight.headline,
      confidence: insight.confidence
    })),
    health: data?.health || {}
  };
}

function siteFailure(error) {
  return {
    status: error?.code === 'not_configured' ? 'NOT_CONFIGURED' : 'ERROR',
    source: 'site_insights',
    updatedAt: null,
    reasonCode: error?.code || 'provider_error',
    message: 'Site Insightsを取得できませんでした。',
    metrics: {},
    insights: [],
    health: {}
  };
}

export function mergeEditorial(sheet, database) {
  return {
    status: sectionStatus([sheet, database]),
    source: 'editorial_master_sheet + supabase:admin_article_drafts',
    updatedAt: latestIso([sheet.updatedAt, database.updatedAt]),
    counts: database.counts || { draft: null, review: null, published: null },
    gbpDrafts: sheet.gbpDrafts || { ready: null, blocked: null, published: null },
    schedule: sheet.schedule || [],
    syncErrors: typeof sheet.syncErrors === 'number' || typeof database.errors === 'number'
      ? Number(sheet.syncErrors || 0) + Number(database.errors || 0)
      : null,
    sources: {
      sheet: { status: sheet.status, updatedAt: sheet.updatedAt || null, reasonCode: sheet.reasonCode || null },
      database: { status: database.status, updatedAt: database.updatedAt || null, reasonCode: database.reasonCode || null }
    }
  };
}

export async function assembleIntelligence(range = '28d', {
  supabase,
  userId,
  env = process.env,
  now = new Date(),
  dependencies = {}
} = {}) {
  const managementReader = dependencies.readManagement || readManagement;
  const editorialReader = dependencies.readEditorialSheet || readEditorialSheet;
  const reportsReader = dependencies.readReports || readReports;
  const databaseReader = dependencies.readEditorialDatabase || readEditorialDatabase;
  const siteReader = dependencies.assembleSiteInsights || assembleSiteInsights;
  const options = { env, now };
  const [managementResult, siteResult, editorialSheetResult, editorialDbResult, reportsResult] = await Promise.allSettled([
    managementReader(options),
    siteReader(range, { userId }),
    editorialReader(options),
    databaseReader(supabase),
    reportsReader(options)
  ]);
  const management = settled(managementResult, (error) => ({
    ...workspaceFailure(error, 'KPI_70_AI_MEETING_EXPORT'),
    metrics: {}, priorities: [], dataQuality: { status: 'UNKNOWN', label: 'UNKNOWN', issues: null }
  }));
  const webSearch = siteResult.status === 'fulfilled' ? slimSiteInsights(siteResult.value) : siteFailure(siteResult.reason);
  const editorialSheet = settled(editorialSheetResult, (error) => ({
    ...workspaceFailure(error, 'editorial_master_sheet'),
    schedule: [], gbpDrafts: { ready: null, blocked: null, published: null }, syncErrors: null
  }));
  const editorialDatabase = settled(editorialDbResult, databaseFailure);
  const analysis = settled(reportsResult, (error) => ({
    ...workspaceFailure(error, 'google_drive'),
    reports: []
  }));
  if ((!analysis.priorities || !analysis.priorities.length) && management.priorities?.length) {
    analysis.reportStatus = analysis.status;
    analysis.priorities = management.priorities;
    analysis.prioritySource = 'KPI_70_AI_MEETING_EXPORT:PREVIOUS_MEETING';
    analysis.status = 'VALUE';
    analysis.source = `${analysis.source} + KPI_70_AI_MEETING_EXPORT`;
    analysis.updatedAt = latestIso([analysis.updatedAt, management.updatedAt]);
  }
  return {
    schemaVersion: '0.1',
    generatedAt: now.toISOString(),
    range,
    status: sectionStatus([management, webSearch, editorialSheet, editorialDatabase, analysis]),
    sections: {
      management,
      webSearch,
      editorial: mergeEditorial(editorialSheet, editorialDatabase),
      analysis
    }
  };
}
