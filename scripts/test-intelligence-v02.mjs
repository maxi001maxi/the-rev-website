import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntelligenceHandler } from '../api/admin/site-insights.mjs';
import { assembleIntelligence } from '../lib/intelligence/assemble.mjs';
import { buildPeriod, defaultSearchRange } from '../lib/intelligence/time.mjs';
import { fact, unknownFact } from '../lib/intelligence/facts.mjs';
import { buildPriorities, buildSignals } from '../lib/intelligence/signals.mjs';
import { INTELLIGENCE_STATUSES } from '../lib/intelligence/normalize.mjs';

const NOW = new Date('2026-09-30T00:00:00Z');
const metric = (key, value, previous = null, unit = 'count') => ({
  key,
  status: value === 0 ? 'ZERO' : 'VALUE',
  value,
  unit,
  source: 'test',
  updatedAt: NOW.toISOString(),
  freshness: 'CURRENT',
  quality: 'OBSERVED',
  reasonCode: null,
  ...(previous === null ? {} : { previous })
});

function signalFacts(overrides = {}) {
  const values = {
    searchClicks: metric('growth.searchClicks', 120),
    searchClicksPrevious: metric('growth.searchClicks.previous', 100),
    searchImpressions: metric('growth.searchImpressions', 1000),
    searchImpressionsPrevious: metric('growth.searchImpressions.previous', 900),
    searchCtr: metric('growth.searchCtr', 0.02, null, 'ratio'),
    searchCtrPrevious: metric('growth.searchCtr.previous', 0.025, null, 'ratio'),
    sessions: metric('growth.sessions', 140),
    sessionsPrevious: metric('growth.sessions.previous', 110),
    reserveCta: metric('growth.reserveCta', 4),
    reserveCtaPrevious: metric('growth.reserveCta.previous', 4),
    lineCta: metric('growth.lineCta', 2),
    lineCtaPrevious: metric('growth.lineCta.previous', 2),
    priceCta: metric('growth.priceCta', 1),
    priceCtaPrevious: metric('growth.priceCta.previous', 1),
    articleCta: metric('growth.articleCta', 1),
    articleCtaPrevious: metric('growth.articleCta.previous', 1)
  };
  return {
    growth: { ...values, ...(overrides.growth || {}) },
    customers: {
      followUp: metric('customer.followUp', 0), nextBooking: metric('customer.nextBooking', 0),
      ...(overrides.customers || {})
    },
    editorial: {
      ready: metric('editorial.ready', 0), errors: metric('editorial.errors', 0),
      ...(overrides.editorial || {})
    }
  };
}

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function adminContext() {
  const membership = {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { active: true }, error: null }; }
  };
  return { user: { id: 'admin-user' }, supabase: { from: () => membership } };
}

test('Time Engine defines exact Tokyo today, week and month comparisons', () => {
  const today = buildPeriod('today', NOW);
  assert.deepEqual(today.current, { start: '2026-09-30', end: '2026-09-30', days: 1 });
  assert.deepEqual(today.previousComparable, { start: '2026-09-29', end: '2026-09-29', days: 1 });

  const week = buildPeriod('week', NOW);
  assert.deepEqual(week.current, { start: '2026-09-28', end: '2026-09-30', days: 3 });
  assert.deepEqual(week.previousComparable, { start: '2026-09-21', end: '2026-09-23', days: 3 });
  assert.deepEqual(week.previousFull, { start: '2026-09-21', end: '2026-09-27', days: 7 });
  assert.equal(week.partial, true);

  const month = buildPeriod('month', NOW);
  assert.deepEqual(month.current, { start: '2026-09-01', end: '2026-09-30', days: 30 });
  assert.deepEqual(month.previousComparable, { start: '2026-08-01', end: '2026-08-30', days: 30 });
  assert.equal(month.partial, false);
  const partialMonth = buildPeriod('month', new Date('2026-09-15T00:00:00Z'));
  assert.deepEqual(partialMonth.previousComparable, { start: '2026-08-01', end: '2026-08-15', days: 15 });
  assert.equal(partialMonth.partial, true);
  assert.equal(defaultSearchRange('month'), '28d');
});

test('Fact contract preserves all statuses, including PARTIAL and ZERO', () => {
  assert.deepEqual(INTELLIGENCE_STATUSES, ['VALUE', 'ZERO', 'UNKNOWN', 'NOT_CONFIGURED', 'STALE', 'ERROR', 'PARTIAL']);
  assert.equal(fact({ status: 'ZERO', value: 0 }, { key: 'zero' }, NOW).status, 'ZERO');
  assert.equal(fact({ status: 'PARTIAL', value: 7 }, { key: 'partial' }, NOW).value, 7);
  assert.equal(unknownFact('unknown').value, null);
  assert.equal(unknownFact('missing-config', { status: 'NOT_CONFIGURED' }).status, 'NOT_CONFIGURED');
  assert.equal(unknownFact('provider-error', { status: 'ERROR' }).status, 'ERROR');
  assert.equal(fact({ status: 'VALUE', value: 1, updatedAt: '2026-09-20T00:00:00Z' }, { key: 'old', staleAfterHours: 24 }, NOW).status, 'STALE');
});

