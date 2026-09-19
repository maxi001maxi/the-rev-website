import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const BYPASS = process.env.VERCEL_BYPASS_SECRET || '';
const EXPECT_E2_RUNTIME = process.env.EXPECT_E2_RUNTIME !== 'false';
if (!BASE) {
  console.error('BASE_URL is required');
  process.exit(2);
}

const gaRequests = [];
const gtmRequests = [];
const consoleErrors = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}
});
const page = await context.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
});
page.on('request', req => {
  const url = req.url();
  if (url.includes('googletagmanager.com/gtm.js')) gtmRequests.push(url);
  if (/google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/.test(url)) {
    const u = new URL(url);
    gaRequests.push({
      url: url.slice(0, 500),
      event: u.searchParams.get('en'),
      measurement_id: u.searchParams.get('tid'),
      page_location: u.searchParams.get('dl')
    });
  }
});

const response = await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(2000);

// Trigger section views by scrolling naturally through the page.
await page.evaluate(() => new Promise(resolve => {
  let y = 0;
  const step = 420;
  const t = setInterval(() => {
    window.scrollTo(0, y += step);
    if (y >= document.documentElement.scrollHeight - innerHeight) {
      clearInterval(t);
      resolve();
    }
  }, 120);
}));
await page.waitForTimeout(1500);

// Open one FAQ item.
const faq = page.locator('.faq-q').first();
if (await faq.count()) {
  await faq.click();
  await page.waitForTimeout(700);
}

// Prevent actual outbound navigation while still letting site/document listeners receive clicks.
await page.evaluate(() => {
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a');
    if (a && /^https?:/.test(a.href)) e.preventDefault();
  }, true);
});

const reserve = page.locator('a[data-track="reserve_click"]').first();
if (await reserve.count()) {
  await reserve.click();
  await page.waitForTimeout(1500);
}

const layer = await page.evaluate(() =>
  (window.dataLayer || [])
    .filter(x => x && typeof x === 'object' && x.event)
    .map(x => ({
      event: x.event,
      event_version: x.event_version || null,
      site_version: x.site_version || null,
      page_path: x.page_path || null,
      page_type: x.page_type || null,
      section_id: x.section_id || null,
      faq_id: x.faq_id || null,
      faq_topic: x.faq_topic || null,
      placement: x.placement || null,
      destination_type: x.destination_type || null
    }))
);

const customNames = layer.map(x => x.event);
const requiredDataLayer = EXPECT_E2_RUNTIME ? ['section_view', 'faq_open', 'reserve_click'] : ['reserve_click'];
const missingDataLayer = requiredDataLayer.filter(x => !customNames.includes(x));

const gaEvents = gaRequests.map(x => x.event).filter(Boolean);
const gaPageView = gaEvents.includes('page_view');
const gaReserve = gaEvents.includes('reserve_click');
const gaSection = gaEvents.includes('section_view');
const gaFaq = gaEvents.includes('faq_open');

const result = {
  target: BASE,
  expect_e2_runtime: EXPECT_E2_RUNTIME,
  http_status: response?.status() || null,
  gtm_script_requests: gtmRequests.length,
  data_layer_events: layer,
  missing_data_layer_events: missingDataLayer,
  ga4_requests: gaRequests,
  ga4_event_names: gaEvents,
  acceptance: {
    page_http_200: response?.status() === 200,
    gtm_loaded: gtmRequests.length > 0,
    e2_runtime_events_present: missingDataLayer.length === 0,
    ga4_collect_present: gaRequests.length > 0,
    ga4_page_view_present: gaPageView,
    ga4_reserve_click_forwarded: gaReserve,
    ga4_section_view_forwarded: gaSection,
    ga4_faq_open_forwarded: gaFaq
  },
  console_errors_sample: [...new Set(consoleErrors)].slice(0, 10)
};

fs.writeFileSync('analytics-qa.json', JSON.stringify(result, null, 2));

console.log('# Phase E2 Analytics Live Acceptance');
console.log('');
console.log('Target:', BASE);
console.log('HTTP:', result.http_status);
console.log('GTM script requests:', result.gtm_script_requests);
console.log('dataLayer events:', [...new Set(customNames)].join(', ') || '(none)');
console.log('GA4 events:', [...new Set(gaEvents)].join(', ') || '(none)');
console.log('');
console.log('Acceptance:', JSON.stringify(result.acceptance, null, 2));
console.log('');
if (result.console_errors_sample.length) {
  console.log('Console errors sample:');
  result.console_errors_sample.forEach(x => console.log('-', x));
}

// Runtime/dataLayer acceptance is a hard requirement.
// GA4 forwarding is reported separately because GTM container configuration is external to the repo.
if (response?.status() !== 200 || gtmRequests.length === 0 || missingDataLayer.length) {
  process.exitCode = 1;
}

await browser.close();
