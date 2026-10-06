// THE REV. COLUMN Category Architecture v1.0 — regression tests
// 実行: npm run test:blog-taxonomy
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import {
  BLOG_CATEGORIES, BLOG_CATEGORY_SLUGS, getBlogCategory, categoryLabelFor, isBlogCategory
} from '../assets/js/blog-taxonomy.mjs';
import { validateBridgeEnvelope, ALLOWED_CATEGORIES } from '../lib/editorialBridge.mjs';
import { CATEGORIES as ADMIN_CATEGORIES } from '../lib/supabaseAdmin.mjs';
import { validateDraftForPublish } from '../lib/blogMarkdown.mjs';
import { selectBrandImageSourceDecision } from '../lib/editorialImage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://therev-lab.com';

const SPEC = {
  training: ['beginner-strength-training-few-exercises-frequency', 'muscle-mass-not-increasing-progress-signs', 'strength-training-to-failure-when-to-stop', 'training-how-hard-to-push'],
  health: ['after-work-tired-strength-training', 'health-check-results-before-starting-exercise', 'kenshin-ketsuatsu-takame-kinntore-hajimekata'],
  'gym-guide': ['exercise-start-fatigue-anxiety-next-day-plan', 'no-time-for-gym-starting-friction', 'personal-gym-trial-checkpoints', 'personal-training-frequency', 'shinomiya-gym-erabikata-dosen', 'shinomiya-personal-gym-reservation-facility-the-rev'],
  recovery: ['oxygen-room-what-is-it', 'oxygen-room-how-to-spend-time', 'denba-health-what-is-it-the-rev', 'denba-electric-potential-space-radio-wave-difference'],
  boxing: ['boxing-beginner-first-step']
};

function loadSource(dir = path.join(ROOT, 'content/blog')) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { file: f, ...data };
  });
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 本番ビルド（リポジトリ直下）を生成してから検証する
execFileSync('node', ['scripts/build-blog.mjs'], { cwd: ROOT, stdio: 'pipe' });
const source = loadSource();
const published = source.filter(a => a.status === 'published');

test('A-C. exactly five unique categories in taxonomy order', () => {
  assert.equal(BLOG_CATEGORIES.length, 5);
  assert.deepEqual(BLOG_CATEGORY_SLUGS, ['training', 'health', 'gym-guide', 'recovery', 'boxing']);
  assert.equal(new Set(BLOG_CATEGORY_SLUGS).size, 5);
  BLOG_CATEGORIES.forEach((c, i) => {
    assert.equal(c.order, i + 1);
    for (const k of ['slug', 'labelJa', 'labelEn', 'description']) assert.ok(c[k], `${c.slug}.${k}`);
  });
  assert.equal(categoryLabelFor('gym-guide'), 'GYM GUIDE');
});

test('D-E. body-knowledge and unknown categories are rejected', () => {
  assert.equal(isBlogCategory('body-knowledge'), false);
  assert.equal(isBlogCategory('lifestyle'), false);
  assert.equal(getBlogCategory('body-knowledge'), null);
  const base = { content_id: 'x', week_start: '2026-10-06', editorial_status: 'READY', fact_check_status: 'PASS', topic_gate_decision: 'PUBLISH' };
  for (const bad of ['body-knowledge', 'lifestyle', 'health-care', '']) {
    assert.ok(validateBridgeEnvelope({ ...base, category: bad }).errors.some(e => e.includes('category')), bad);
  }
  assert.ok(validateBlogDraftErrors('body-knowledge').some(e => e.includes('Category')));
});

function validateBlogDraftErrors(category) {
  return validateDraftForPublish({ title: 't', slug: 's', description: 'd', category });
}

test('F-H. published/draft migration matches the specification', () => {
  assert.equal(published.length, 18);
  const expected = new Map(Object.entries(SPEC).flatMap(([c, slugs]) => slugs.map(s => [s, c])));
  assert.equal(expected.size, 18);
  for (const a of published) {
    assert.equal(a.category, expected.get(a.slug), a.slug);
    assert.equal(a.category_label, getBlogCategory(a.category).labelEn, `${a.slug} category_label`);
  }
  const draft = source.find(a => a.slug === 'self-training-form-check');
  assert.equal(draft.status, 'draft');
  assert.equal(draft.category, 'training');
  assert.equal(source.length - published.length, 1);
  for (const [c, slugs] of Object.entries(SPEC)) {
    assert.equal(published.filter(a => a.category === c).length, slugs.length, c);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(SPEC).map(([c, s]) => [c, s.length])),
    { training: 4, health: 3, 'gym-guide': 6, recovery: 4, boxing: 1 });
});