test('Signal Engine finds traffic growth without CTA growth and keeps evidence', () => {
  const signals = buildSignals({ facts: signalFacts(), dataHealth: [], searchRange: '28d', now: NOW });
  const signal = signals.find((item) => item.id === 'TRAFFIC_NOT_CONVERTING');
  assert.ok(signal);
  assert.equal(signal.confidence, 'HIGH');
  assert.ok(signal.evidence.some((item) => item.key === 'growth.sessions'));
});

test('Signal Engine finds customer follow-up and editorial delay risks', () => {
  const facts = signalFacts({
    customers: { followUp: metric('customer.followUp', 4), nextBooking: metric('customer.nextBooking', 0) }
  });
  const signals = buildSignals({
    facts,
    editorialSchedule: [{ title: 'Overdue article', schedule: '2026-09-29', state: 'DRAFT' }],
    dataHealth: [], searchRange: '28d', now: NOW
  });
  assert.ok(signals.some((item) => item.id === 'CUSTOMER_PIPELINE_RISK'));
  assert.ok(signals.some((item) => item.id === 'EDITORIAL_EXECUTION_RISK'));
});

test('Data quality gaps create a transparent signal and no more than three priorities', () => {
  const signals = buildSignals({
    facts: signalFacts({ customers: { followUp: metric('customer.followUp', 5), nextBooking: metric('customer.nextBooking', 0) } }),
    editorialSchedule: [{ title: 'Late', schedule: '2026-09-28', state: 'REVIEW' }],
    dataHealth: [{ key: 'drive', label: 'Drive', status: 'NOT_CONFIGURED', evidence: [] }],
    searchRange: '28d', now: NOW
  });
  const dataSignal = signals.find((item) => item.id === 'DATA_QUALITY_RISK');
  assert.ok(dataSignal);
  assert.deepEqual(dataSignal.evidence, []);
  assert.ok(buildPriorities(signals).length <= 3);
});

test('v0.2 API accepts period modes and keeps Search range separate', async () => {
  const seen = [];
  const handler = createIntelligenceHandler({
    getContext: async () => adminContext(),
    assembleData: async (request) => { seen.push(request); return request; }
  });
  for (const period of ['today', 'week', 'month']) {
    const res = response();
    await handler({ method: 'GET', query: { period, searchRange: '90d' }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
  }
  assert.deepEqual(seen, [
    { mode: 'today', searchRange: '90d' },
    { mode: 'week', searchRange: '90d' },
    { mode: 'month', searchRange: '90d' }
  ]);
});

test('v0.2 API rejects invalid mode and unknown query keys', async () => {
  const handler = createIntelligenceHandler({ getContext: async () => adminContext() });
  const invalidMode = response();
  await handler({ method: 'GET', query: { period: 'quarter' }, headers: {} }, invalidMode);
  assert.equal(invalidMode.statusCode, 400);
  const invalidKey = response();
  await handler({ method: 'GET', query: { period: 'week', customer: 'private' }, headers: {} }, invalidKey);
  assert.equal(invalidKey.statusCode, 400);
});

test('v0.2 assembly survives total provider failure without inventing values or exposing errors', async () => {
  const reject = async () => {
    throw Object.assign(new Error('private@example.com 090-1111-2222 secret-value'), { code: 'provider_error' });
  };
  const result = await assembleIntelligence({ mode: 'week', searchRange: '28d' }, {
    supabase: {}, userId: 'admin-user', now: NOW,
    dependencies: {
      readManagement: reject,
      assembleSiteInsights: reject,
      readEditorialSheet: reject,
      readEditorialDatabase: reject,
      readReports: reject
    }
  });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.revenue.current.value, null);
  assert.equal(result.revenue.current.status, 'UNKNOWN');
  assert.equal(result.dataHealth.length, 8);
  assert.equal('sections' in result, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('private@example.com'), false);
  assert.equal(serialized.includes('090-1111-2222'), false);
  assert.equal(serialized.includes('secret-value'), false);
});

test('Vercel Function count stays within the twelve-function limit', async () => {
  async function countMjs(path) {
    let count = 0;
    for (const entry of await readdir(path, { withFileTypes: true })) {
      count += entry.isDirectory() ? await countMjs(join(path, entry.name)) : Number(entry.name.endsWith('.mjs'));
    }
    return count;
  }
  assert.ok(await countMjs(fileURLToPath(new URL('../api', import.meta.url))) <= 12);
});
