import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntelligenceHandler } from '../api/admin/site-insights.mjs';
import { assembleIntelligence, slimSiteInsights } from '../lib/intelligence/assemble.mjs';
import {
  normalizeManagementValues,
  normalizeReport,
  extractReportPeriod,
  selectLatestReport
} from '../lib/intelligence/googleWorkspace.mjs';
import { googleSerialToIso, intelligenceMetric, normalizeDate } from '../lib/intelligence/normalize.mjs';

function response() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function adminContext(active = true) {
  const membership = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: { active }, error: null }; }
  };
  return { user: { id: 'admin-user' }, supabase: { from: () => membership } };
}

test('API requires authentication', async () => {
  const handler = createIntelligenceHandler({
    getContext: async () => ({ error: 'unauthorized', status: 401 }),
    assembleData: async () => ({})
  });
  const res = response();
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
});

test('API rejects inactive admins', async () => {
  const handler = createIntelligenceHandler({ getContext: async () => adminContext(false) });
  const res = response();
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'forbidden');
});

test('API accepts 7d, 28d and 90d', async () => {
  const seen = [];
  const handler = createIntelligenceHandler({
    getContext: async () => adminContext(true),
    assembleData: async (range) => { seen.push(range); return { range }; }
  });
  for (const range of ['7d', '28d', '90d']) {
    const res = response();
    await handler({ method: 'GET', query: { range }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.range, range);
  }
  assert.deepEqual(seen, ['7d', '28d', '90d']);
});

test('API rejects invalid ranges and methods', async () => {
  const handler = createIntelligenceHandler({ getContext: async () => adminContext(true) });
  const invalid = response();
  await handler({ method: 'GET', query: { range: '30d' }, headers: {} }, invalid);
  assert.equal(invalid.statusCode, 400);
  const method = response();
  await handler({ method: 'POST', query: {}, headers: {} }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.Allow, 'GET');
});

test('UNKNOWN is not converted to zero and zero remains ZERO', () => {
  assert.equal(intelligenceMetric(null).status, 'UNKNOWN');
  assert.equal(intelligenceMetric(null).value, null);
  assert.equal(intelligenceMetric(0).status, 'ZERO');
  assert.equal(intelligenceMetric(0).value, 0);
});

test('Spreadsheet dates are normalized from Asia/Tokyo without a nine-hour drift', () => {
  assert.equal(normalizeDate('2026/09/30 09:30:00'), '2026-09-30T00:30:00.000Z');
  assert.equal(googleSerialToIso(25569), '1969-12-31T15:00:00.000Z');
});

test('management contract filters customer PII and preserves data quality', () => {
  const values = [
    ['section', 'record_key', 'metric_key', 'label', 'value_number', 'value_text', 'value_date', 'unit', 'source', 'source_ref', 'updated_at', 'data_quality'],
    ['CURRENT_WEEK', '2026-W40', 'adjusted_revenue', '調整後売上', 0, null, null, 'yen', 'cashbook', 'E', '2026/09/30', 'CURRENT｜OK'],
    ['CURRENT_WEEK', '2026-W40', 'new_paid_customers', '新規有料顧客', null, null, null, 'people', 'kpi', 'G', '2026/09/30', 'UNMEASURED'],
    ['LAST_CLOSED_WEEK', '2026-W39', 'adjusted_revenue', '調整後売上', 10000, null, null, 'yen', 'cashbook', 'E', '2026/09/29', 'OK'],
    ['CUSTOMER_ACTION', 'Private Person', 'followup_customer', 'Private Person', 19, 'phone 090-0000-0000', null, 'days', 'review', 'row 1', '2026/09/30', 'OK'],
    ['PREVIOUS_MEETING', 'M1', 'priority_1', 'Priority 1', null, '計測状態を確認する', null, 'text', 'meeting', 'H', '2026/09/29', 'OK']
  ];
  const result = normalizeManagementValues(values, new Date('2026-10-10T00:00:00Z'));
  assert.equal(result.metrics.currentRevenue.status, 'ZERO');
  assert.equal(result.metrics.newPaidCustomers.status, 'UNKNOWN');
  assert.equal(result.metrics.weekOverWeek.reasonCode, 'current_week_partial_not_comparable');
  assert.equal(result.priorities.length, 1);
  assert.equal(result.priorities[0].status, 'STALE');
  assert.equal(result.priorities[0].ownerStatus, 'UNKNOWN');
  assert.equal(JSON.stringify(result).includes('Private Person'), false);
  assert.equal(JSON.stringify(result).includes('090-0000-0000'), false);
});

test('report selector excludes TEST, DRAFT and QC files', () => {
  const files = [
    { name: '2026-09-30_週次経営レポート_TEST', modifiedTime: '2026-09-30T10:00:00Z' },
    { name: '2026-09-29_週次経営レポート_DRAFT', modifiedTime: '2026-09-30T09:00:00Z' },
    { name: '2026-09-28_週次経営レポート', modifiedTime: '2026-09-30T08:00:00Z' }
  ];
  assert.equal(selectLatestReport(files, (file) => /週次経営レポート/.test(file.name)).name, '2026-09-28_週次経営レポート');
});

test('dated report selection does not mistake an operations spec for a report', () => {
  const files = [
    { name: '00_Claude_週次マーケティング分析_運用仕様', modifiedTime: '2026-09-30T10:00:00Z' },
    { name: '2026-09-21〜2026-09-27_THE_REV_週次マーケティング分析', modifiedTime: '2026-09-27T10:00:00Z' }
  ];
  const selected = selectLatestReport(files, (file) => /^\d{4}-\d{2}-\d{2}/.test(file.name) && /週次マーケティング分析/.test(file.name));
  assert.equal(selected.name, '2026-09-21〜2026-09-27_THE_REV_週次マーケティング分析');
});

test('old reports are marked STALE', () => {
  const report = normalizeReport({
    name: 'Weekly Report',
    modifiedTime: '2026-09-01T00:00:00Z',
    webViewLink: 'https://docs.google.com/document/d/report/edit'
  }, [], new Date('2026-09-30T00:00:00Z'));
  assert.equal(report.status, 'STALE');
});

test('report contract exposes period, generatedAt and summary', () => {
  const report = normalizeReport({
    name: '2026-09-14〜2026-09-19_THE_REV_週次経営レポート',
    createdTime: '2026-09-20T01:00:00Z',
    modifiedTime: '2026-09-20T02:00:00Z',
    webViewLink: 'https://docs.google.com/document/d/report/edit'
  }, ['SUMMARY'], new Date('2026-09-21T00:00:00Z'));
  assert.deepEqual(extractReportPeriod(report.title), { start: '2026-09-14', end: '2026-09-19' });
  assert.deepEqual(report.period, { start: '2026-09-14', end: '2026-09-19' });
  assert.equal(report.generatedAt, '2026-09-20T01:00:00.000Z');
  assert.deepEqual(report.summary, ['SUMMARY']);
});

test('weekly report is stale when its covered period is outdated', () => {
  const report = normalizeReport({
    name: '2026-09-14〜2026-09-19_THE_REV_週次経営レポート',
    createdTime: '2026-09-20T01:00:00Z',
    modifiedTime: '2026-09-20T02:00:00Z',
    webViewLink: 'https://docs.google.com/document/d/report/edit'
  }, [], new Date('2026-09-30T00:00:00Z'));
  assert.equal(report.status, 'STALE');
});

test('source failure is isolated to its section', async () => {
  const siteData = {
    status: 'VALUE', generatedAt: '2026-09-30T00:00:00Z', range: { key: '28d' },
    summary: { searchClicks: { status: 'ZERO', value: 0, unit: 'count', source: 'gsc' } },
    insights: [], health: {}
  };
  const result = await assembleIntelligence('28d', {
    supabase: {}, userId: 'admin', now: new Date('2026-09-30T00:00:00Z'),
    dependencies: {
      readManagement: async () => { throw Object.assign(new Error('missing'), { code: 'not_configured' }); },
      assembleSiteInsights: async () => siteData,
      readEditorialSheet: async () => { throw Object.assign(new Error('missing'), { code: 'not_configured' }); },
      readEditorialDatabase: async () => ({ status: 'ZERO', source: 'supabase', updatedAt: null, counts: { draft: 0, review: 0, published: 0 }, errors: 0 }),
      readReports: async () => { throw Object.assign(new Error('missing'), { code: 'not_configured' }); }
    }
  });
  assert.equal(result.sections.management.status, 'NOT_CONFIGURED');
  assert.equal(result.sections.webSearch.metrics.searchClicks.status, 'ZERO');
  assert.equal(result.sections.editorial.counts.draft, 0);
  assert.equal(result.sections.analysis.status, 'NOT_CONFIGURED');
});

test('Site Insights contract keeps all v0.1 CTA metrics', () => {
  const metric = (value) => ({ status: value === 0 ? 'ZERO' : 'VALUE', value, unit: 'count', source: 'ga4' });
  const result = slimSiteInsights({
    status: 'VALUE', generatedAt: '2026-09-30T00:00:00Z', range: { key: '28d' },
    summary: {
      searchClicks: metric(1), searchImpressions: metric(2), sessions: metric(3), activeUsers: metric(4),
      pageViews: metric(5), bookingIntent: metric(6), lineIntent: metric(7), priceIntent: metric(8), articleCtaIntent: metric(9)
    },
    insights: [], health: {}
  });
  assert.equal(result.metrics.priceIntent.value, 8);
  assert.equal(result.metrics.articleCtaIntent.value, 9);
});

test('each provider failure remains section-local', async () => {
  const ok = {
    management: { status: 'VALUE', source: 'kpi', updatedAt: '2026-09-30T00:00:00Z', metrics: {}, priorities: [], dataQuality: {} },
    site: { status: 'VALUE', generatedAt: '2026-09-30T00:00:00Z', range: { key: '28d' }, summary: {}, insights: [], health: {} },
    sheet: { status: 'VALUE', source: 'sheet', updatedAt: '2026-09-30T00:00:00Z', schedule: [], gbpDrafts: {}, syncErrors: 0 },
    database: { status: 'ZERO', source: 'supabase', updatedAt: null, counts: { draft: 0, review: 0, published: 0 }, errors: 0 },
    reports: { status: 'VALUE', source: 'drive', updatedAt: '2026-09-30T00:00:00Z', reports: [], priorities: [] }
  };
  for (const failed of ['management', 'site', 'sheet', 'database', 'reports']) {
    const reject = async () => { throw Object.assign(new Error('provider failed with secret-that-must-not-leak'), { code: 'provider_error' }); };
    const result = await assembleIntelligence('28d', {
      supabase: {}, userId: 'admin', now: new Date('2026-09-30T00:00:00Z'),
      dependencies: {
        readManagement: failed === 'management' ? reject : async () => ok.management,
        assembleSiteInsights: failed === 'site' ? reject : async () => ok.site,
        readEditorialSheet: failed === 'sheet' ? reject : async () => ok.sheet,
        readEditorialDatabase: failed === 'database' ? reject : async () => ok.database,
        readReports: failed === 'reports' ? reject : async () => ok.reports
      }
    });
    assert.ok(result.sections.management);
    assert.ok(result.sections.webSearch);
    assert.ok(result.sections.editorial);
    assert.ok(result.sections.analysis);
    assert.equal(JSON.stringify(result).includes('secret-that-must-not-leak'), false);
  }
});
