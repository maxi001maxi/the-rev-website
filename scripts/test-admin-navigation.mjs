import test from 'node:test';
import assert from 'node:assert/strict';
import { adminReturnTo, loginUrlFor } from '../admin/js/admin-navigation.mjs';

const origin = 'https://preview.example.com';

test('protected Admin URL survives login and keeps its query and fragment', () => {
  const location = new URL('/admin/google-business/?status=connected#details', origin);
  const loginUrl = new URL(loginUrlFor(location), origin);
  assert.equal(loginUrl.pathname, '/admin/login/');
  assert.equal(adminReturnTo(loginUrl.searchParams.get('next'), origin), '/admin/google-business/?status=connected#details');
});

test('ordinary login and unsafe destinations fall back to Admin home', () => {
  for (const destination of [null, '', '//evil.example/admin/', 'https://evil.example/admin/', '/admin/../outside', '/admin/login/', '/admin/login', '/admin/\\evil.example']) {
    assert.equal(adminReturnTo(destination, origin), '/admin/', String(destination));
  }
  assert.equal(adminReturnTo('/admin/analytics/', origin), '/admin/analytics/');
});