test('I-M,O. category pages are generated, exclusive and exhaustive', () => {
  const seen = new Map();
  for (const c of BLOG_CATEGORY_SLUGS) {
    const html = read(`blog/category/${c}/index.html`);
    const cards = [...html.matchAll(/data-article-slug="([^"]+)"/g)].map(m => m[1]);
    const expected = published.filter(a => a.category === c).map(a => a.slug).sort();
    assert.deepEqual([...cards].sort(), expected, c);
    cards.forEach(s => seen.set(s, (seen.get(s) || 0) + 1));
    assert.ok(!cards.includes('self-training-form-check'));
  }
  assert.equal(seen.size, 18);
  assert.ok([...seen.values()].every(n => n === 1));
  for (const a of published) assert.ok(fs.existsSync(path.join(ROOT, `blog/${a.slug}/index.html`)), a.slug);
  assert.ok(!fs.existsSync(path.join(ROOT, 'blog/self-training-form-check')));
});

test('P-Q. article category link and Breadcrumb JSON-LD', () => {
  for (const a of published) {
    const html = read(`blog/${a.slug}/index.html`);
    assert.ok(html.includes(`<a class="blog-category-link" href="/blog/category/${a.category}/">${getBlogCategory(a.category).labelEn}</a>`), a.slug);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)]
      .map(m => JSON.parse(m[1])).find(j => j['@type'] === 'BreadcrumbList');
    assert.deepEqual(ld.itemListElement.map(i => i.name),
      ['Home', 'Column', getBlogCategory(a.category).labelJa, a.title], a.slug);
    assert.equal(ld.itemListElement[2].item, `${SITE}/blog/category/${a.category}/`);
    // 既存記事のcanonicalは変更しない（1記事は相対canonicalのまま）。
    assert.equal(ld.itemListElement[3].item, a.canonical || `${SITE}/blog/${a.slug}/`);
    assert.ok(!html.includes('BODY KNOWLEDGE'));
    assert.ok(html.includes(`<link rel="canonical" href="${a.canonical || `${SITE}/blog/${a.slug}/`}">`));
  }
});

test('R. category canonical / title / description / breadcrumb / OG', () => {
  for (const c of BLOG_CATEGORIES) {
    const html = read(`blog/category/${c.slug}/index.html`);
    assert.ok(html.includes(`<title>${c.labelJa}の記事｜THE REV. CONDITIONING LAB.</title>`));
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}/blog/category/${c.slug}/">`));
    assert.ok(html.includes(`<meta name="description" content="${c.description}THE REV. CONDITIONING LAB.のコラムです。">`));
    assert.ok(html.includes('/assets/images/blog/og/og-default.jpg'));
    assert.ok(!html.includes('name="robots"'), 'indexable');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.deepEqual(ld.itemListElement.map(i => i.name), ['Home', 'Column', c.labelJa]);
    const nav = html.match(/<nav class="blog-cat-nav"[\s\S]*?<\/nav>/)[0];
    assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
    assert.ok(html.includes(`href="/blog/category/${c.slug}/" aria-current="page"`));
    assert.ok(html.includes('data-placement="category_index"'));
    assert.ok(html.includes('data-track="category_nav_click"'));
  }
  const top = read('blog/index.html');
  for (const c of BLOG_CATEGORIES) {
    const n = published.filter(a => a.category === c.slug).length;
    assert.ok(top.includes(`href="/blog/category/${c.slug}/"`));
    assert.ok(top.includes(`${n} ${n === 1 ? 'ARTICLE' : 'ARTICLES'}`));
  }
  assert.ok(top.includes('data-placement="blog_index"'));
});

