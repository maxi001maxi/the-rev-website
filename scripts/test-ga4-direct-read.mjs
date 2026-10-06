import assert from 'node:assert/strict';
import { normalizeGa4Date } from '../lib/ga4CompanyOsSync.mjs';

assert.equal(normalizeGa4Date('20261006'), '2026-10-06');
assert.throws(() => normalizeGa4Date('2026-10-06'), /GA4_INVALID_DATE_DIMENSION/);

const api = await import('node:fs').then(fs => fs.readFileSync(new URL('../api/admin/analytics.mjs', import.meta.url), 'utf8'));
assert.match(api, /google-analytics-data-api-direct/);
assert.match(api, /GA4_PROPERTY_ID/);
assert.match(api, /GA4_SERVICE_ACCOUNT_JSON/);
assert.doesNotMatch(api, /GSC_WIZARD_API_KEY/);
assert.doesNotMatch(api, /siteInsights\/providers\/ga4/);

const cron = await import('node:fs').then(fs => fs.readFileSync(new URL('../api/cron/ga4-company-os-sync.mjs', import.meta.url), 'utf8'));
assert.match(cron, /company_os_ga4_daily_metrics/);
assert.match(cron, /CRON_SECRET/);
assert.match(cron, /GA4_SERVICE_ACCOUNT_JSON/);

console.log('GA4 direct read-side static contract PASS');
