import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export const CTA_EVENTS = [
  'reserve_click',
  'line_click',
  'price_click',
  'article_cta_click',
  'recovery_click',
  'trainer_click',
  'review_click',
  'map_click',
  'instagram_click'
];

function base64Url(input) {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return value.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function parseServiceAccount(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('GA4_SERVICE_ACCOUNT_JSON is not configured.');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      throw new Error('GA4_SERVICE_ACCOUNT_JSON is invalid.');
    }
  }

  if (!parsed?.client_email || !parsed?.private_key) {
    throw new Error('GA4 service account is missing client_email/private_key.');
  }
  return parsed;
}

export function resolveDateRange(range) {
  const normalized = ['today', '7d', '28d'].includes(range) ? range : '7d';
  if (normalized === 'today') {
    return {
      key: 'today',
      current: { startDate: 'today', endDate: 'today' },
      previous: { startDate: 'yesterday', endDate: 'yesterday' },
      label: '今日'
    };
  }
  if (normalized === '28d') {
    return {
      key: '28d',
      current: { startDate: '27daysAgo', endDate: 'today' },
      previous: { startDate: '55daysAgo', endDate: '28daysAgo' },
      label: '過去28日'
    };
  }
  return {
    key: '7d',
    current: { startDate: '6daysAgo', endDate: 'today' },
    previous: { startDate: '13daysAgo', endDate: '7daysAgo' },
    label: '過去7日'
  };
}

export async function getServiceAccountAccessToken(serviceAccount, fetchImpl = fetch) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: ANALYTICS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .end()
    .sign(serviceAccount.private_key);

  const assertion = `${unsigned}.${base64Url(signature)}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const payload = await safeJson(response);
  if (!response.ok || !payload?.access_token) {
    throw new Error(`GA4 OAuth failed (${response.status || 0}).`);
  }
  return payload.access_token;
}

async function safeJson(response) {
  try { return await response.json(); }
  catch { return null; }
}

export async function runGa4Report({
  propertyId,
  accessToken,
  body,
  realtime = false,
  fetchImpl = fetch
}) {
  const action = realtime ? 'runRealtimeReport' : 'runReport';
  const url = `${DATA_API_BASE}/properties/${encodeURIComponent(propertyId)}:${action}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    const status = response.status || 0;
    const code = payload?.error?.status || 'GA4_API_ERROR';
    throw new Error(`GA4 Data API failed (${status} ${code}).`);
  }
  return payload || {};
}

function metric(row, index) {
  const raw = row?.metricValues?.[index]?.value ?? '0';
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function dimension(row, index) {
  return String(row?.dimensionValues?.[index]?.value ?? '');
}

export function normalizeSummary(report) {
  const row = report?.rows?.[0];
  return {
    users: metric(row, 0),
    sessions: metric(row, 1),
    views: metric(row, 2),
    newUsers: metric(row, 3),
    totalUsers: metric(row, 4),
    engagedSessions: metric(row, 5),
    engagementRate: metric(row, 6),
    averageSessionDuration: metric(row, 7)
  };
}

export function normalizeTopPages(report) {
  return (report?.rows || []).map((row) => ({
    path: dimension(row, 0),
    title: dimension(row, 1),
    views: metric(row, 0),
    users: metric(row, 1)
  }));
}

export function normalizeTraffic(report) {
  return (report?.rows || []).map((row) => ({
    sourceMedium: dimension(row, 0) || '(direct) / (none)',
    sessions: metric(row, 0),
    users: metric(row, 1)
  }));
}

export function normalizeDevice(report) {
  return (report?.rows || []).map((row) => ({
    device: dimension(row, 0) || 'unknown',
    users: metric(row, 0),
    sessions: metric(row, 1)
  }));
}

export function normalizeNewReturning(report) {
  const result = { new: 0, returning: 0, other: 0 };
  for (const row of report?.rows || []) {
    const key = dimension(row, 0).toLowerCase();
    const value = metric(row, 0);
    if (key === 'new') result.new += value;
    else if (key === 'returning') result.returning += value;
    else result.other += value;
  }
  return result;
}

export function normalizeEvents(report) {
  return (report?.rows || []).map((row) => ({
    event: dimension(row, 0),
    count: metric(row, 0)
  }));
}

export function normalizeRealtime(report) {
  const row = report?.rows?.[0];
  return {
    activeUsers: metric(row, 0),
    eventCount: metric(row, 1),
    views: metric(row, 2)
  };
}

function normalizeGaDate(value) {
  const raw = String(value || '');
  if (!/^\d{8}$/.test(raw)) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export function normalizeTrend(report) {
  return (report?.rows || []).map((row) => ({
    date: normalizeGaDate(dimension(row, 0)),
    users: metric(row, 0),
    sessions: metric(row, 1),
    views: metric(row, 2)
  }));
}

export function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
