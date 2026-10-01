import { requireSession, signOut } from './admin-auth.mjs';
import { AdminApi } from './admin-api.mjs';

const $ = (id) => document.getElementById(id);
const make = (tag, text = '', className = '') => {
  const element = document.createElement(tag);
  element.textContent = text === null || text === undefined ? '' : String(text);
  if (className) element.className = className;
  return element;
};
const append = (parent, ...children) => { parent.append(...children); return parent; };
const observed = (fact) => ['VALUE', 'ZERO', 'PARTIAL'].includes(fact?.status) && typeof fact?.value === 'number';
const statusLabels = { VALUE: '取得済み', ZERO: '取得済み・0', PARTIAL: '一部期間', UNKNOWN: '未取得', NOT_CONFIGURED: '未接続', STALE: '更新待ち', ERROR: '取得エラー' };
const reportLabels = { weekly_management: 'WEEKLY MANAGEMENT', owner_brief: 'OWNER BRIEF', marketing_analysis: 'MARKETING ANALYSIS' };

function display(fact, fallback = '—') {
  if (!observed(fact)) return fallback;
  if (fact.unit === 'yen') return `¥${new Intl.NumberFormat('ja-JP').format(fact.value)}`;
  if (fact.unit === 'ratio') return `${(fact.value * 100).toFixed(1)}%`;
  if (fact.unit === 'position') return fact.value.toFixed(1);
  return new Intl.NumberFormat('ja-JP').format(fact.value);
}

