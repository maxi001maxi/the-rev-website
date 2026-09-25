import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseServiceAccount,
  resolveDateRange,
  normalizeSummary,
  normalizeTopPages,
  normalizeTraffic,
  normalizeDevice,
  normalizeNewReturning,
  normalizeEvents,
  normalizeRealtime,
  percentChange
} from '../lib/ga4Data.mjs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const fakeAccount = {
  client_email: 'analytics-reader@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n'
};

assert.equal(parseServiceAccount(JSON.stringify(fakeAccount)).client_email, fakeAccount.client_email);
assert.equal(
  parseServiceAccount(Buffer.from(JSON.stringify(fakeAccount)).toString('base64')).client_email,
  fakeAccount.client_email
);
assert.throws(() => parseServiceAccount(''), /not configured/);
assert.throws(() => parseServiceAccount('{}'), /missing client_email/);

assert.deepEqual(resolveDateRange('today').current, { startDate: 'today', endDate: 'today' });
assert.deepEqual(resolveDateRange('7d').current, { startDate: '6daysAgo', endDate: 'today' });
assert.deepEqual(resolveDateRange('28d').previous, { startDate: '55daysAgo', endDate: '28daysAgo' });
assert.equal(resolveDateRange('nonsense').key, '7d');

const summaryReport = {
  rows: [{
    metricValues: [
      { value: '12' }, { value: '20' }, { value: '44' }, { value: '7' }, { value: '15' }
    ]
  }]
};
assert.deepEqual(normalizeSummary(summaryReport), {
  users: 12, sessions: 20, views: 44, newUsers: 7, totalUsers: 15
});
assert.equal(percentChange(120, 100), 20);
assert.equal(percentChange(90, 100), -10);
assert.equal(percentChange(5, 0), null);
assert.equal(percentChange(0, 0), 0);

assert.deepEqual(normalizeTopPages({
  rows: [{
    dimensionValues: [{ value: '/price.html' }, { value: '料金' }],
    metricValues: [{ value: '9' }, { value: '6' }]
  }]
})[0], { path: '/price.html', title: '料金', views: 9, users: 6 });

assert.deepEqual(normalizeTraffic({
  rows: [{
    dimensionValues: [{ value: 'google / organic' }],
    metricValues: [{ value: '8' }, { value: '5' }]
  }]
})[0], { sourceMedium: 'google / organic', sessions: 8, users: 5 });

assert.deepEqual(normalizeDevice({
  rows: [{
    dimensionValues: [{ value: 'mobile' }],
    metricValues: [{ value: '5' }, { value: '7' }]
  }]
})[0], { device: 'mobile', users: 5, sessions: 7 });

assert.deepEqual(normalizeNewReturning({
  rows: [
    { dimensionValues: [{ value: 'new' }], metricValues: [{ value: '7' }] },
    { dimensionValues: [{ value: 'returning' }], metricValues: [{ value: '3' }] }
  ]
}), { new: 7, returning: 3, other: 0 });

assert.deepEqual(normalizeEvents({
  rows: [{
    dimensionValues: [{ value: 'reserve_click' }],
    metricValues: [{ value: '2' }]
  }]
})[0], { event: 'reserve_click', count: 2 });

assert.deepEqual(normalizeRealtime({
  rows: [{ metricValues: [{ value: '1' }, { value: '3' }, { value: '2' }] }]
}), { activeUsers: 1, eventCount: 3, views: 2 });

const api = read('api/admin/analytics.mjs');
const adminPage = read('admin/analytics/index.html');
const adminClient = read('admin/js/admin-analytics.mjs');
const adminApiClient = read('admin/js/admin-api.mjs');
const privacy = read('privacy.html');
const envExample = read('.env.example');

assert.match(api, /getAuthedContext\(req\)/, 'Analytics API must require Admin auth.');
assert.match(api, /GA4_PROPERTY_ID/, 'Server API must read GA4 property ID.');
assert.match(api, /GA4_SERVICE_ACCOUNT_JSON/, 'Server API must read service account only server-side.');
assert.match(api, /Cache-Control.*no-store/, 'Analytics API must prevent caching.');

assert.match(adminPage, /requireSession|admin-analytics\.mjs/, 'Analytics page must load the authenticated client.');
assert.match(adminClient, /requireSession\(\)/, 'Analytics client must require a session.');
assert.match(adminApiClient, /getAnalytics/, 'Admin API client must expose Analytics.');
assert.ok(!adminPage.includes('GA4_SERVICE_ACCOUNT_JSON'));
assert.ok(!adminClient.includes('GA4_SERVICE_ACCOUNT_JSON'));
assert.ok(!adminPage.includes('private_key'));
assert.ok(!adminClient.includes('private_key'));

assert.match(privacy, /Google Analytics 4/);
assert.match(privacy, /Google Tag Manager/);
assert.match(privacy, /健康情報その他の要配慮個人情報をGoogle Analyticsへ送信しません/);

assert.match(envExample, /^GA4_PROPERTY_ID=/m);
assert.match(envExample, /^GA4_SERVICE_ACCOUNT_JSON=/m);

console.log('Phase E Analytics checks passed.');
