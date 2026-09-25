import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PRODUCTION_URL || 'https://therev-lab.com';
const gtmId = process.env.GTM_ID || 'GTM-WFD7R8BT';

const pages = [
  { name: 'TOP', path: '/' },
  { name: 'Blog index', path: '/blog/' },
  { name: 'Price', path: '/price.html' },
  { name: 'Trainer', path: '/trainer.html' },
  { name: 'Solution', path: '/solution.html' },
  { name: 'Blog article', path: '/blog/training-how-hard-to-push/' }
];

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

async function inspectPublishedContainer() {
  const url = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 GA4-Live-Audit' } });
  const text = await response.text();
  const googleTagIds = uniq(text.match(/(?:G|GT|AW|DC)-[A-Z0-9]+/g) || []);
  const gaMeasurementIds = googleTagIds.filter((id) => /^G-[A-Z0-9]+$/.test(id));
  return {
    url,
    httpStatus: response.status,
    bytes: Buffer.byteLength(text),
    googleTagIds,
    gaMeasurementIds,
    hasGaMeasurementId: gaMeasurementIds.length > 0
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'ja-JP',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 THE-REV-GA4-AUDIT'
});

const pageResults = [];

for (const target of pages) {
  const page = await context.newPage();
  const requests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (
      url.includes('googletagmanager.com') ||
      url.includes('google-analytics.com') ||
      url.includes('analytics.google.com')
    ) {
      requests.push(url);
    }
  });

  const url = new URL(target.path, base);
  url.searchParams.set('rev_ga4_audit', String(Date.now()));

  let responseStatus = null;
  let navigationError = null;
  try {
    const response = await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 45000 });
    responseStatus = response?.status() ?? null;
    await page.waitForTimeout(2500);
  } catch (error) {
    navigationError = error?.message || String(error);
  }

  const state = await page.evaluate(() => {
    const dl = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    const eventNames = dl
      .map((item) => item && typeof item === 'object' ? item.event : null)
      .filter(Boolean);
    const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
    return {
      title: document.title,
      href: location.href,
      dataLayerLength: dl.length,
      dataLayerEvents: [...new Set(eventNames)],
      scripts
    };
  }).catch(() => ({ title: '', href: url.toString(), dataLayerLength: 0, dataLayerEvents: [], scripts: [] }));

  const googleRequests = uniq(requests);
  const collectRequests = googleRequests.filter((u) =>
    /google-analytics\.com\/(g\/collect|collect)/.test(u) ||
    /googletagmanager\.com\/g\/collect/.test(u)
  );
  const gtagConfigRequests = googleRequests.filter((u) =>
    /googletagmanager\.com\/gtag\/js/.test(u)
  );
  const gtmRequests = googleRequests.filter((u) =>
    /googletagmanager\.com\/gtm\.js/.test(u)
  );

  const idsFromRequests = uniq(
    googleRequests.flatMap((u) => {
      try {
        const parsed = new URL(u);
        const ids = [parsed.searchParams.get('id'), parsed.searchParams.get('tid')].filter(Boolean);
        return ids;
      } catch {
        return [];
      }
    })
  );

  pageResults.push({
    name: target.name,
    path: target.path,
    httpStatus: responseStatus,
    navigationError,
    title: state.title,
    gtmLoaded: gtmRequests.some((u) => u.includes(gtmId)),
    gtmRequestCount: gtmRequests.length,
    gtagConfigRequestCount: gtagConfigRequests.length,
    analyticsCollectCount: collectRequests.length,
    googleTagIdsObserved: idsFromRequests,
    dataLayerLength: state.dataLayerLength,
    dataLayerEvents: state.dataLayerEvents
  });

  await page.close();
}

await browser.close();

const publishedContainer = await inspectPublishedContainer();
const allObservedIds = uniq(pageResults.flatMap((p) => p.googleTagIdsObserved));
const observedMeasurementIds = allObservedIds.filter((id) => /^G-[A-Z0-9]+$/.test(id));
const totalCollects = pageResults.reduce((sum, p) => sum + p.analyticsCollectCount, 0);

const result = {
  auditedAt: new Date().toISOString(),
  base,
  gtmId,
  publishedContainer,
  summary: {
    pagesAudited: pageResults.length,
    pagesWithGtm: pageResults.filter((p) => p.gtmLoaded).length,
    pagesWithAnalyticsCollect: pageResults.filter((p) => p.analyticsCollectCount > 0).length,
    totalAnalyticsCollectRequests: totalCollects,
    observedMeasurementIds
  },
  pages: pageResults
};

fs.writeFileSync('ga4-live-audit.json', JSON.stringify(result, null, 2) + '\n');

console.log('GA4_LIVE_AUDIT_RESULT');
console.log(JSON.stringify({
  publishedContainer,
  summary: result.summary,
  pages: pageResults.map((p) => ({
    name: p.name,
    httpStatus: p.httpStatus,
    gtmLoaded: p.gtmLoaded,
    analyticsCollectCount: p.analyticsCollectCount,
    googleTagIdsObserved: p.googleTagIdsObserved,
    dataLayerEvents: p.dataLayerEvents
  }))
}, null, 2));
