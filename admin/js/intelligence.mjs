import { requireSession, signOut } from './admin-auth.mjs';
import { AdminApi } from './admin-api.mjs';

const $ = (id) => document.getElementById(id);
const make = (tag, text = '', className = '') => {
  const element = document.createElement(tag);
  element.textContent = String(text);
  if (className) element.className = className;
  return element;
};
const append = (parent, ...children) => { parent.append(...children); return parent; };
const labels = { VALUE: '取得済み', ZERO: '取得済み・0', UNKNOWN: '未取得', NOT_CONFIGURED: '接続未設定', STALE: '更新待ち', ERROR: '取得エラー', DELAYED: '反映待ち' };
const reportLabels = { weekly_management: 'WEEKLY MANAGEMENT', owner_brief: 'OWNER BRIEF', marketing_analysis: 'MARKETING ANALYSIS' };

function display(metric) {
  if (!metric || !['VALUE', 'ZERO'].includes(metric.status) || typeof metric.value !== 'number') return '—';
  if (metric.unit === 'yen') return `¥${new Intl.NumberFormat('ja-JP').format(metric.value)}`;
  if (metric.unit === 'ratio') return `${(metric.value * 100).toFixed(1)}%`;
  return new Intl.NumberFormat('ja-JP').format(metric.value);
}

function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return '更新時刻不明';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function stateNode(status) {
  const node = make('span', labels[status] || status || '未取得', 'intelligence-state');
  node.dataset.state = status || 'UNKNOWN';
  return node;
}

function renderMeta(id, section) {
  const box = $(id);
  box.className = 'intelligence-source';
  box.replaceChildren(stateNode(section?.status), make('span', `${section?.source || 'source不明'} · ${formatDate(section?.updatedAt)}`));
}

function metricCard(label, metric, note = '') {
  const card = make('article', '', `intelligence-metric ${['VALUE', 'ZERO'].includes(metric?.status) ? '' : 'is-unavailable'}`.trim());
  append(card, make('p', label), make('strong', display(metric)), make('small', note || labels[metric?.status] || '未取得'));
  return card;
}

function renderManagement(section) {
  renderMeta('management-meta', section);
  const metrics = section.metrics || {};
  const grid = $('management-cards');
  grid.replaceChildren(
    metricCard('今週売上', metrics.currentRevenue, section.period?.current ? `${section.period.current}・途中経過` : ''),
    metricCard('最終確定週売上', metrics.lastClosedRevenue, section.period?.lastClosed || ''),
    metricCard('前週比', metrics.weekOverWeek, metrics.weekOverWeek?.reasonCode === 'current_week_partial_not_comparable' ? '途中週のため確定比較しません' : ''),
    metricCard('新規有料顧客', metrics.newPaidCustomers),
    metricCard('有料購入顧客', metrics.paidCustomers),
    metricCard('要フォロー', metrics.followUp),
    metricCard('次回予約あり', metrics.nextBooking),
    metricCard('月間売上', metrics.monthToDateRevenue)
  );
  const quality = section.dataQuality || {};
  $('management-note').textContent = section.status === 'NOT_CONFIGURED'
    ? 'Google Workspaceのread-only接続後に表示されます。数値は推測しません。'
    : `Data quality: ${quality.label || 'UNKNOWN'}${typeof quality.issues === 'number' ? ` · 確認事項 ${quality.issues}件` : ''}`;
}

function renderWeb(section) {
  renderMeta('web-meta', section);
  const metrics = section.metrics || {};
  $('web-cards').replaceChildren(
    metricCard('Search Clicks', metrics.searchClicks),
    metricCard('Impressions', metrics.searchImpressions),
    metricCard('Sessions', metrics.sessions),
    metricCard('Active Users', metrics.activeUsers),
    metricCard('Page Views', metrics.pageViews),
    metricCard('Reserve CTA', metrics.bookingIntent),
    metricCard('LINE CTA', metrics.lineIntent),
    metricCard('Price CTA', metrics.priceIntent),
    metricCard('Article CTA', metrics.articleCtaIntent)
  );
  const box = $('web-changes');
  box.replaceChildren(make('h3', 'What Changed'));
  const insights = section.insights || [];
  if (!insights.length) return box.append(make('p', '比較できる変化はまだありません。', 'intelligence-empty'));
  const list = make('ul');
  insights.forEach((item) => append(list, append(make('li'), make('span', item.confidence || '—'), make('span', item.headline || '—'))));
  box.append(list);
}

