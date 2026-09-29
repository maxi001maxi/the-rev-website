import { requireSession, signOut } from './admin-auth.mjs';
import { AdminApi } from './admin-api.mjs';

const fmt = new Intl.NumberFormat('ja-JP');
const count = (value) => Number.isFinite(Number(value)) ? fmt.format(Number(value)) : '—';

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function clearNode(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function td(text, className = '') {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function emptyRow(tbody, cols, message = 'データはまだありません。') {
  clearNode(tbody);
  const row = document.createElement('tr');
  const cell = td(message, 'admin-empty-row');
  cell.colSpan = cols;
  row.appendChild(cell);
  tbody.appendChild(row);
}

function changeText(value) {
  if (value === null || value === undefined) return '前期間の比較データなし';
  if (value === 0) return '前期間と同じ';
  return `前期間比 ${value > 0 ? '+' : ''}${value}%`;
}

function renderChange(id, value) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = changeText(value);
  node.classList.remove('is-up', 'is-down');
  if (typeof value === 'number' && value > 0) node.classList.add('is-up');
  if (typeof value === 'number' && value < 0) node.classList.add('is-down');
}

function renderPages(items) {
  const tbody = document.getElementById('top-pages-body');
  clearNode(tbody);
  if (!items?.length) return emptyRow(tbody, 3);
  for (const item of items) {
    const row = document.createElement('tr');
    const first = document.createElement('td');
    first.className = 'admin-insight-page';
    const title = document.createElement('strong');
    title.textContent = item.title || item.path || 'Untitled';
    const path = document.createElement('small');
    path.textContent = item.path || '/';
    first.append(title, path);
    row.append(first, td(count(item.views)), td(count(item.users)));
    tbody.appendChild(row);
  }
}

function renderTraffic(items) {
  const tbody = document.getElementById('traffic-body');
  clearNode(tbody);
  if (!items?.length) return emptyRow(tbody, 3);
  for (const item of items) {
    const row = document.createElement('tr');
    row.append(td(item.sourceMedium || '—'), td(count(item.sessions)), td(count(item.users)));
    tbody.appendChild(row);
  }
}

function renderEvents(items) {
  const tbody = document.getElementById('events-body');
  clearNode(tbody);
  if (!items?.length) return emptyRow(tbody, 2, '主要CTAイベントはまだ受信されていません。');
  for (const item of items) {
    const row = document.createElement('tr');
    row.append(td(item.event || '—'), td(count(item.count)));
    tbody.appendChild(row);
  }
}

function renderDevices(items) {
  const root = document.getElementById('devices-list');
  clearNode(root);
  if (!items?.length) {
    const p = document.createElement('p');
    p.className = 'admin-empty-row';
    p.textContent = 'データはまだありません。';
    root.appendChild(p);
    return;
  }
  const max = Math.max(...items.map((item) => Number(item.users || 0)), 1);
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'admin-device-row';

    const name = document.createElement('span');
    name.className = 'admin-device-name';
    name.textContent = item.device || 'unknown';

    const track = document.createElement('span');
    track.className = 'admin-device-track';
    const fill = document.createElement('span');
    fill.className = 'admin-device-fill';
    fill.style.width = `${Math.max(2, Math.round((Number(item.users || 0) / max) * 100))}%`;
    track.appendChild(fill);

    const value = document.createElement('span');
    value.className = 'admin-device-value';
    value.textContent = `${count(item.users)} users`;

    row.append(name, track, value);
    root.appendChild(row);
  }
}

function render(payload) {
  const current = payload.summary?.current || {};
  const change = payload.summary?.change || {};

  setText('metric-users', count(current.users));
  setText('metric-sessions', count(current.sessions));
  setText('metric-views', count(current.views));
  setText('metric-new-users', count(current.newUsers));

  renderChange('change-users', change.users);
  renderChange('change-sessions', change.sessions);
  renderChange('change-views', change.views);
  renderChange('change-new-users', change.newUsers);

  if (payload.realtime) {
    setText('realtime-users', count(payload.realtime.activeUsers));
    setText('realtime-views', `${count(payload.realtime.views)} views`);
    setText('realtime-events', `${count(payload.realtime.eventCount)} events`);
  } else {
    setText('realtime-users', '—');
    setText('realtime-views', 'GSC Wizard接続ではRealtime未対応');
    setText('realtime-events', '');
  }

  setText('audience-new', count(payload.audience?.new));
  setText('audience-active', count(payload.audience?.active));

  renderPages(payload.topPages);
  renderTraffic(payload.traffic);
  renderDevices(payload.devices);
  renderEvents(payload.events);

  const generated = payload.generatedAt ? new Date(payload.generatedAt) : null;
  setText(
    'analytics-updated',
    generated && !Number.isNaN(generated.getTime())
      ? `${payload.range?.label || ''} / Updated ${generated.toLocaleString('ja-JP')}`
      : (payload.range?.label || '')
  );
}

async function load(range) {
  const loading = document.getElementById('analytics-loading');
  const content = document.getElementById('analytics-content');
  const error = document.getElementById('analytics-error');
  loading.classList.remove('admin-hidden');
  content.classList.add('admin-hidden');
  error.classList.add('admin-hidden');
  error.textContent = '';

  try {
    const payload = await AdminApi.getAnalytics(range);
    render(payload);
    loading.classList.add('admin-hidden');
    content.classList.remove('admin-hidden');
  } catch (e) {
    loading.classList.add('admin-hidden');
    if (e.status === 401) {
      location.replace('/admin/login/');
      return;
    }
    error.textContent = e.code === 'analytics_not_configured'
      ? 'AnalyticsのGA4接続を利用できません。Site Insightsの接続状態を確認してください。'
      : (e.message || 'Analyticsの取得に失敗しました。');
    error.classList.remove('admin-hidden');
  }
}

async function init() {
  const result = await requireSession();
  if (!result) return;

  setText('user-email', result.session.user.email || '');
  document.getElementById('checking').classList.add('admin-hidden');
  document.getElementById('app').classList.remove('admin-hidden');
  document.getElementById('logout-btn').addEventListener('click', () => signOut());

  const buttons = Array.from(document.querySelectorAll('[data-range]'));
  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', b === button ? 'true' : 'false'));
      await load(button.dataset.range);
    });
  });

  await load('7d');
}

init();