test('S-U. sitemap and RSS', () => {
  const xml = read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const c of BLOG_CATEGORY_SLUGS) assert.ok(locs.includes(`${SITE}/blog/category/${c}/`), c);
  assert.ok(!locs.some(l => /\/page\/\d+\//.test(l)));
  assert.ok(!locs.some(l => l.includes('self-training-form-check')));
  for (const a of published.filter(x => !x.noindex)) assert.ok(locs.includes(a.canonical || `${SITE}/blog/${a.slug}/`), a.slug);
  assert.equal(locs.length, 8 + 1 + 5 + published.filter(a => !a.noindex).length);
  const rss = read('blog/feed.xml');
  assert.ok(rss.startsWith('<?xml') && rss.includes('<rss version="2.0"') && rss.trimEnd().endsWith('</rss>'));
  assert.ok(!rss.includes('self-training-form-check'));
});

test('N,T. fixture: 13 articles paginate; zero-article category is noindex and out of sitemap', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-taxonomy-'));
  const content = path.join(tmp, 'content');
  fs.mkdirSync(content);
  for (let i = 1; i <= 13; i += 1) {
    const day = String(i).padStart(2, '0');
    fs.writeFileSync(path.join(content, `fx-${day}.md`), `---
title: "Fixture ${i}"
slug: "fx-${day}"
description: "d"
published: "2026-09-${day}"
updated: "2026-09-${day}"
category: "health"
category_label: "HEALTH"
author: "THE REV. CONDITIONING LAB."
status: "published"
---

## A
body
`);
  }
  execFileSync('node', ['scripts/build-blog.mjs'], {
    cwd: ROOT, stdio: 'pipe', env: { ...process.env, BLOG_CONTENT_DIR: content, BLOG_OUTPUT_ROOT: tmp }
  });
  const p1 = fs.readFileSync(path.join(tmp, 'blog/category/health/index.html'), 'utf8');
  const p2 = fs.readFileSync(path.join(tmp, 'blog/category/health/page/2/index.html'), 'utf8');
  assert.equal((p1.match(/class="blog-card"/g) || []).length, 12);
  assert.equal((p2.match(/class="blog-card"/g) || []).length, 1);
  assert.ok(p2.includes(`<link rel="canonical" href="${SITE}/blog/category/health/page/2/">`));
  assert.ok(p2.includes('<title>身体・健康の記事（2ページ目）｜THE REV.</title>'));
  assert.ok(p1.includes('href="/blog/category/health/page/2/"'));
  const empty = fs.readFileSync(path.join(tmp, 'blog/category/boxing/index.html'), 'utf8');
  assert.ok(empty.includes('<meta name="robots" content="noindex,follow">'));
  const xml = fs.readFileSync(path.join(tmp, 'sitemap.xml'), 'utf8');
  assert.ok(xml.includes(`${SITE}/blog/category/health/</loc>`));
  assert.ok(!xml.includes('/blog/category/boxing/'));
  assert.ok(!xml.includes('/page/2/'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('V. Admin surfaces use the shared taxonomy', () => {
  assert.deepEqual(ADMIN_CATEGORIES, BLOG_CATEGORY_SLUGS);
  for (const f of ['admin/articles/index.html', 'admin/articles/editor/index.html', 'admin/articles/review/index.html']) {
    const html = read(f);
    assert.ok(html.includes("/assets/js/blog-taxonomy.mjs"), f);
    assert.ok(!/body-knowledge|BODY KNOWLEDGE/.test(html), f);
  }
});

test('W. Editorial Bridge accepts exactly the five categories', () => {
  assert.deepEqual(ALLOWED_CATEGORIES, BLOG_CATEGORY_SLUGS);
  const base = { content_id: 'x', week_start: '2026-10-06', editorial_status: 'READY', fact_check_status: 'PASS', topic_gate_decision: 'PUBLISH' };
  for (const c of BLOG_CATEGORY_SLUGS) assert.deepEqual(validateBridgeEnvelope({ ...base, category: c }).errors, [], c);
});

test('X. image selection handles every category without legacy fallbacks', () => {
  for (const c of BLOG_CATEGORY_SLUGS) {
    const d = selectBrandImageSourceDecision({ category: c, title: 'テスト', description: '', bodyMarkdown: '' });
    assert.ok(d.path.startsWith('assets/images/'), c);
    assert.ok(!/body-knowledge/.test(d.intent), c);
  }
  assert.equal(selectBrandImageSourceDecision({ category: 'health', title: 'x' }).intent, 'health-condition-space');
  assert.equal(selectBrandImageSourceDecision({ category: 'gym-guide', title: 'x' }).intent, 'gym-guide-facility');
  const reg = JSON.parse(read('editorial/automated-image-sources.json'));
  for (const s of reg.sources) for (const c of s.categories) assert.ok(isBlogCategory(c), `${s.source_id}:${c}`);
  for (const c of BLOG_CATEGORY_SLUGS) assert.ok(reg.sources.some(s => s.categories.includes(c)), `registry covers ${c}`);
});

test('Y. analytics catalog includes category pages', async () => {
  const { PAGE_CATALOG } = await import(pathToFileURL(path.join(ROOT, 'admin/js/generated-page-catalog.mjs')).href);
  for (const c of BLOG_CATEGORIES) assert.equal(PAGE_CATALOG[`/blog/category/${c.slug}`]?.title, `${c.labelJa}の記事`);
});
