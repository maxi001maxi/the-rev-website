import crypto from 'node:crypto';
import {
  findHeaderIndex,
  googleSerialToIso,
  latestIso,
  normalizeDate,
  rowsToObjects,
  safeExternalUrl,
  safeText
} from './normalize.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

export const WORKSPACE_IDS = Object.freeze({
  kpiSpreadsheet: '10ZVV1cw4gOBYoIu862AUXQydfKgIg6t6CaFp3U-maZA',
  editorialSpreadsheet: '1_Cia3fsELLCJtBcIFq38Jg5CbEVG2md2G6w6Do4BaeI',
  weeklyReportFolder: '1yrzaU6YXZwdMVxZYqv2v1gKx_HID0LjH',
  marketingReportFolder: '1MDj0YNQn8gpse3byyVTbbLSMwFF7Yxec'
});

const tokenCache = new Map();

function workspaceError(code, message) {
  return Object.assign(new Error(message), { code });
}

function base64Url(input) {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function resolveWorkspaceCredential(env = process.env) {
  const raw = String(env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON || env.GA4_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw workspaceError('not_configured', 'Google Workspace read-only credential is not configured.');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    try { parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
    catch { throw workspaceError('invalid_credentials', 'Google Workspace credential is invalid.'); }
  }
  if (!parsed?.client_email || !parsed?.private_key) {
    throw workspaceError('invalid_credentials', 'Google Workspace credential is missing required fields.');
  }
  return parsed;
}

export async function getWorkspaceAccessToken(serviceAccount, fetchImpl = fetch) {
  const cacheKey = `${serviceAccount.client_email}:${WORKSPACE_SCOPES.join(' ')}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: WORKSPACE_SCOPES.join(' '),
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).end().sign(serviceAccount.private_key);
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64Url(signature)}`
    })
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.access_token) throw workspaceError('authentication_failed', `Google OAuth failed (${response.status || 0}).`);
  tokenCache.set(cacheKey, { token: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000 });
  return payload.access_token;
}

async function readJson(response) {
  try { return await response.json(); }
  catch { return null; }
}

async function googleJson(url, token, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await readJson(response);
  if (!response.ok) {
    const reason = response.status === 403 ? 'permission_denied' : response.status === 404 ? 'source_not_found' : 'provider_error';
    throw workspaceError(reason, `Google Workspace API failed (${response.status || 0}).`);
  }
  return payload || {};
}

async function googleText(url, token, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const reason = response.status === 403 ? 'permission_denied' : response.status === 404 ? 'source_not_found' : 'provider_error';
    throw workspaceError(reason, `Google Drive export failed (${response.status || 0}).`);
  }
  return response.text();
}

function configuredIds(env = process.env) {
  return {
    kpiSpreadsheet: env.INTELLIGENCE_KPI_SPREADSHEET_ID || WORKSPACE_IDS.kpiSpreadsheet,
    editorialSpreadsheet: env.INTELLIGENCE_EDITORIAL_SPREADSHEET_ID || WORKSPACE_IDS.editorialSpreadsheet,
    weeklyReportFolder: env.INTELLIGENCE_WEEKLY_REPORT_FOLDER_ID || WORKSPACE_IDS.weeklyReportFolder,
    marketingReportFolder: env.INTELLIGENCE_MARKETING_REPORT_FOLDER_ID || WORKSPACE_IDS.marketingReportFolder
  };
}

