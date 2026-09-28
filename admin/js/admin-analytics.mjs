import { requireSession, signOut } from './admin-auth.mjs';
import { AdminApi } from './admin-api.mjs';

const fmt = new Intl.NumberFormat('ja-JP');
const pctFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

const EVENT_LABELS = {
  reserve_click: '初回体験予約',
  line_click: '公式LINE',
  price_click: '料金を見る',
  article_cta_click: '記事CTA',
  recovery_click: 'リカバリー',
  trainer_click: 'トレーナー',
  review_click: '口コミ',
  map_click: 'Google Maps',
  instagram_click: 'Instagram'
};

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

function percent(part, total) {
  const p = Number(part || 0);
  const t = Number(total || 0);
  if (!t) return 0;
  return (p / t) * 100;
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  if (!value) return '0秒';
  if (value < 60) return `${Math.round(value)}秒`;
  const minutes = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return rest ? `${minutes}分${rest}秒` : `${minutes}分`;
}

function formatDateLabel(value) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value || '—';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function eventCount(events, name) {
  return Number((events || []).find((item) => item.event === name)?.count || 0);
}

function totalEventCount(events) {
  return (events || []).reduce((sum, item) => sum + Number(item.count || 0), 0);
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
    row.append(first, td(fmt.format(item.views || 0)), td(fmt.format(item.users || 0)));
    tbody.appendChild(row);
  }
}

function renderTraffic(items) {
  const tbody = document.getElementById('traffic-body');
  clearNode(tbody);
  if (!items?.length) return emptyRow(tbody, 3);
  for (const item of items) {
    const row = document.createElement('tr');
    row.append(
      td(item.sourceMedium || '(direct) / (none)'),
      td(fmt.format(item.sessions || 0)),
      td(fmt.format(item.users || 0))
    );
    tbody.appendChild(row);
  }
}

function renderEvents(items, sessions) {
  const tbody = document.getElementById('events-body');
  clearNode(tbody);
  if (!items?.length) return emptyRow(tbody, 3, '主要CTAイベントはまだ受信されていません。');

  for (const item of items) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.className = 'admin-event-name';
    const label = document.createElement('strong');
    label.textContent = EVENT_LABELS[item.event] || item.event || '—';
    const raw = document.createElement('small');
    raw.textContent = item.event || '';
    nameCell.append(label, raw);

    const count = Number(item.count || 0);
    const sessionRate = sessions ? percent(count, sessions) : 0;
    row.append(
      nameCell,
      td(fmt.format(count)),
      td(sessions ? `${pctFmt.format(sessionRate)}%` : '—')
    );
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
  const total = items.reduce((sum, item) => sum + Number(item.users || 0), 0);
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
    fill.style.width = `${Math.max(2, Math.round(percent(item.users, total)))}%`;
    track.appendChild(fill);

    const value = document.createElement('span');
    value.className = 'admin-device-value';
    value.textContent = `${fmt.format(item.users || 0)} · ${pctFmt.format(percent(item.users, total))}%`;

    row.append(name, track, value);
    root.appendChild(row);
  }
}

function addInsight(root, label, title, detail = '') {
  const card = document.createElement('article');
  card.className = 'admin-insight-item';
  const labelNode = document.createElement('span');
  labelNode.className = 'admin-insight-label';
  labelNode.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = title;
  card.append(labelNode, strong);
  if (detail) {
    const p = document.createElement('p');
    p.textContent = detail;
    card.appendChild(p);
  }
  root.appendChild(card);
}

