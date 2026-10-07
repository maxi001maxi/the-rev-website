import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PRODUCTION_URL || 'https://therev-lab.com';
const expectedId = process.env.GA4_MEASUREMENT_ID || 'G-Q6ZSSJMEZ2';
const url = new URL('/price.html', base);
url.searchParams.set('cc_prod_acceptance', Date.now().toString());

function requestEvent(request) {
  const rawUrl = request.url();
  if (!rawUrl.includes('google-analytics.com')) return null;
  const body = request.postData() || '';
  const corpus = rawUrl + '&' + body;
  const params = new URLSearchParams(corpus.includes('?') ? corpus.split('?').slice(1).join('?') : corpus);
  return {
    url: rawUrl.slice(0, 900),
    event: params.get('en'),
    tid: params.get('tid') || params.get('id'),
    section_id: params.get('ep.section_id'),
    page_location: params.get('dl')
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'ja-JP',
  userAgent: 'Mozilla/5.0 THE-REV-CONTROL-CAPTURE-ACCEPTANCE'
});
const page = await context.newPage();
const analytics = [];
page.on('request', request => {
  const event = requestEvent(request);
  if (event) analytics.push(event);
});

const response = await page.goto(url.toString(), {
  waitUntil: 'domcontentloaded',
  timeout: 45000
});
if (!response || response.status() !== 200) {
  throw new Error('PRICE_PAGE_HTTP_NOT_200');
}
await page.waitForTimeout(2500);

const metadata = await page.locator('#cat-trial').evaluate(el => ({
  trackSection: el.dataset.trackSection,
  experimentId: el.dataset.experimentId,
  variant: el.dataset.experimentVariant,
  surface: el.dataset.experimentSurface,
  text: el.textContent
}));
if (metadata.trackSection !== 'pricing_trial' ||
    metadata.experimentId !== 'REV-EXP-2026-001' ||
    metadata.variant !== 'control' ||
    metadata.surface !== 'pricing_trial') {
  throw new Error('CONTROL_METADATA_INVALID');
}
if (!metadata.text.includes('¥3,300')) throw new Error('TRIAL_PRICE_CHANGED');

const before = await page.evaluate(() =>
  (window.dataLayer || []).filter(x => x && x.event === 'section_view' && x.section_id === 'pricing_trial').length
);
if (before !== 0) throw new Error('EXPOSURE_FIRED_BEFORE_SURFACE');

await page.locator('#cat-trial').scrollIntoViewIfNeeded();
await page.waitForTimeout(3500);

const afterFirst = await page.evaluate(() =>
  (window.dataLayer || []).filter(x => x && x.event === 'section_view' && x.section_id === 'pricing_trial')
);
if (afterFirst.length !== 1) throw new Error('EXPOSURE_NOT_EXACTLY_ONCE_AFTER_VIEW');
if (afterFirst[0].experiment_id !== 'REV-EXP-2026-001' ||
    afterFirst[0].experiment_variant !== 'control' ||
    afterFirst[0].experiment_surface !== 'pricing_trial') {
  throw new Error('EXPOSURE_METADATA_INVALID');
}

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(700);
await page.locator('#cat-trial').scrollIntoViewIfNeeded();
await page.waitForTimeout(2500);

const afterReturn = await page.evaluate(() =>
  (window.dataLayer || []).filter(x => x && x.event === 'section_view' && x.section_id === 'pricing_trial').length
);
if (afterReturn !== 1) throw new Error('EXPOSURE_DUPLICATED');

const exact = analytics.filter(x => x.tid === expectedId);
const pageViews = exact.filter(x => x.event === 'page_view');
const sectionViews = exact.filter(x => x.event === 'section_view');
const trialViews = sectionViews.filter(x => x.section_id === 'pricing_trial');

const debugEvidence = {
  capturedAt: new Date().toISOString(),
  exactGa4Requests: exact,
  sectionViews,
  dataLayerEvents: await page.evaluate(() => (window.dataLayer || []).filter(x =>
    x && typeof x === 'object' && ['page_view','section_view'].includes(x.event)
  ))
};
fs.writeFileSync(
  'control-capture-production-acceptance.json',
  JSON.stringify(debugEvidence, null, 2) + '\n'
);
console.log('CONTROL_CAPTURE_DEBUG_EVIDENCE');
console.log(JSON.stringify(debugEvidence, null, 2));
if (pageViews.length !== 1) throw new Error(`PAGE_VIEW_COUNT_${pageViews.length}`);
if (trialViews.length !== 1) {
  throw new Error(`GA4_SECTION_VIEW_COUNT_${trialViews.length}`);
}

const reserve = await page.locator('#cat-trial a[data-track="reserve_click"][data-placement="pricing_trial"]').evaluate(a => ({
  href: a.href,
  placement: a.dataset.placement,
  label: a.textContent.trim()
}));
if (!reserve.href.includes('cl.gyms.jp/') ||
    !reserve.href.includes('utm_content=pricing_trial') ||
    reserve.placement !== 'pricing_trial') {
  throw new Error('RESERVE_CONTRACT_CHANGED');
}

const result = {
  acceptedAt: new Date().toISOString(),
  productionUrl: base,
  httpStatus: response.status(),
  pageViewCount: pageViews.length,
  pricingTrialSectionViewCount: trialViews.length,
  dataLayerPricingTrialCount: afterReturn,
  metadata: {
    trackSection: metadata.trackSection,
    experimentId: metadata.experimentId,
    variant: metadata.variant,
    surface: metadata.surface
  },
  reserveContract: reserve,
  ga4SectionView: trialViews[0],
  experimentExposureEventObserved: exact.some(x => x.event === 'experiment_exposure')
};

if (result.experimentExposureEventObserved) {
  throw new Error('UNEXPECTED_EXPERIMENT_EXPOSURE_EVENT');
}

fs.writeFileSync(
  'control-capture-production-acceptance.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log('CONTROL_CAPTURE_PRODUCTION_ACCEPTANCE');
console.log(JSON.stringify(result, null, 2));

await context.close();
await browser.close();
