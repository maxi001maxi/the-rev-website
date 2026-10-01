export const INTELLIGENCE_STATUSES = Object.freeze([
  'VALUE',
  'ZERO',
  'UNKNOWN',
  'NOT_CONFIGURED',
  'STALE',
  'ERROR',
  'PARTIAL'
]);

const STATUS_SET = new Set(INTELLIGENCE_STATUSES);

export function intelligenceMetric(value, {
  unit = 'count',
  source = null,
  updatedAt = null,
  dataQuality = null,
  reasonCode = null
} = {}) {
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const status = numeric ? (value === 0 ? 'ZERO' : 'VALUE') : 'UNKNOWN';
  return { status, value: numeric ? value : null, unit, source, updatedAt, dataQuality, reasonCode };
}

export function unavailable(status, {
  source = null,
  updatedAt = null,
  reasonCode = null,
  message = null
} = {}) {
  return {
    status: STATUS_SET.has(status) ? status : 'ERROR',
    updatedAt,
    source,
    reasonCode,
    message
  };
}

export function sectionStatus(items = []) {
  const statuses = items.map((item) => item?.status).filter(Boolean);
  if (!statuses.length) return 'UNKNOWN';
  if (statuses.some((status) => status === 'VALUE')) return 'VALUE';
  if (statuses.some((status) => status === 'ZERO')) return 'ZERO';
  if (statuses.every((status) => status === 'NOT_CONFIGURED')) return 'NOT_CONFIGURED';
  if (statuses.some((status) => status === 'STALE')) return 'STALE';
  if (statuses.some((status) => status === 'ERROR')) return 'ERROR';
  return 'UNKNOWN';
}

export function googleSerialToIso(value, timezoneOffsetMinutes = 540) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  // Google SheetsのserialはSpreadsheet timezone上の壁時計。THE REV.の
  // 正本はAsia/Tokyoなので、UTCへ直す際にJST offsetを差し引く。
  const milliseconds = Math.round((value - 25569) * 86400000) - timezoneOffsetMinutes * 60000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeDate(value) {
  if (typeof value === 'number') return googleSerialToIso(value);
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let normalized = raw
    .replace(/\//g, '-')
    .replace(/\s+(\d{1,2}:\d{2})(?!:)/, 'T$1:00')
    .replace(/\s+(\d{1,2}:\d{2}:\d{2})/, 'T$1');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized += 'T00:00:00+09:00';
  else if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}:\d{2}$/.test(normalized)) normalized += '+09:00';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

export function latestIso(values = []) {
  const dates = values.map(normalizeDate).filter((value) => value && !Number.isNaN(Date.parse(value)));
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}

export function rowsToObjects(values = [], headerIndex = 0) {
  const header = (values[headerIndex] || []).map((cell) => String(cell ?? '').trim());
  if (!header.some(Boolean)) return [];
  return values.slice(headerIndex + 1).filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== undefined)).map((row) => {
    const object = {};
    header.forEach((key, index) => { if (key) object[key] = row[index] ?? null; });
    return object;
  });
}

export function findHeaderIndex(values = [], required = []) {
  return values.findIndex((row) => required.every((key) => row.map((cell) => String(cell ?? '').trim()).includes(key)));
}

export function safeExternalUrl(value, allowedHosts = []) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || (allowedHosts.length && !allowedHosts.includes(url.hostname))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function safeText(value, maxLength = 280) {
  return String(value ?? '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted]')
    .replace(/(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