function formatDate(value, includeTime = true) {
  if (!value || Number.isNaN(Date.parse(value))) return '更新時刻不明';
  const options = { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' };
  if (includeTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' });
  return new Intl.DateTimeFormat('ja-JP', options).format(new Date(value));
}

function formatChange(changeValue) {
  if (!changeValue || changeValue.status === 'UNKNOWN') return '比較不可';
  if (typeof changeValue.percent === 'number') return `${changeValue.percent > 0 ? '+' : ''}${(changeValue.percent * 100).toFixed(1)}%`;
  return `${changeValue.absolute > 0 ? '+' : ''}${new Intl.NumberFormat('ja-JP').format(changeValue.absolute)}`;
}

function factNote(fact) {
  const status = statusLabels[fact?.status] || fact?.status || '未取得';
  return `${status}${fact?.quality ? ` · ${fact.quality}` : ''}`;
}

function metricCard(label, fact, note = '') {
  const card = make('article', '', `metric-card ${observed(fact) ? '' : 'is-unavailable'}`.trim());
  append(card, make('small', label), make('strong', display(fact)), make('p', note || factNote(fact)));
  return card;
}

function openDrawer({ title = '根拠', summary = '', evidence = [] }) {
  $('drawer-title').textContent = title;
  const body = $('drawer-body');
  body.replaceChildren();
  if (summary) body.append(make('p', summary, 'drawer-summary'));
  const list = make('div', '', 'evidence-list');
  if (!evidence.length) list.append(make('p', '表示できるEvidenceがありません。判断には使用していません。', 'empty-state'));
  for (const item of evidence) {
    const card = make('article', '', 'evidence-item');
    const head = append(make('header'), make('strong', item.key || 'evidence'), make('span', item.status || 'UNKNOWN'));
    const dl = make('dl');
    const rows = [
      ['値', item.value === null || item.value === undefined ? '—' : display(item, String(item.value))],
      ['Source', item.source || 'UNKNOWN'], ['Updated', formatDate(item.updatedAt)], ['Quality', item.quality || 'UNKNOWN']
    ];
    rows.forEach(([key, value]) => append(dl, make('dt', key), make('dd', value)));
    append(card, head, dl); list.append(card);
  }
  body.append(list);
  $('drawer-backdrop').classList.remove('admin-hidden');
  $('evidence-drawer').classList.add('is-open');
  $('evidence-drawer').setAttribute('aria-hidden', 'false');
}

function closeDrawer() {
  $('drawer-backdrop').classList.add('admin-hidden');
  $('evidence-drawer').classList.remove('is-open');
  $('evidence-drawer').setAttribute('aria-hidden', 'true');
}

function renderPulse(data) {
  const box = $('pulse'); box.replaceChildren();
  for (const item of data.executive.pulse || []) {
    const button = make('button', '', 'pulse-card'); button.type = 'button'; button.dataset.state = item.state;
    append(button, make('small', item.category), make('strong', item.state), make('p', item.reason));
    button.addEventListener('click', () => openDrawer({ title: `${item.category} · ${item.state}`, summary: item.reason, evidence: item.evidence || [] }));
    box.append(button);
  }
}

function renderBrief(data) {
  const brief = data.executive.brief || {};
  const rows = [['STATUS', brief.status], ['MOST IMPORTANT CHANGE', brief.mostImportantChange], ['BOTTLENECK / OPPORTUNITY', brief.bottleneckOrOpportunity], ['NEXT MOVE', brief.nextMove]];
  $('brief').replaceChildren(...rows.map(([label, text]) => append(make('div', '', 'brief-line'), make('small', label), make('p', text))));
  const keys = new Set(brief.evidence || []);
  const evidence = (data.intelligence || []).flatMap((item) => item.evidence || []).filter((item) => keys.has(item.key));
  $('brief-evidence').onclick = () => openDrawer({ title: 'Executive Brief', summary: 'BriefはFactとSignalから決定論的に生成されています。', evidence });
}

function renderPriorities(data) {
  const box = $('priorities'); box.replaceChildren();
  if (!(data.priorities || []).length) return box.append(make('p', '今すぐ提示すべきPriorityは検出されていません。', 'empty-state'));
  for (const item of data.priorities) {
    const button = make('button', '', 'priority-item'); button.type = 'button'; button.dataset.class = item.class;
    append(button, make('span', item.class), append(make('div'), make('strong', item.title), make('p', item.action)));
    button.addEventListener('click', () => openDrawer({ title: `${item.class} · ${item.title}`, summary: item.action, evidence: item.evidence || [] }));
    box.append(button);
  }
}

function renderRevenue(data) {
  const revenue = data.revenue || {};
  $('revenue-meta').textContent = `${data.period.current.start} → ${data.period.current.end}${data.period.partial ? ' · 途中期間' : ''}`;
  $('revenue-cards').replaceChildren(
    metricCard('Current revenue', revenue.current, data.period.label),
    metricCard('Previous comparable', revenue.previousComparable, data.period.comparisonLabel),
    metricCard('Last closed week', revenue.previousFull, '最終確定週'),
    metricCard('Difference', { status: revenue.difference?.status, value: revenue.difference?.percent, unit: 'ratio' }, data.period.partial ? '同じ経過日数のみ比較' : ''),
    metricCard('Monthly revenue', revenue.monthly)
  );
  const chart = $('revenue-chart'); chart.replaceChildren();
  const values = [revenue.previousComparable, revenue.current].filter(observed);
  if (!values.length) chart.append(make('p', '比較可能な売上系列がありません。KPI Exportの粒度を超えて推測しません。', 'empty-state'));
  else {
    const max = Math.max(...values.map((item) => item.value), 1);
    [['Previous comparable', revenue.previousComparable], ['Current', revenue.current]].forEach(([label, fact], index) => {
      const row = make('div', '', `bar-row ${index ? 'is-current' : ''}`.trim());
      const track = make('div', '', 'bar-track'); const fill = make('div', '', 'bar-fill');
      fill.style.width = observed(fact) ? `${Math.max(2, fact.value / max * 100)}%` : '0'; track.append(fill);
      append(row, make('span', label), track, make('strong', display(fact))); chart.append(row);
    });
  }
  const pipeline = $('customer-pipeline'); pipeline.replaceChildren();
  [['New Paid', data.customers.newPaid], ['Paid Customers', data.customers.paid], ['Follow-up', data.customers.followUp], ['Next Booking', data.customers.nextBooking]].forEach(([label, fact]) => {
    pipeline.append(append(make('article', '', 'pipeline-card'), make('small', label), make('strong', display(fact)), make('p', factNote(fact))));
  });
}

function renderFunnel(data) {
  const box = $('funnel'); box.replaceChildren();
  const stages = data.growth.funnel?.stages || [];
  stages.forEach((stage, index) => {
    const conversion = data.growth.funnel?.conversions?.[index - 1];
    const card = make('article', '', 'funnel-stage');
    append(card, make('small', String(index + 1).padStart(2, '0')), make('strong', display(stage.fact)), make('p', stage.label));
    if (conversion) card.append(make('p', conversion.status === 'UNKNOWN' ? 'CVR —' : `CVR ${(conversion.value * 100).toFixed(1)}%`, 'conversion'));
    box.append(card);
  });
}

function trendCard(item) {
  const card = make('article', '', 'trend-card');
  const direction = item.direction || 'UNKNOWN';
  const head = append(make('header'), make('small', item.label), make('b', direction === 'UNKNOWN' ? '比較不可' : `${direction} ${formatChange(item)}`));
  head.lastChild.dataset.direction = direction;
  const bars = make('div', '', 'mini-bars');
  const values = [item.previous?.value, item.current?.value].map((value) => typeof value === 'number' ? value : 0);
  const max = Math.max(...values, 1);
  values.forEach((value) => { const bar = make('span'); bar.style.height = `${Math.max(4, value / max * 100)}%`; bars.append(bar); });
  append(card, head, make('strong', display(item.current)), bars); return card;
}

function renderGrowth(data) {
  $('search-ranges').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.range === data.searchRange)));
  $('growth-trends').replaceChildren(...(data.growth.opportunities?.trends || []).map(trendCard));
  const opportunities = $('opportunities'); opportunities.replaceChildren();
  const ranked = data.growth.opportunities?.ranked || [];
  if (!ranked.length) opportunities.append(make('p', '優先表示するSearch / Web Opportunityはありません。', 'empty-state'));
  ranked.forEach((item, index) => {
    const button = make('button', '', 'ranked-item'); button.type = 'button';
    append(button, make('span', String(index + 1).padStart(2, '0')), append(make('div'), make('strong', item.title), make('p', item.action)), make('small', item.confidence));
    button.addEventListener('click', () => openDrawer({ title: item.title, summary: item.observation, evidence: item.evidence || [] })); opportunities.append(button);
  });
  const queries = $('queries'); queries.replaceChildren();
  const rows = data.growth.opportunities?.queries || [];
  if (!rows.length) queries.append(make('p', 'Queryデータを取得できません。', 'empty-state'));
  rows.forEach((row) => {
    const item = make('div', '', 'query-item');
    append(item, make('span', ''), append(make('div'), make('strong', row.query || '—'), make('p', `Clicks ${row.clicks ?? '—'} · Impressions ${row.impressions ?? '—'}`)), make('small', typeof row.ctr === 'number' ? `CTR ${(row.ctr * 100).toFixed(1)}%` : 'CTR —')); queries.append(item);
  });
}

