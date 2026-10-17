import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { blockQaAnalytics } from '../../scripts/qa-block-analytics.mjs';

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

const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {});
const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
const isolation = await blockQaAnalytics(context);
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
const hasFaqOpener = (await faq.count()) > 0;
if (hasFaqOpener) {
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
// TOP v7's approved FAQ is always visible. Verify that contract explicitly;
// exercise the retained accordion event handler in an isolated browser fixture.
let faqFixture = null;
if (!hasFaqOpener) {
  const faqItems = page.locator('#questions [data-faq-id][data-faq-topic]');
  assert.equal(await faqItems.count(), 6, 'approved TOP v7 FAQ has six visible answers');
  for (const item of await faqItems.all()) {
    assert.ok(await item.locator('h3').isVisible());
    assert.ok((await item.locator('p').innerText()).trim().length > 0);
    assert.ok(await item.locator('p').isVisible());
  }
  assert.ok(!names.includes('faq_open'), 'always-visible FAQ must not invent open events');
  await context.route(BASE + '/__qa_faq_fixture', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><html lang="ja"><body><main><div class="faq-item"><button class="faq-q" data-faq-id="qa-contract" data-faq-topic="qa-contract">Question</button><div class="faq-a">Answer</div></div></main><script src="/assets/js/main.js"></script></body></html>'}));
  const fixture = await context.newPage();
  await fixture.goto(BASE + '/__qa_faq_fixture', {waitUntil: 'load'});
  const button = fixture.locator('.faq-q');
  await button.click();
  assert.equal(await button.getAttribute('aria-expanded'), 'true');
  const events = await fixture.evaluate(() => (window.dataLayer || []).filter(x => x.event === 'faq_open'));
  assert.equal(events.length, 1, 'one actual open generates one event');
  assert.equal(events[0].faq_id, 'qa-contract');
  assert.equal(events[0].faq_topic, 'qa-contract');
  for (const key of ['event_version', 'site_version', 'page_path', 'page_type']) assert.ok(events[0][key], key);
  await button.click();
  assert.equal(await fixture.evaluate(() => (window.dataLayer || []).filter(x => x.event === 'faq_open').length), 1, 'closing must not generate an open');
  faqFixture = {status: 'PASS', source: 'isolated fixture using the real shared main.js; not a production TOP event', event: events[0]};
  await fixture.close();
}
const required = ['section_view', 'faq_open', 'reserve_click'];
const missing = required.filter(x => x === 'faq_open' && faqFixture?.status === 'PASS' ? false : !names.includes(x));
const malformed = layer.filter(x =>
  ['section_view','faq_open','reserve_click'].includes(x.event) &&
  (!x.event_version || !x.site_version || !x.page_path || !x.page_type)
);

const ids = [...new Set(gtmContainerBody.match(/G-[A-Z0-9]{6,}/g) || [])];
const result = {
  isolation,
  faqFixture,
  faqRendering: hasFaqOpener ? 'accordion' : 'approved TOP v7 static answers; no synthetic open event',
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
