import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PRODUCTION_URL || 'https://therev-lab.com';
const gtmId = process.env.GTM_ID || 'GTM-WFD7R8BT';
const expectedGa4Id = process.env.GA4_MEASUREMENT_ID || 'G-Q6ZSSJMEZ2';

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
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 THE-REV-GA4-AUDIT' } });
  const body = await response.text();
  const googleTagIds = uniq(body.match(/(?:G|GT|AW|DC)-[A-Z0-9]+/g) || []);
  const gaMeasurementIds = googleTagIds.filter((id) => /^G-[A-Z0-9]+$/.test(id));
  return {
    url,
    httpStatus: response.status,
    bytes: Buffer.byteLength(body),
    googleTagIds,
    gaMeasurementIds,
    hasGaMeasurementId: gaMeasurementIds.length > 0,
    expectedMeasurementId: expectedGa4Id,
    expectedMeasurementIdPresent: gaMeasurementIds.includes(expectedGa4Id)
  };
}

function requestInfo(url) {
  try {
    const u = new URL(url);
    return {
      url: url.slice(0, 800),
      host: u.hostname,
      path: u.pathname,
      tid: u.searchParams.get('tid') || u.searchParams.get('id'),
      event: u.searchParams.get('en'),
      page_location: u.searchParams.get('dl')
    };
  } catch {
    return { url: url.slice(0, 800), host: '', path: '', tid: null, event: null, page_location: null };
  }
}

const browser = await chromium.launch({ headless: true });
const pageResults = [];

for (const target of pages) {
  // Fresh context per URL so caching/session state cannot hide page_view behavior.
  const context = await browser.newContext({
    locale: 'ja-JP',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36 THE-REV-GA4-AUDIT'
  });
  const page = await context.newPage();
  const googleRequests = [];

  page.on('request', (request) => {
    const url = request.url();
    if (
      url.includes('googletagmanager.com') ||
      url.includes('google-analytics.com') ||
      url.includes('analytics.google.com')
    ) {
      googleRequests.push(requestInfo(url));
    }
  });

  const url = new URL(target.path, base);
  url.searchParams.set('rev_ga4_audit', `${Date.now()}-${Math.random().toString(36).slice(2,8)}`);

  let responseStatus = null;
  let navigationError = null;
  try {
    const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
    responseStatus = response?.status() ?? null;
    await page.waitForTimeout(6000);
  } catch (error) {
    navigationError = error?.message || String(error);
  }

  const state = await page.evaluate(() => {
    const dl = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    return {
      title: document.title,
      href: location.href,
      dataLayerLength: dl.length,
      dataLayerEvents: [...new Set(dl.map((item) =>
        item && typeof item === 'object' ? item.event : null
      ).filter(Boolean))]
    };
  }).catch(() => ({
    title: '',
    href: url.toString(),
    dataLayerLength: 0,
    dataLayerEvents: []
  }));

  const exactGa4Requests = googleRequests.filter((r) => r.tid === expectedGa4Id);
  const collectRequests = exactGa4Requests.filter((r) =>
    /\/g\/collect$/.test(r.path) || /\/collect$/.test(r.path)
  );
  const pageViewRequests = collectRequests.filter((r) => r.event === 'page_view');
  const gtmRequests = googleRequests.filter((r) =>
    r.host.includes('googletagmanager.com') && r.path.endsWith('/gtm.js')
  );
  const gtagRequests = googleRequests.filter((r) =>
    r.host.includes('googletagmanager.com') && r.path.includes('/gtag/js')
  );

  pageResults.push({
    name: target.name,
    path: target.path,
    httpStatus: responseStatus,
    navigationError,
    title: state.title,
    gtmLoaded: gtmRequests.some((r) => r.url.includes(gtmId)),
    gtmRequestCount: gtmRequests.length,
    gtagRequestCount: gtagRequests.length,
    expectedGa4RequestCount: exactGa4Requests.length,
    analyticsCollectCount: collectRequests.length,
    pageViewCount: pageViewRequests.length,
    duplicatePageView: pageViewRequests.length > 1,
    observedEvents: uniq(collectRequests.map((r) => r.event)),
    dataLayerLength: state.dataLayerLength,
    dataLayerEvents: state.dataLayerEvents,
    requestSample: googleRequests.slice(0, 12)
  });

  await context.close();
}

await browser.close();

const publishedContainer = await inspectPublishedContainer();
const summary = {
  pagesAudited: pageResults.length,
  pagesWithGtm: pageResults.filter((p) => p.gtmLoaded).length,
  pagesWithExpectedGa4Request: pageResults.filter((p) => p.expectedGa4RequestCount > 0).length,
  pagesWithAnalyticsCollect: pageResults.filter((p) => p.analyticsCollectCount > 0).length,
  pagesWithPageView: pageResults.filter((p) => p.pageViewCount === 1).length,
  pagesWithDuplicatePageView: pageResults.filter((p) => p.duplicatePageView).length,
  totalAnalyticsCollectRequests: pageResults.reduce((sum, p) => sum + p.analyticsCollectCount, 0),
  totalPageViewRequests: pageResults.reduce((sum, p) => sum + p.pageViewCount, 0),
  expectedMeasurementId: expectedGa4Id,
  expectedMeasurementIdObserved: pageResults.some((p) => p.expectedGa4RequestCount > 0)
};

const result = {
  auditedAt: new Date().toISOString(),
  base,
  gtmId,
  publishedContainer,
  summary,
  pages: pageResults
};

fs.writeFileSync('ga4-live-audit.json', JSON.stringify(result, null, 2) + '\n');

console.log('GA4_LIVE_AUDIT_RESULT');
console.log(JSON.stringify({
  publishedContainer,
  summary,
  pages: pageResults.map((p) => ({
    name: p.name,
    httpStatus: p.httpStatus,
    gtmLoaded: p.gtmLoaded,
    expectedGa4RequestCount: p.expectedGa4RequestCount,
    analyticsCollectCount: p.analyticsCollectCount,
    pageViewCount: p.pageViewCount,
    duplicatePageView: p.duplicatePageView,
    observedEvents: p.observedEvents
  }))
}, null, 2));
