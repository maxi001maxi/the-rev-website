import assert from 'node:assert/strict';
import test from 'node:test';
import { previewAdminBypassEnabled, previewAdminUserId } from '../lib/previewAdminBypass.mjs';
import { getAuthedContext } from '../lib/supabaseAdmin.mjs';
import config from '../api/config.mjs';
import analytics from '../api/admin/analytics.mjs';
import googleBusiness from '../api/admin/google-business.mjs';

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('Preview bypass requires both exact environment conditions and an explicit endpoint opt-in', async () => {
  const keys = ['VERCEL_ENV', 'ADMIN_AUTH_BYPASS_PREVIEW', 'ADMIN_AUTH_BYPASS_PREVIEW_USER_ID',
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'GSC_WIZARD_API_KEY'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
    process.env.GSC_WIZARD_API_KEY = '';
    const req = { method: 'GET', headers: {}, query: {} };

    for (const [vercelEnv, flag] of [['production', 'true'], ['preview', 'TRUE'], ['preview', 'false']]) {
      process.env.VERCEL_ENV = vercelEnv;
      process.env.ADMIN_AUTH_BYPASS_PREVIEW = flag;
      assert.equal(previewAdminBypassEnabled(), false);
      assert.equal((await getAuthedContext(req, { allowPreviewBypass: true })).status, 401);
      const analyticsResponse = response();
      await analytics(req, analyticsResponse);
      assert.equal(analyticsResponse.statusCode, 401);
      const businessResponse = response();
      await googleBusiness({ ...req, query: { action: 'status' } }, businessResponse);
      assert.equal(businessResponse.statusCode, 401);
      const r = response();
      config(req, r);
      assert.equal(r.body.previewAdminBypass, false);
    }

    process.env.VERCEL_ENV = 'preview';
    process.env.ADMIN_AUTH_BYPASS_PREVIEW = 'true';
    assert.equal(previewAdminBypassEnabled(), true);
    assert.equal((await getAuthedContext(req)).status, 401, 'other Admin APIs still require Auth');
    assert.equal((await getAuthedContext(req, { allowPreviewBypass: true })).previewBypass, true);
    const configResponse = response();
    config(req, configResponse);
    assert.equal(configResponse.body.previewAdminBypass, true);

    const analyticsResponse = response();
    await analytics(req, analyticsResponse);
    assert.equal(analyticsResponse.statusCode, 503);
    assert.equal(analyticsResponse.body.error, 'analytics_not_configured');

    const businessResponse = response();
    await googleBusiness({ ...req, query: { action: 'status' } }, businessResponse);
    assert.equal(businessResponse.statusCode, 503);
    assert.equal(businessResponse.body.error, 'preview_admin_identity_not_configured');
    assert.equal(previewAdminUserId(), null);
    process.env.ADMIN_AUTH_BYPASS_PREVIEW_USER_ID = 'not-a-user-id';
    assert.equal(previewAdminUserId(), null);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