function renderEditorial(data) {
  const facts = data.editorial.facts || {};
  $('editorial-metrics').replaceChildren(metricCard('Scheduled', { status: data.editorial.schedule?.length ? 'VALUE' : 'ZERO', value: data.editorial.schedule?.length || 0, unit: 'count' }), metricCard('Ready', facts.ready), metricCard('Published', facts.published), metricCard('Error', facts.errors), metricCard('GBP Ready', facts.gbpReady));
  const impact = $('editorial-impact'); impact.replaceChildren();
  const observedImpact = data.editorial.observedAfterPublishing;
  if (!observedImpact) impact.append(make('p', '公開後の変化を比較できるEvidenceはまだありません。因果関係は推測しません。'));
  else {
    impact.append(make('p', observedImpact.statement)); const deltas = make('div', '', 'impact-deltas');
    [['Search', observedImpact.search], ['Sessions', observedImpact.sessions], ['Reserve CTA', observedImpact.reserveCta]].forEach(([label, value]) => deltas.append(make('span', `${label}: ${formatChange(value)}`))); impact.append(deltas);
  }
  const schedule = $('editorial-schedule'); schedule.replaceChildren();
  if (!(data.editorial.schedule || []).length) schedule.append(make('p', '未完了の予定はありません。', 'empty-state'));
  for (const item of data.editorial.schedule || []) append(schedule, append(make('article', '', 'timeline-item'), make('small', `${item.schedule || '日時未定'} · ${item.channel || '媒体未定'}`), make('strong', item.title || 'タイトル未定'), make('p', `${item.state || '状態未取得'}${item.nextAction ? ` · ${item.nextAction}` : ''}`)));
}

function renderStream(data) {
  const box = $('stream'); box.replaceChildren();
  if (!(data.intelligence || []).length) return box.append(make('p', '現在、表示すべき重要な変化は検出されていません。', 'empty-state'));
  for (const item of data.intelligence) {
    const button = make('button', '', 'stream-card'); button.type = 'button';
    append(button, append(make('header'), make('span', item.type, 'stream-type'), make('span', item.confidence, 'stream-confidence')), make('strong', item.title), make('p', item.observation), make('footer', `ACTION · ${item.action}`));
    button.addEventListener('click', () => openDrawer({ title: item.title, summary: `${item.observation} ${item.hypothesis}`, evidence: item.evidence || [] })); box.append(button);
  }
}