function renderInsightSummary(payload) {
  const root = document.getElementById('insight-summary');
  clearNode(root);

  const current = payload.summary?.current || {};
  const change = payload.summary?.change || {};
  const topPage = payload.topPages?.[0];
  const topTraffic = payload.traffic?.[0];
  const reserve = eventCount(payload.events, 'reserve_click');
  const line = eventCount(payload.events, 'line_click');

  let trafficTitle = '前期間との比較データを確認中';
  let trafficDetail = 'データがたまると、アクセスの増減をここで短く把握できます。';
  if (typeof change.users === 'number') {
    if (change.users > 0) {
      trafficTitle = `ユーザー数は前期間比 +${change.users}%`;
      trafficDetail = 'アクセスは前期間より増えています。どの流入・ページが寄与したか下で確認できます。';
    } else if (change.users < 0) {
      trafficTitle = `ユーザー数は前期間比 ${change.users}%`;
      trafficDetail = 'アクセスは前期間を下回っています。流入元と主要ページの変化を確認してください。';
    } else {
      trafficTitle = 'ユーザー数は前期間と同水準';
      trafficDetail = '大きな増減はありません。CTAや人気ページの中身を確認する段階です。';
    }
  }
  addInsight(root, 'Traffic', trafficTitle, trafficDetail);

  addInsight(
    root,
    'Content',
    topPage ? `最多閲覧は「${topPage.title || topPage.path}」` : '人気ページはまだ判定できません',
    topPage ? `${fmt.format(topPage.views || 0)} views / ${fmt.format(topPage.users || 0)} users` : '閲覧データの蓄積後に表示します。'
  );

  addInsight(
    root,
    'Acquisition',
    topTraffic ? `最多流入は ${topTraffic.sourceMedium}` : '流入元はまだ判定できません',
    topTraffic ? `${fmt.format(topTraffic.sessions || 0)} sessions` : '参照元データの蓄積後に表示します。'
  );

  addInsight(
    root,
    'Action',
    reserve || line ? `予約 ${fmt.format(reserve)}件 / LINE ${fmt.format(line)}件` : '主要CTAはまだ受信されていません',
    reserve || line ? 'クリック数は成約数ではありません。問い合わせ・予約意向の動きとして確認します。' : 'GTMでイベント転送後、予約・LINE等の動きがここに表示されます。'
  );

  setText('metric-duration', formatDuration(current.averageSessionDuration));
  setText('metric-engagement', `${pctFmt.format(Number(current.engagementRate || 0) * 100)}%`);
  setText('metric-cta-total', fmt.format(totalEventCount(payload.events)));
  setText('metric-reserve', fmt.format(reserve));
}

