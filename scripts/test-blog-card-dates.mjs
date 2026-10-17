// verify-blog-card-dates.mjs のfixture test。実行: npm run test:blog-card-dates
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { verifyCardDate, parseExpectations } from './verify-blog-card-dates.mjs';

const card = (slug, date) => `<article class="blog-card">
<a class="blog-card-link" href="/blog/${slug}/" data-track="article_click" data-placement="blog_index" data-article-slug="${slug}">
<div class="blog-card-body"><time class="blog-card-date" datetime="2026-09-15T00:00:00+09:00">${date}</time></div>
</a>
</article>`;
const SLUG = 'after-work-tired-strength-training';

test('matching date passes', () => {
  assert.equal(verifyCardDate(card(SLUG, '2026.09.15'), SLUG, '2026.09.15').ok, true);
});
test('different date fails', () => {
  const r = verifyCardDate(card(SLUG, '2026.09.14'), SLUG, '2026.09.15');
  assert.equal(r.ok, false); assert.equal(r.reason, 'date-mismatch'); assert.equal(r.actual, '2026.09.14');
});
test('missing slug fails', () => {
  assert.equal(verifyCardDate(card('other-article', '2026.09.15'), SLUG, '2026.09.15').reason, 'slug-missing');
});
test('invalid HTML fails', () => {
  assert.equal(verifyCardDate(`<article class="blog-card"><a data-article-slug="${SLUG}">`, SLUG, '2026.09.15').ok, false);
  assert.equal(verifyCardDate(`data-article-slug="${SLUG}"</article>`, SLUG, '2026.09.15').ok, false);
  assert.equal(verifyCardDate(`<article class="blog-card"><a data-article-slug="${SLUG}"></a></article>`, SLUG, '2026.09.15').reason, 'date-missing');
  assert.equal(verifyCardDate('', SLUG, '2026.09.15').ok, false);
});
test('neighbouring card dates are not confused', () => {
  const html = card('a-1', '2026.01.01') + card(SLUG, '2026.09.15');
  assert.equal(verifyCardDate(html, SLUG, '2026.09.15').ok, true);
  assert.equal(verifyCardDate(html, 'a-1', '2026.09.15').ok, false);
});
test('CLI exit codes (success, mismatch, empty expectations)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-dates-'));
  const html = path.join(tmp, 'c.html'); const exp = path.join(tmp, 'e.txt');
  fs.writeFileSync(html, card(SLUG, '2026.09.15'));
  const run = () => spawnSync('node', ['scripts/verify-blog-card-dates.mjs', html, exp], { encoding: 'utf8' });
  fs.writeFileSync(exp, `${SLUG}|2026.09.15\n`); assert.equal(run().status, 0);
  fs.writeFileSync(exp, `${SLUG}|2026.09.16\n`); assert.equal(run().status, 1);
  fs.writeFileSync(exp, ''); assert.equal(run().status, 1);
  assert.deepEqual(parseExpectations(`${SLUG}|2026.09.15\n\n`), [{ slug: SLUG, date: '2026.09.15' }]);
  fs.rmSync(tmp, { recursive: true, force: true });
});
test('real generated Blog index satisfies every published expectation', () => {
  execFileSync('node', ['scripts/build-blog.mjs'], { stdio: 'pipe' });
  const dir = 'content/blog';
  const exp = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = raw.split('\n---\n')[0];
    const get = k => (fm.match(new RegExp(`^${k}:\\s*"?([^"\\n]+)"?\\s*$`, 'm')) || [])[1];
    if (get('status') === 'published') exp.push(`${get('slug')}|${get('published').replaceAll('-', '.')}`);
  }
  assert.ok(exp.length >= 18);
  let corpus = fs.readFileSync('blog/index.html', 'utf8');
  const pageDir = 'blog/page';
  if (fs.existsSync(pageDir)) for (const n of fs.readdirSync(pageDir)) corpus += fs.readFileSync(path.join(pageDir, n, 'index.html'), 'utf8');
  for (const e of parseExpectations(exp.join('\n'))) assert.equal(verifyCardDate(corpus, e.slug, e.date).ok, true, e.slug);
});
test('workflow calls the script and has no inline node -e card-date regex', () => {
  const wf = fs.readFileSync('.github/workflows/deploy-xserver.yml', 'utf8');
  assert.ok(wf.includes('node scripts/verify-blog-card-dates.mjs'));
  assert.ok(!/node -e '[^\n]*blog-card-date/.test(wf));
});
