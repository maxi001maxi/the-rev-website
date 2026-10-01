import test from 'node:test';
import assert from 'node:assert/strict';
import { wizard } from '../lib/siteInsights/providers/wizard.mjs';

const response = (status, payload = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => name.toLowerCase() === 'mcp-session-id' ? 'session' : 'application/json' },
  text: async () => JSON.stringify(payload)
});

function mockFetch(first) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://mcp.gscwizard.com/mcp');
    assert.equal(options.headers.Authorization, 'Bearer test_secret');
    assert.ok(!options.body.includes('test_secret'));
    const payload = JSON.parse(options.body);
    calls.push(payload.method);
    if (calls.length <= first.length) {
      const value = first[calls.length - 1];
      if (value instanceof Error) throw value;
      return response(value);
    }
    if (payload.method === 'initialize') return response(200, { result: { protocolVersion: '2025-03-26' } });
    if (payload.method === 'tools/call') return response(200, { result: { structuredContent: { rows: [], observed: true } } });
    return response(200);
  };
  return { fetchImpl, calls };
}

const run = mock => wizard('get_ga4_overview', {}, { ...mock, key: 'test_secret', waitImpl: async () => {} });
const error = (name, code) => Object.assign(new Error('private credential and upstream details'), { name, cause: code ? { code } : undefined });

test('normal Wizard transport succeeds with a fixed endpoint and header-only credential', async () => {
  const mock = mockFetch([]);
  assert.deepEqual(await run(mock), { rows: [], observed: true });
  assert.deepEqual(mock.calls, ['initialize', 'notifications/initialized', 'tools/call']);
});

test('timeout retries at most three times and exposes only a safe code', async () => {
  const mock = mockFetch([error('TimeoutError'), error('TimeoutError'), error('TimeoutError')]);
  await assert.rejects(run(mock), e => e.code === 'wizard_timeout' && !e.message.includes('private'));
  assert.equal(mock.calls.length, 3);
});

test('DNS and connection errors are distinguishable without leaking upstream details', async () => {
  const dns = mockFetch([error('TypeError', 'ENOTFOUND')]);
  await assert.rejects(run(dns), e => e.code === 'wizard_dns_error' && !e.message.includes('private'));
  assert.equal(dns.calls.length, 1);
  const connection = mockFetch([error('TypeError', 'ECONNRESET'), error('TypeError', 'ECONNRESET'), error('TypeError', 'ECONNRESET')]);
  await assert.rejects(run(connection), e => e.code === 'wizard_connection_error');
  assert.equal(connection.calls.length, 3);
});

test('transient 500 retries and can recover; persistent 5xx stays classified', async () => {
  const recovered = mockFetch([500]);
  assert.equal((await run(recovered)).observed, true);
  assert.equal(recovered.calls.length, 4);
  const failed = mockFetch([503, 503, 503]);
  await assert.rejects(run(failed), e => e.code === 'wizard_upstream_5xx');
  assert.equal(failed.calls.length, 3);
});

test('429 is bounded and permission denied is not retried', async () => {
  const limited = mockFetch([429, 429, 429]);
  await assert.rejects(run(limited), e => e.code === 'wizard_rate_limited');
  assert.equal(limited.calls.length, 3);
  for (const status of [401, 403]) {
    const denied = mockFetch([status]);
    await assert.rejects(run(denied), e => e.code === 'wizard_permission_denied');
    assert.equal(denied.calls.length, 1);
  }
});
