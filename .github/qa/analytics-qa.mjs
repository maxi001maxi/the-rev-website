import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const EXPECTED_GA4_ID = process.env.GA4_MEASUREMENT_ID || 'G-Q6ZSSJMEZ2';
if (!BASE) {
  console.error('BASE_URL is required');
  process.exit(2);
}

const gaRequests = [];
const gtmRequests = [];
const googleTagRequests = [];
const consoleErrors = [];
let gtmContainerBody = '';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
const page = await context.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
});
page.on('request', req => {
  const url = req.url();
  if (url.includes('googletagmanager.com/gtm.js')) gtmRequests.push(url);
  if (url.includes('googletagmanager.com/gtag/js')) googleTagRequests.push(url);
  if (/google-analytics\.com\/(?:g\/)?collect|googletagmanager\.com\/g\/collect/.test(url)) {
    const u = new URL(url);
    gaRequests.push({
      event: u.searchParams.get('en'),
      measurement_id: u.searchParams.get('tid'),
      page_location: u.searchParams.get('dl')
    });
  }
});
page.on('response', async resp => {
  if (!resp.url().includes('googletagmanager.com/gtm.js')) return;
  try { gtmContainerBody = await resp.text(); } catch {}
});

const response = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2200);

// section_view
await page.evaluate(() => new Promise(resolve => {
  let y = 0;
  const step = 520;
  const timer = setInterval(() => {
    window.scrollTo(0, y += step);
    if (y >= document.documentElement.scrollHeight - innerHeight) {
      clearInterval(timer);
      resolve();
    }
  }, 80);
}));
await page.waitForTimeout(800);

// faq_open
const faq = page.locator('.faq-q').first();
if (await faq.count()) {
  await faq.click();
  await page.waitForTimeout(400);
}

// reserve_click without navigation
await page.evaluate(() => {
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a');
    if (a && /^https?:/.test(a.href)) e.preventDefault();
  }, true);
});
await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[data-track="reserve_click"]')];
  const link = links.find(a => a.offsetParent !== null) || links[0];
  if (link) link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
});
await page.waitForTimeout(600);

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

const names = layer.map(x => x.event);
const required = ['section_view', 'faq_open', 'reserve_click'];
const missing = required.filter(x => !names.includes(x));
const malformed = layer.filter(x =>
  ['section_view','faq_open','reserve_click'].includes(x.event) &&
  (!x.event_version || !x.site_version || !x.page_path || !x.page_type)
);

const ids = [...new Set(gtmContainerBody.match(/G-[A-Z0-9]{6,}/g) || [])];
const result = {
  target: BASE,
  http_status: response?.status() || null,
  expected_ga4_id: EXPECTED_GA4_ID,
  gtm_loaded: gtmRequests.length > 0,
  google_tag_script_requests: googleTagRequests,
  gtm_container_ga4_ids: ids,
  expected_ga4_id_in_container: ids.includes(EXPECTED_GA4_ID),
  data_layer_events: layer,
  missing_runtime_events: missing,
  malformed_runtime_events: malformed,
  ga4_requests: gaRequests,
  console_errors_sample: [...new Set(consoleErrors)].slice(0, 10)
};

fs.writeFileSync('analytics-runtime-qa.json', JSON.stringify(result, null, 2) + '\n');

console.log(JSON.stringify({
  http_status: result.http_status,
  gtm_loaded: result.gtm_loaded,
  expected_ga4_id: EXPECTED_GA4_ID,
  expected_ga4_id_in_container: result.expected_ga4_id_in_container,
  data_layer_event_names: [...new Set(names)],
  missing_runtime_events: missing,
  malformed_runtime_events: malformed,
  ga4_requests: gaRequests
}, null, 2));

if (
  result.http_status !== 200 ||
  !result.gtm_loaded ||
  missing.length ||
  malformed.length
) {
  process.exitCode = 1;
}

await browser.close();
