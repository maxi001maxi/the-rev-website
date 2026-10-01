import assert from 'node:assert/strict';
import fs from 'node:fs';

const required = [
  'admin/google-business/index.html',
  'admin/js/google-business.mjs',
  'admin/css/admin.css'
];
for (const file of required) {
  assert.ok(fs.statSync(new URL(`../dist/${file}`, import.meta.url), { throwIfNoEntry: false })?.isFile(), `Missing dist/${file}`);
}

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const rewrites = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));
for (const route of ['/admin/google-business', '/admin/google-business/']) {
  assert.equal(rewrites.get(route), '/admin/google-business/index.html', `${route} must route to the shipped HTML`);
}
assert.equal(rewrites.get('/api/admin/google-business/callback'), '/api/admin/google-business?action=callback');
console.log('[static-delivery] Google Business artifacts and routing contract verified');