function renderEditorial(section) {
  renderMeta('editorial-meta', section);
  const counts = section.counts || {};
  const countMetric = (value, source = 'supabase') => ({ status: typeof value === 'number' ? (value === 0 ? 'ZERO' : 'VALUE') : 'UNKNOWN', value, unit: 'count', source });
  $('editorial-cards').replaceChildren(
    metricCard('Draft', countMetric(counts.draft)),
    metricCard('Review Ready', countMetric(counts.review)),
    metricCard('Published', countMetric(counts.published), 'GitHub公開のSupabase同期証跡'),
    metricCard('GBP Draft Ready', countMetric(section.gbpDrafts?.ready, 'editorial_sheet')),
    metricCard('GBP URL待ち', countMetric(section.gbpDrafts?.blocked, 'editorial_sheet')),
    metricCard('同期エラー', countMetric(section.syncErrors, 'editorial_sheet + supabase'))
  );
  const box = $('editorial-schedule');
  box.replaceChildren(make('h3', '次の予定'));
  if (!(section.schedule || []).length) return box.append(make('p', section.sources?.sheet?.status === 'NOT_CONFIGURED' ? 'Sheet接続後に予定を表示します。' : '未完了の予定はありません。', 'intelligence-empty'));
  const list = make('ul');
  section.schedule.forEach((item) => append(list, append(make('li'), make('span', `${item.schedule || '日時未定'} · ${item.channel || '媒体未定'}`), make('span', `${item.title || 'タイトル未定'}${item.state ? `｜${item.state}` : ''}`))));
  box.append(list);
}

function renderAnalysis(section) {
  renderMeta('analysis-meta', section);
  const reports = $('reports');
  reports.replaceChildren();
  if (!(section.reports || []).length) reports.append(make('p', section.status === 'NOT_CONFIGURED' ? 'Driveのread-only接続後に最新レポートを表示します。' : '表示できる確定レポートがありません。', 'intelligence-empty'));
  for (const report of section.reports || []) {
    const card = make('article', '', 'intelligence-report');
    const period = report.period?.start && report.period?.end ? `${report.period.start}〜${report.period.end}` : '対象期間不明';
    append(card,
      make('small', `${reportLabels[report.type] || report.type} · ${labels[report.status] || report.status}`),
      make('h3', report.title || '独立したレポートを確認できません'),
      make('p', `${period} · 生成 ${formatDate(report.generatedAt)} · 更新 ${formatDate(report.updatedAt)}`)
    );
    if ((report.summary || []).length) card.append(make('p', report.summary.join(' / ')));
    if (report.url) { const link = make('a', 'Driveで原文を見る →'); link.href = report.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); }
    reports.append(card);
  }
  const priorities = $('priorities');
  priorities.replaceChildren(make('h3', '今週のPriority'));
  if (!(section.priorities || []).length) return priorities.append(make('p', '確定済みPriorityを取得できません。自動生成はしません。', 'intelligence-empty'));
  const list = make('ol');
  section.priorities.forEach((item) => {
    const meta = [
      labels[item.status] || item.status || '未取得',
      `Owner: ${item.owner || 'UNKNOWN'}`,
      `期限: ${item.deadline ? formatDate(item.deadline) : 'UNKNOWN'}`,
      `状態: ${item.executionStatus || 'UNKNOWN'}`
    ].join(' · ');
    append(list, append(make('li'), make('span', `Priority ${item.order} · ${meta}`), make('span', item.title || item.text)));
  });
  priorities.append(list);
}

function render(data) {
  $('loading').classList.add('admin-hidden');
  $('content').classList.remove('admin-hidden');
  $('ranges').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.range === data.range)));
  $('overall').replaceChildren(append(make('div'), make('strong', 'System status '), stateNode(data.status)), make('span', `Generated ${formatDate(data.generatedAt)}`));
  renderManagement(data.sections.management || {});
  renderWeb(data.sections.webSearch || {});
  renderEditorial(data.sections.editorial || {});
  renderAnalysis(data.sections.analysis || {});
}

async function load(range) {
  $('error').classList.add('admin-hidden');
  $('loading').classList.remove('admin-hidden');
  $('content').classList.add('admin-hidden');
  try { render(await AdminApi.getIntelligence(range)); }
  catch (error) {
    $('loading').classList.add('admin-hidden');
    $('error').textContent = error?.message || 'Intelligenceを読み込めませんでした。';
    $('error').classList.remove('admin-hidden');
  }
}

(async () => {
  const auth = await requireSession();
  if (!auth) return;
  $('user-email').textContent = auth.session.user.email;
  $('checking').classList.add('admin-hidden');
  $('app').classList.remove('admin-hidden');
  const range = new URL(location.href).searchParams.get('range');
  load(['7d', '28d', '90d'].includes(range) ? range : '28d');
})();

$('ranges').addEventListener('click', (event) => {
  const range = event.target.closest('button')?.dataset.range;
  if (!range) return;
  const url = new URL(location.href);
  url.searchParams.set('range', range);
  history.pushState(null, '', url);
  load(range);
});
window.addEventListener('popstate', () => load(new URL(location.href).searchParams.get('range') || '28d'));
$('logout-btn').addEventListener('click', () => signOut());
