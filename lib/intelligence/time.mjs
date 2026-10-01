const DAY_MS = 86400000;
const MODE_SET = new Set(['today', 'week', 'month']);

function dateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function tokyoDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid date');
  const { year, month, day } = dateParts(date);
  return `${year}-${month}-${day}`;
}

function parseKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!match) throw new TypeError('Invalid date key');
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function key(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  return key(new Date(parseKey(dateKey).getTime() + days * DAY_MS));
}

function monthStart(dateKey) {
  return `${dateKey.slice(0, 7)}-01`;
}

function previousMonthStart(dateKey) {
  const current = parseKey(monthStart(dateKey));
  return key(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1)));
}

function monthEnd(dateKey) {
  const current = parseKey(monthStart(dateKey));
  return key(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)));
}

function weekStart(dateKey) {
  const date = parseKey(dateKey);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return addDays(dateKey, -mondayOffset);
}

function range(start, end) {
  return { start, end, days: Math.round((parseKey(end) - parseKey(start)) / DAY_MS) + 1 };
}

export function normalizeMode(value) {
  const mode = String(value || 'week').toLowerCase();
  return MODE_SET.has(mode) ? mode : null;
}

export function buildPeriod(modeValue = 'week', now = new Date()) {
  const mode = normalizeMode(modeValue);
  if (!mode) throw new TypeError('Invalid intelligence mode');
  const today = tokyoDateKey(now);
  if (mode === 'today') {
    return {
      key: 'TODAY', label: 'TODAY', current: range(today, today),
      previousComparable: range(addDays(today, -1), addDays(today, -1)),
      previousFull: null, partial: false, comparisonLabel: '前日'
    };
  }
  if (mode === 'week') {
    const start = weekStart(today);
    const elapsed = Math.round((parseKey(today) - parseKey(start)) / DAY_MS);
    const previousStart = addDays(start, -7);
    return {
      key: 'THIS_WEEK', label: 'THIS WEEK', current: range(start, today),
      previousComparable: range(previousStart, addDays(previousStart, elapsed)),
      previousFull: range(previousStart, addDays(previousStart, 6)),
      partial: elapsed < 6, comparisonLabel: '前週同曜日まで'
    };
  }
  const start = monthStart(today);
  const previousStart = previousMonthStart(today);
  const currentDay = Number(today.slice(8, 10));
  const previousLastDay = Number(monthEnd(previousStart).slice(8, 10));
  const comparableEnd = `${previousStart.slice(0, 8)}${String(Math.min(currentDay, previousLastDay)).padStart(2, '0')}`;
  return {
    key: 'THIS_MONTH', label: 'THIS MONTH', current: range(start, today),
    previousComparable: range(previousStart, comparableEnd),
    previousFull: range(previousStart, monthEnd(previousStart)),
    partial: today !== monthEnd(today), comparisonLabel: '前月同日まで'
  };
}

export function defaultSearchRange(modeValue) {
  const mode = normalizeMode(modeValue);
  return mode === 'month' ? '28d' : '7d';
}