function renderTrend(items) {
  const root = document.getElementById('trend-chart');
  clearNode(root);

  if (!items?.length) {
    const empty = document.createElement('div');
    empty.className = 'admin-trend-empty';
    empty.textContent = '日別データはまだありません。';
    root.appendChild(empty);
    return;
  }

  const width = 760;
  const height = 250;
  const pad = { top: 22, right: 24, bottom: 34, left: 34 };
  const usableW = width - pad.left - pad.right;
  const usableH = height - pad.top - pad.bottom;
  const values = items.map((item) => Number(item.views || 0));
  const maxValue = Math.max(...values, 1);
  const points = items.map((item, index) => {
    const x = pad.left + (items.length === 1 ? usableW / 2 : (index / (items.length - 1)) * usableW);
    const y = pad.top + usableH - (Number(item.views || 0) / maxValue) * usableH;
    return { x, y, item };
  });

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'admin-trend-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '日別ページビュー推移');

  for (const ratio of [0, 0.5, 1]) {
    const y = pad.top + usableH * ratio;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', pad.left);
    line.setAttribute('x2', width - pad.right);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('class', 'admin-trend-grid');
    svg.appendChild(line);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', pad.left - 8);
    label.setAttribute('y', y + 3);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'admin-trend-axis-label');
    label.textContent = fmt.format(Math.round(maxValue * (1 - ratio)));
    svg.appendChild(label);
  }

  const area = document.createElementNS(ns, 'path');
  const areaPath = [
    `M ${points[0].x} ${pad.top + usableH}`,
    ...points.map((p) => `L ${p.x} ${p.y}`),
    `L ${points[points.length - 1].x} ${pad.top + usableH}`,
    'Z'
  ].join(' ');
  area.setAttribute('d', areaPath);
  area.setAttribute('class', 'admin-trend-area');
  svg.appendChild(area);

  const polyline = document.createElementNS(ns, 'polyline');
  polyline.setAttribute('points', points.map((p) => `${p.x},${p.y}`).join(' '));
  polyline.setAttribute('class', 'admin-trend-line');
  svg.appendChild(polyline);

  for (const p of points) {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', items.length > 14 ? '2.5' : '3.8');
    circle.setAttribute('class', 'admin-trend-dot');
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${formatDateLabel(p.item.date)}: ${fmt.format(p.item.views || 0)} views / ${fmt.format(p.item.users || 0)} users`;
    circle.appendChild(title);
    svg.appendChild(circle);
  }

  const labelIndexes = [...new Set([0, Math.floor((items.length - 1) / 2), items.length - 1])];
  for (const index of labelIndexes) {
    const p = points[index];
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', p.x);
    label.setAttribute('y', height - 8);
    label.setAttribute('text-anchor', index === 0 ? 'start' : index === items.length - 1 ? 'end' : 'middle');
    label.setAttribute('class', 'admin-trend-axis-label');
    label.textContent = formatDateLabel(p.item.date);
    svg.appendChild(label);
  }

  root.appendChild(svg);
}

function renderAudience(audience) {
  const n = Number(audience?.new || 0);
  const r = Number(audience?.returning || 0);
  const total = n + r + Number(audience?.other || 0);
  setText('audience-new', fmt.format(n));
  setText('audience-returning', fmt.format(r));
  setText('audience-new-share', total ? `${pctFmt.format(percent(n, total))}%` : '—');
  setText('audience-returning-share', total ? `${pctFmt.format(percent(r, total))}%` : '—');
}

function render(payload) {
  const current = payload.summary?.current || {};
  const change = payload.summary?.change || {};

  setText('metric-users', fmt.format(current.users || 0));
  setText('metric-sessions', fmt.format(current.sessions || 0));
  setText('metric-views', fmt.format(current.views || 0));
  setText('metric-new-users', fmt.format(current.newUsers || 0));

  renderChange('change-users', change.users);
  renderChange('change-sessions', change.sessions);
  renderChange('change-views', change.views);
  renderChange('change-new-users', change.newUsers);

  if (payload.realtime) {
    setText('realtime-users', fmt.format(payload.realtime.activeUsers || 0));
    setText('realtime-views', `${fmt.format(payload.realtime.views || 0)} views`);
    setText('realtime-events', `${fmt.format(payload.realtime.eventCount || 0)} events`);
  } else {
    setText('realtime-users', '—');
    setText('realtime-views', 'Realtime unavailable');
    setText('realtime-events', '');
  }

  renderInsightSummary(payload);
  renderTrend(payload.trend);
  renderPages(payload.topPages);
  renderTraffic(payload.traffic);
  renderDevices(payload.devices);
  renderAudience(payload.audience);
  renderEvents(payload.events, current.sessions);

  document.getElementById('data-source-status')?.classList.add('is-connected');

  const generated = payload.generatedAt ? new Date(payload.generatedAt) : null;
  setText(
    'analytics-updated',
    generated && !Number.isNaN(generated.getTime())
      ? `${payload.range?.label || ''} / Updated ${generated.toLocaleString('ja-JP')}`
      : (payload.range?.label || '')
  );
}

function setRangeDisabled(disabled) {
  document.querySelectorAll('[data-range]').forEach((button) => {
    button.disabled = disabled;
  });
}

async function load(range) {
  const loading = document.getElementById('analytics-loading');
  const content = document.getElementById('analytics-content');
  const error = document.getElementById('analytics-error');
  setRangeDisabled(true);
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
      ? 'GA4 Data APIはまだ接続されていません。GA4_PROPERTY_ID とサービスアカウントのサーバー設定が完了すると、ここに実データが表示されます。'
      : (e.message || 'Insightsの取得に失敗しました。');
    error.classList.remove('admin-hidden');
  } finally {
    setRangeDisabled(false);
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