export async function batchGetSpreadsheet(spreadsheetId, ranges, { token, fetchImpl = fetch } = {}) {
  const url = new URL(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet`);
  for (const range of ranges) url.searchParams.append('ranges', range);
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption', 'SERIAL_NUMBER');
  const payload = await googleJson(url, token, fetchImpl);
  return (payload.valueRanges || []).map((range) => range.values || []);
}

function qualityStatus(row) {
  const quality = String(row.data_quality || '').toUpperCase();
  if (quality.includes('UNMEASURED')) return 'UNKNOWN';
  const value = row.value_number;
  if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 'ZERO' : 'VALUE';
  return 'UNKNOWN';
}

function metricFromRow(row) {
  if (!row) return { status: 'UNKNOWN', value: null, unit: null, source: 'kpi_sheet', reasonCode: 'metric_missing' };
  return {
    status: qualityStatus(row),
    value: typeof row.value_number === 'number' && Number.isFinite(row.value_number) ? row.value_number : null,
    unit: row.unit || null,
    source: 'kpi_sheet',
    sourceRef: safeText(`${row.source || ''} ${row.source_ref || ''}`, 120),
    updatedAt: normalizeDate(row.updated_at),
    dataQuality: safeText(row.data_quality, 80) || null
  };
}

export function normalizeManagementValues(values = [], now = new Date()) {
  const rows = rowsToObjects(values);
  const allowedSections = new Set([
    'SYSTEM_META', 'DATA_FRESHNESS', 'LAST_CLOSED_WEEK', 'CURRENT_WEEK',
    'MONTH_TO_DATE', 'FINANCE_CURRENT', 'PREVIOUS_MEETING', 'AI_MEETING_CONTROL', 'OWNER_BRIEF'
  ]);
  const safeRows = rows.filter((row) => allowedSections.has(String(row.section || '')));
  const find = (section, key) => safeRows.find((row) => row.section === section && row.metric_key === key);
  const currentRevenue = metricFromRow(find('CURRENT_WEEK', 'adjusted_revenue'));
  const lastClosedRevenue = metricFromRow(find('LAST_CLOSED_WEEK', 'adjusted_revenue'));
  const currentRecord = find('CURRENT_WEEK', 'adjusted_revenue');
  const lastRecord = find('LAST_CLOSED_WEEK', 'adjusted_revenue');
  const currentIsPartial = String(currentRecord?.data_quality || '').toUpperCase().includes('CURRENT');
  let comparison = { status: 'UNKNOWN', value: null, unit: 'ratio', source: 'kpi_sheet', reasonCode: 'comparison_unavailable' };
  if (!currentIsPartial && ['VALUE', 'ZERO'].includes(currentRevenue.status) && lastClosedRevenue.status === 'VALUE') {
    comparison = {
      status: currentRevenue.value === lastClosedRevenue.value ? 'ZERO' : 'VALUE',
      value: (currentRevenue.value - lastClosedRevenue.value) / lastClosedRevenue.value,
      unit: 'ratio',
      source: 'kpi_sheet',
      reasonCode: null
    };
  } else if (currentIsPartial) comparison.reasonCode = 'current_week_partial_not_comparable';
  const priorityRows = safeRows
    .filter((row) => row.section === 'PREVIOUS_MEETING' && /^priority_[1-3]$/.test(String(row.metric_key || '')))
    .sort((a, b) => String(a.metric_key).localeCompare(String(b.metric_key)));
  const previousStatus = find('PREVIOUS_MEETING', 'status');
  const previousDeadline = find('PREVIOUS_MEETING', 'deadline');
  const priorityUpdatedAt = latestIso(priorityRows.map((row) => row.updated_at));
  const priorityDeadline = normalizeDate(previousDeadline?.value_date);
  const priorityIsStale = !priorityUpdatedAt
    || now.getTime() - Date.parse(priorityUpdatedAt) > 7 * 86400000
    || (priorityDeadline && Date.parse(priorityDeadline) < now.getTime() && !/完了|中止|DONE|CANCELLED/i.test(String(previousStatus?.value_text || '')));
  const metrics = {
    currentRevenue,
    lastClosedRevenue,
    weekOverWeek: comparison,
    newPaidCustomers: metricFromRow(find('CURRENT_WEEK', 'new_paid_customers')),
    paidCustomers: metricFromRow(find('CURRENT_WEEK', 'paid_purchase_customers')),
    followUp: metricFromRow(find('CURRENT_WEEK', 'follow_up')),
    nextBooking: metricFromRow(find('CURRENT_WEEK', 'next_booking')),
    monthToDateRevenue: metricFromRow(find('MONTH_TO_DATE', 'adjusted_revenue'))
  };
  const updatedAt = latestIso(safeRows.map((row) => row.updated_at));
  const readiness = find('AI_MEETING_CONTROL', 'readiness');
  const staleSources = safeRows.filter((row) => /STALE/i.test(String(row.data_quality || '')));
  return {
    status: staleSources.length ? 'STALE' : Object.values(metrics).some((metric) => metric.status === 'VALUE') ? 'VALUE' : Object.values(metrics).some((metric) => metric.status === 'ZERO') ? 'ZERO' : 'UNKNOWN',
    source: 'KPI_70_AI_MEETING_EXPORT',
    updatedAt,
    period: {
      current: currentRecord?.record_key || null,
      lastClosed: lastRecord?.record_key || null
    },
    metrics,
    dataQuality: {
      status: staleSources.length ? 'STALE' : String(readiness?.value_text || '').toUpperCase() === 'READY' ? 'VALUE' : 'UNKNOWN',
      label: staleSources.length
        ? `${safeText(readiness?.value_text || 'UNKNOWN', 48)} / STALE`
        : safeText(readiness?.value_text || 'UNKNOWN', 60),
      issues: safeRows.filter((row) => /STALE|UNMEASURED|ACTION_REQUIRED|MISSING/i.test(String(row.data_quality || ''))).length
    },
    priorities: priorityRows.map((row, index) => ({
      order: index + 1,
      title: safeText(row.value_text, 300),
      text: safeText(row.value_text, 300),
      owner: null,
      ownerStatus: 'UNKNOWN',
      deadline: priorityDeadline,
      executionStatus: safeText(previousStatus?.value_text, 80) || null,
      status: priorityIsStale ? 'STALE' : 'VALUE',
      updatedAt: normalizeDate(row.updated_at),
      source: 'kpi_previous_meeting'
    })).filter((row) => row.title)
  };
}

export async function readManagement({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const credential = resolveWorkspaceCredential(env);
  const token = await getWorkspaceAccessToken(credential, fetchImpl);
  const ids = configuredIds(env);
  const [values] = await batchGetSpreadsheet(ids.kpiSpreadsheet, ["'70_AI会議_EXPORT'!A1:L1000"], { token, fetchImpl });
  return normalizeManagementValues(values, now);
}

function normalizeSchedule(values) {
  const headerIndex = findHeaderIndex(values, ['完了', '投稿日・時間', '媒体', 'タイトル', '状態']);
  if (headerIndex < 0) return [];
  return rowsToObjects(values, headerIndex).filter((row) => row.完了 !== true).slice(0, 5).map((row) => ({
    schedule: safeText(row['投稿日・時間'], 80),
    channel: safeText(row.媒体, 80),
    title: safeText(row.タイトル, 180),
    state: safeText(row.状態, 80),
    nextAction: safeText(row.今やること, 180)
  }));
}

export function normalizeEditorialValues({ scheduleValues = [], gbpValues = [], bridgeValues = [], queueValues = [] } = {}) {
  const gbp = rowsToObjects(gbpValues);
  const bridge = rowsToObjects(bridgeValues);
  const queue = rowsToObjects(queueValues);
  const readyGbp = gbp.filter((row) => String(row.post_ready || '').toUpperCase() === 'READY').length;
  const blockedGbp = gbp.filter((row) => String(row.post_ready || '').toUpperCase().startsWith('BLOCKED')).length;
  const syncErrors = bridge.filter((row) => row.last_error || /ERROR|FAILED/i.test(String(row.bridge_status || ''))).length;
  const queueErrors = queue.filter((row) => row.last_error || /ERROR|FAILED/i.test(String(row.queue_status || ''))).length;
  return {
    status: 'VALUE',
    source: 'editorial_master_sheet',
    updatedAt: latestIso([
      ...gbp.map((row) => row.generated_at),
      ...bridge.map((row) => row.synced_at),
      ...queue.map((row) => row.updated_at)
    ]),
    schedule: normalizeSchedule(scheduleValues),
    gbpDrafts: { ready: readyGbp, blocked: blockedGbp, published: null },
    syncErrors: syncErrors + queueErrors
  };
}

export async function readEditorialSheet({ env = process.env, fetchImpl = fetch } = {}) {
  const credential = resolveWorkspaceCredential(env);
  const token = await getWorkspaceAccessToken(credential, fetchImpl);
  const ids = configuredIds(env);
  const [scheduleValues, gbpValues, bridgeValues, queueValues] = await batchGetSpreadsheet(ids.editorialSpreadsheet, [
    "'今週の予定'!A1:J80",
    "'22_GBP_POST'!A1:R1000",
    "'25_WEB_PUBLISH_BRIDGE'!A1:AE1000",
    "'26_DAILY_EDITORIAL_QUEUE'!A1:AX250"
  ], { token, fetchImpl });
  return normalizeEditorialValues({ scheduleValues, gbpValues, bridgeValues, queueValues });
}

const EXCLUDED_REPORT_PATTERN = /(?:TEST|DRAFT|QC|テスト|下書き|作業中)/i;

export function selectLatestReport(files = [], predicate = () => true) {
  return files
    .filter((file) => !EXCLUDED_REPORT_PATTERN.test(String(file.name || '')) && predicate(file))
    .sort((a, b) => Date.parse(b.modifiedTime || b.createdTime || 0) - Date.parse(a.modifiedTime || a.createdTime || 0))[0] || null;
}

async function listFolder(folderId, token, fetchImpl) {
  const url = new URL(DRIVE_API);
  url.searchParams.set('q', `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`);
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('fields', 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink)');
  const payload = await googleJson(url, token, fetchImpl);
  return payload.files || [];
}

async function exportDocSummary(file, token, fetchImpl) {
  if (!file || file.mimeType !== 'application/vnd.google-apps.document') return [];
  const url = `${DRIVE_API}/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/plain')}`;
  const raw = await googleText(url, token, fetchImpl);
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = [];
  lines.forEach((line, index) => {
    if (summary.length >= 3 || /顧客名|氏名|お客様名|\S+様/.test(line)) return;
    if (/^(?:#{1,4}\s*)?(?:\d+[.)]\s*)?(?:EXECUTIVE SUMMARY|SUMMARY)$/i.test(line)) {
      const next = lines.slice(index + 1).find((candidate) => candidate.length <= 360 && !/顧客名|氏名|お客様名|\S+様/.test(candidate));
      if (next) summary.push(safeText(next, 280));
      return;
    }
    if (/^(?:今回伝える一文|Chair判断|結論|最重要|推奨)[:：]/i.test(line) && line.length <= 360) {
      summary.push(safeText(line, 280));
    }
  });
  return [...new Set(summary)].slice(0, 3);
}

export function normalizeReport(file, headings = [], now = new Date()) {
  if (!file) return null;
  const modifiedAt = normalizeDate(file.modifiedTime);
  const period = extractReportPeriod(file.name);
  const periodEnd = period?.end ? Date.parse(`${period.end}T23:59:59+09:00`) : null;
  const stale = !modifiedAt
    || now.getTime() - Date.parse(modifiedAt) > 10 * 86400000
    || (periodEnd && now.getTime() - periodEnd > 8 * 86400000);
  return {
    status: stale ? 'STALE' : 'VALUE',
    title: safeText(file.name, 180),
    generatedAt: normalizeDate(file.createdTime || file.modifiedTime),
    updatedAt: modifiedAt,
    period,
    url: safeExternalUrl(file.webViewLink, ['docs.google.com', 'drive.google.com']),
    summary: headings,
    headings,
    source: 'google_drive'
  };
}

export function extractReportPeriod(name) {
  const match = String(name || '').match(/(\d{4}-\d{2}-\d{2})[〜~–—-](\d{4}-\d{2}-\d{2})/);
  return match ? { start: match[1], end: match[2] } : null;
}

export async function readReports({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const credential = resolveWorkspaceCredential(env);
  const token = await getWorkspaceAccessToken(credential, fetchImpl);
  const ids = configuredIds(env);
  const [weeklyFiles, marketingFiles] = await Promise.all([
    listFolder(ids.weeklyReportFolder, token, fetchImpl),
    listFolder(ids.marketingReportFolder, token, fetchImpl)
  ]);
  // 運用仕様・実行指示・完成版テンプレートを「最新レポート」と誤選択しない。
  // 現行の確定成果物は日付で始まる命名規則を持つ。
  const dated = (file) => /^\d{4}-\d{2}-\d{2}/.test(String(file.name || ''));
  const weekly = selectLatestReport(weeklyFiles, (file) => dated(file) && /週次経営レポート/.test(file.name) && !/VISUAL_REPORT_HANDOFF/i.test(file.name));
  const owner = selectLatestReport(weeklyFiles, (file) => dated(file) && /VISUAL_REPORT_HANDOFF|OWNER.?BRIEF/i.test(file.name));
  const marketing = selectLatestReport(marketingFiles, (file) => dated(file) && /週次マーケティング分析/.test(file.name));
  const summaries = await Promise.all([
    exportDocSummary(weekly, token, fetchImpl),
    exportDocSummary(owner, token, fetchImpl),
    exportDocSummary(marketing, token, fetchImpl)
  ]);
  const reports = [
    ['weekly_management', weekly, summaries[0]],
    ['owner_brief', owner, summaries[1]],
    ['marketing_analysis', marketing, summaries[2]]
  ].map(([type, file, reportSummary]) => file
    ? ({ type, ...normalizeReport(file, reportSummary, now) })
    : ({
        type,
        status: 'UNKNOWN',
        title: null,
        generatedAt: null,
        updatedAt: null,
        period: null,
        url: null,
        summary: [],
        headings: [],
        source: 'google_drive',
        reasonCode: 'report_not_found'
      }));
  return {
    status: reports.some((report) => report.status === 'VALUE') ? 'VALUE' : reports.some((report) => report.status === 'STALE') ? 'STALE' : 'UNKNOWN',
    source: 'google_drive',
    updatedAt: latestIso(reports.map((report) => report.updatedAt)),
    reports
  };
}

export function workspaceFailure(error, source) {
  const code = error?.code || 'provider_error';
  return {
    status: code === 'not_configured' ? 'NOT_CONFIGURED' : 'ERROR',
    source,
    updatedAt: null,
    reasonCode: code,
    message: code === 'not_configured'
      ? 'Google Workspaceのread-only接続が未設定です。'
      : code === 'permission_denied'
        ? 'Google Workspaceの共有権限またはAPI設定を確認してください。'
        : 'Google Workspaceデータを取得できませんでした。'
  };
}
