// THE REV. Admin Insights — Preview visual QA
// Renders the authenticated dashboard shell with deterministic mock GA4 data.
// The production auth/API path is tested separately; this script focuses on responsive layout.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL?.replace(/\/$/, '');
const BYPASS = process.env.VERCEL_BYPASS_SECRET || '';
const OUT = process.env.OUT_DIR || 'qa-admin-insights';
const LITE = process.env.LITE_DIR || 'qa-admin-insights-lite';
if (!BASE) throw new Error('BASE_URL is required.');

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '430', width: 430, height: 932, mobile: true },
  { name: '768', width: 768, height: 1024, mobile: false },
  { name: '1024', width: 1024, height: 900, mobile: false },
  { name: '1440', width: 1440, height: 900, mobile: false }
];

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(LITE, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}
  });
  const page = await context.newPage();

  // Keep the page on the Insights screen without contacting Supabase/GA4.
  await page.route('**/admin/js/admin-analytics.mjs', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* visual QA stub */' });
  });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

  const response = await page.goto(`${BASE}/admin/analytics/`, { waitUntil: 'load', timeout: 45000 });
  await page.evaluate(() => {
    document.getElementById('checking')?.classList.add('admin-hidden');
    document.getElementById('app')?.classList.remove('admin-hidden');
    document.getElementById('analytics-loading')?.classList.add('admin-hidden');
    document.getElementById('analytics-content')?.classList.remove('admin-hidden');
    document.getElementById('data-source-status')?.classList.add('is-connected');

    const t = (id, value) => { const n = document.getElementById(id); if (n) n.textContent = value; };
    t('user-email', 'owner@example.com');
    t('realtime-users', '3');
    t('realtime-views', '7 views');
    t('realtime-events', '12 events');
    t('metric-users', '128');
    t('metric-sessions', '176');
    t('metric-views', '412');
    t('metric-new-users', '94');
    t('change-users', '前期間比 +18.5%');
    t('change-sessions', '前期間比 +14.3%');
    t('change-views', '前期間比 +22.1%');
    t('change-new-users', '前期間比 +20.5%');
    t('metric-duration', '1分24秒');
    t('metric-engagement', '61.8%');
    t('metric-cta-total', '37');
    t('metric-reserve', '8');
    t('audience-new', '94');
    t('audience-returning', '34');
    t('audience-new-share', '73.4%');
    t('audience-returning-share', '26.6%');
    t('analytics-updated', '過去7日 / Updated 2026/9/26 17:30:00');

    const insights = document.getElementById('insight-summary');
    if (insights) {
      const data = [
        ['Traffic', 'ユーザー数は前期間比 +18.5%', 'アクセスは前期間より増えています。'],
        ['Content', '最多閲覧は「料金・プラン」', '86 views / 51 users'],
        ['Acquisition', '最多流入は google / organic', '72 sessions'],
        ['Action', '予約 8件 / LINE 12件', 'クリック数は成約数ではありません。']
      ];
      insights.replaceChildren(...data.map(([label, title, detail]) => {
        const el = document.createElement('article');
        el.className = 'admin-insight-item';
        const l = document.createElement('span'); l.className = 'admin-insight-label'; l.textContent = label;
        const s = document.createElement('strong'); s.textContent = title;
        const p = document.createElement('p'); p.textContent = detail;
        el.append(l, s, p);
        return el;
      }));
    }

    const trend = document.getElementById('trend-chart');
    if (trend) {
      trend.innerHTML = '<svg class="admin-trend-svg" viewBox="0 0 760 250" role="img" aria-label="mock trend"><line x1="34" y1="216" x2="736" y2="216" class="admin-trend-grid"/><line x1="34" y1="119" x2="736" y2="119" class="admin-trend-grid"/><line x1="34" y1="22" x2="736" y2="22" class="admin-trend-grid"/><path d="M34 216 L34 170 L151 146 L268 160 L385 105 L502 125 L619 70 L736 48 L736 216 Z" class="admin-trend-area"/><polyline points="34,170 151,146 268,160 385,105 502,125 619,70 736,48" class="admin-trend-line"/><circle cx="34" cy="170" r="3.8" class="admin-trend-dot"/><circle cx="151" cy="146" r="3.8" class="admin-trend-dot"/><circle cx="268" cy="160" r="3.8" class="admin-trend-dot"/><circle cx="385" cy="105" r="3.8" class="admin-trend-dot"/><circle cx="502" cy="125" r="3.8" class="admin-trend-dot"/><circle cx="619" cy="70" r="3.8" class="admin-trend-dot"/><circle cx="736" cy="48" r="3.8" class="admin-trend-dot"/><text x="34" y="242" class="admin-trend-axis-label">9/20</text><text x="385" y="242" text-anchor="middle" class="admin-trend-axis-label">9/23</text><text x="736" y="242" text-anchor="end" class="admin-trend-axis-label">9/26</text></svg>';
    }

    const fillRows = (id, rows) => {
      const body = document.getElementById(id);
      if (!body) return;
      body.replaceChildren(...rows.map((cols) => {
        const tr = document.createElement('tr');
        cols.forEach((value, index) => {
          const td = document.createElement('td');
          if (index === 0 && id === 'top-pages-body') td.className = 'admin-insight-page';
          td.textContent = value;
          tr.appendChild(td);
        });
        return tr;
      }));
    };
    fillRows('top-pages-body', [
      ['料金・プラン /price.html', '86', '51'],
      ['TOP /', '72', '48'],
      ['アクセス /access.html', '44', '31'],
      ['コラム /blog/', '39', '28']
    ]);
    fillRows('traffic-body', [
      ['google / organic', '72', '58'],
      ['(direct) / (none)', '51', '42'],
      ['instagram / social', '21', '18']
    ]);
    fillRows('events-body', [
      ['初回体験予約 reserve_click', '8', '4.5%'],
      ['公式LINE line_click', '12', '6.8%'],
      ['料金を見る price_click', '9', '5.1%']
    ]);

    const devices = document.getElementById('devices-list');
    if (devices) {
      const rows = [['mobile', '76%'], ['desktop', '21%'], ['tablet', '3%']];
      devices.replaceChildren(...rows.map(([name, share]) => {
        const row = document.createElement('div'); row.className = 'admin-device-row';
        const n = document.createElement('span'); n.className = 'admin-device-name'; n.textContent = name;
        const track = document.createElement('span'); track.className = 'admin-device-track';
        const fill = document.createElement('span'); fill.className = 'admin-device-fill'; fill.style.width = share;
        track.appendChild(fill);
        const v = document.createElement('span'); v.className = 'admin-device-value'; v.textContent = share;
        row.append(n, track, v);
        return row;
      }));
    }
  });

  await page.evaluate(async () => { await document.fonts.ready; }).catch(() => {});
  await page.waitForTimeout(400);

  const metrics = await page.evaluate(() => {
    const de = document.documentElement;
    const overflow = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
      })
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]}`);
    const app = document.getElementById('app');
    const cards = [...document.querySelectorAll('.admin-metric-card')].map((el) => Math.round(el.getBoundingClientRect().width));
    return {
      title: document.title,
      appVisible: app ? getComputedStyle(app).display !== 'none' : false,
      horizontalOverflow: de.scrollWidth > de.clientWidth + 1,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      overflow,
      metricCardWidths: cards,
      snapshotCount: document.querySelectorAll('.admin-insight-item').length,
      trendWidth: Math.round(document.querySelector('.admin-trend-chart')?.getBoundingClientRect().width || 0)
    };
  });

  const base = `insights__${vp.name}`;
  await page.screenshot({ path: path.join(OUT, `${base}__full.png`), fullPage: true });
  await page.screenshot({ path: path.join(LITE, `${base}__full.jpg`), type: 'jpeg', quality: 58, fullPage: true });

  results.push({
    vp: vp.name,
    status: response?.status() || 0,
    consoleErrors,
    ...metrics
  });

  await page.close();
  await context.close();
}

await browser.close();

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(LITE, 'results.json'), JSON.stringify(results, null, 2));

let failed = false;
for (const result of results) {
  if (result.status !== 200 || !result.appVisible || result.horizontalOverflow || result.snapshotCount !== 4) {
    failed = true;
  }
}

const lines = [
  '# Admin Insights Preview QA',
  '',
  `Target: ${BASE}`,
  '',
  '| VP | HTTP | App | Snapshot | Trend width | Horizontal overflow | Metric widths |',
  '|---|---:|---|---:|---:|---|---|',
  ...results.map((r) =>
    `| ${r.vp} | ${r.status} | ${r.appVisible ? 'PASS' : 'FAIL'} | ${r.snapshotCount} | ${r.trendWidth} | ${r.horizontalOverflow ? `FAIL ${r.scrollWidth}>${r.clientWidth} ${r.overflow.join(',')}` : 'PASS'} | ${r.metricCardWidths.join('/')} |`
  )
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
process.exit(failed ? 1 : 0);