function renderReports(data) {
  const box = $('reports'); box.replaceChildren();
  if (!(data.reports?.reports || []).length) return box.append(make('p', data.reports?.status === 'NOT_CONFIGURED' ? 'Drive read-only接続後に表示します。' : '表示できる確定レポートがありません。', 'empty-state'));
  for (const report of data.reports.reports) {
    const card = make('article', '', 'report-card');
    append(card, make('small', `${reportLabels[report.type] || report.type} · ${statusLabels[report.status] || report.status}`), make('h3', report.title || 'レポート未取得'), make('p', `${report.period?.start || '期間不明'} → ${report.period?.end || '期間不明'} · ${formatDate(report.updatedAt)}`));
    if ((report.summary || []).length) card.append(make('p', report.summary.join(' / ')));
    if (report.url) { const link = make('a', 'Driveで原文を見る →'); link.href = report.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); }
    box.append(card);
  }
}

function renderHealth(data) {
  const box = $('data-health'); box.replaceChildren();
  for (const item of data.dataHealth || []) {
    const button = make('button', '', 'health-card'); button.type = 'button'; button.dataset.status = item.status;
    append(button, append(make('header'), make('strong', item.label), make('span', item.status, 'health-status')), make('p', `${item.source || 'source不明'} · ${formatDate(item.updatedAt)}`));
    button.addEventListener('click', () => openDrawer({ title: `${item.label} · ${item.status}`, summary: item.reasonCode || 'Sourceと更新時刻を確認してください。', evidence: item.evidence || [] })); box.append(button);
  }
}

function render(data) {
  $('loading').classList.add('admin-hidden'); $('content').classList.remove('admin-hidden');
  $('modes').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === data.period.key.replace('THIS_', '').toLowerCase())));
  if (data.period.key === 'TODAY') $('modes').querySelector('[data-mode="today"]').setAttribute('aria-pressed', 'true');
  $('period-caption').textContent = `${data.period.current.start} → ${data.period.current.end} · ${data.period.comparisonLabel}と比較`;
  $('generated-at').textContent = `Generated ${formatDate(data.generatedAt)}`;
  renderPulse(data); renderBrief(data); renderPriorities(data); renderRevenue(data); renderFunnel(data); renderGrowth(data); renderEditorial(data); renderStream(data); renderReports(data); renderHealth(data);
}

function currentState() {
  const url = new URL(location.href);
  const mode = ['today', 'week', 'month'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'week';
  const fallbackRange = mode === 'month' ? '28d' : '7d';
  const searchRange = ['7d', '28d', '90d'].includes(url.searchParams.get('searchRange')) ? url.searchParams.get('searchRange') : fallbackRange;
  return { mode, searchRange };
}

async function load() {
  closeDrawer(); $('error').classList.add('admin-hidden'); $('loading').classList.remove('admin-hidden'); $('content').classList.add('admin-hidden');
  const { mode, searchRange } = currentState();
  try { render(await AdminApi.getIntelligence(mode, searchRange)); }
  catch (error) { $('loading').classList.add('admin-hidden'); $('error').textContent = error?.message || 'Intelligenceを読み込めませんでした。'; $('error').classList.remove('admin-hidden'); }
}

function navigate(changes) {
  const url = new URL(location.href); Object.entries(changes).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key)); history.pushState(null, '', url); load();
}

(async () => {
  const auth = await requireSession(); if (!auth) return;
  $('user-email').textContent = auth.session.user.email; $('checking').classList.add('admin-hidden'); $('app').classList.remove('admin-hidden'); load();
})();

$('modes').addEventListener('click', (event) => { const mode = event.target.closest('button')?.dataset.mode; if (mode) navigate({ mode, searchRange: mode === 'month' ? '28d' : '7d' }); });
$('search-ranges').addEventListener('click', (event) => { const searchRange = event.target.closest('button')?.dataset.range; if (searchRange) navigate({ searchRange }); });
window.addEventListener('popstate', load); $('logout-btn').addEventListener('click', () => signOut());
$('drawer-close').addEventListener('click', closeDrawer); $('drawer-backdrop').addEventListener('click', closeDrawer); document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDrawer(); });
