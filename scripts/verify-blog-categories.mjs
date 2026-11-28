// THE REV. COLUMN Category Architecture v1.0 — 配布前後のカテゴリー検証
//   node scripts/verify-blog-categories.mjs dist [distDir]
//   node scripts/verify-blog-categories.mjs live <baseUrl>
// dist: 本番切替前に dist/ を content/blog と突合する。
// live: キャッシュバスターなしの通常訪問者URLで本番を検証する（最大12回・10秒間隔で再試行）。
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { BLOG_CATEGORIES, getBlogCategory, isBlogCategory } from '../assets/js/blog-taxonomy.mjs';

const mode = process.argv[2];
const arg = process.argv[3];
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const rows = [];
const errors = [];

function ok(label, detail = '') { rows.push(`| ${label} | ✅ ${detail} |`); }
function ng(label, detail) { rows.push(`| ${label} | ❌ ${detail} |`); errors.push(`${label}: ${detail}`); }
function assertThat(cond, label, detailOk, detailNg) { cond ? ok(label, detailOk) : ng(label, detailNg); }

function loadSource() {
  const dir = 'content/blog';
  const all = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { slug: String(data.slug || path.basename(f, '.md')).trim(), category: data.category, status: String(data.status || 'draft'), canonical: data.canonical };
  });
  for (const a of all) {
    if (!isBlogCategory(a.category)) errors.push(`source ${a.slug}: invalid category ${a.category}`);
  }
  return {
    published: all.filter(a => a.status === 'published'),
    drafts: all.filter(a => a.status !== 'published')
  };
}

function cardSlugs(html) {
  return [...html.matchAll(/data-article-slug="([^"]+)"/g)].map(m => m[1]);
}

// 1つのHTMLコーパス（ページ群）に対する共通検証
function verifyCorpus(label, pages, source) {
  const { published, drafts } = source;
  const top = pages.top;
  const seen = new Map();
  for (const c of BLOG_CATEGORIES) {
    const expected = published.filter(a => a.category === c.slug).map(a => a.slug).sort();
    const html = pages.category[c.slug];
    const cards = html ? cardSlugs(html) : [];
    assertThat(!!html, `${label} category page: ${c.slug}`, 'exists', 'missing');
    if (!html) continue;
    assertThat(top.includes(`href="/blog/category/${c.slug}/"`), `${label} Blog TOP link: ${c.slug}`, 'present', 'missing');
    const n = expected.length;
    assertThat(top.includes(`data-category-slug="${c.slug}"`) && top.includes(`${n} ${n === 1 ? 'ARTICLE' : 'ARTICLES'}`),
      `${label} Blog TOP count: ${c.slug}`, `${n}`, `expected ${n}`);
    // 複数ページに跨る場合はpage 2以降も含める
    const all = [...cards, ...(pages.categoryExtra[c.slug] || [])];
    assertThat(JSON.stringify([...all].sort()) === JSON.stringify(expected), `${label} category corpus: ${c.slug}`, `${n} articles`, `got [${all.join(',')}] expected [${expected.join(',')}]`);
    all.forEach(s => seen.set(s, (seen.get(s) || 0) + 1));
    for (const d of drafts) if (all.includes(d.slug)) ng(`${label} draft hidden: ${d.slug}`, `listed in ${c.slug}`);
  }
  const dupes = [...seen].filter(([, n]) => n !== 1);
  assertThat(seen.size === published.length && dupes.length === 0, `${label} one category per article`, `${seen.size}/${published.length}`, `seen ${seen.size}/${published.length}, dupes ${dupes.map(d => d[0]).join(',')}`);
}

function checkSitemap(label, xml, source) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const c of BLOG_CATEGORIES) {
    const has = source.published.some(a => a.category === c.slug);
    assertThat(locs.some(l => l.endsWith(`/blog/category/${c.slug}/`)) === has, `${label} sitemap category: ${c.slug}`, 'ok', 'mismatch');
  }
  assertThat(!locs.some(l => /\/blog\/category\/[^/]+\/page\/\d+\//.test(l)), `${label} sitemap pagination excluded`, 'ok', 'pagination URL present');
  for (const d of source.drafts) assertThat(!locs.some(l => l.includes(`/blog/${d.slug}/`)), `${label} sitemap draft: ${d.slug}`, 'absent', 'present');
}

function checkLegacy(label, htmlMap) {
  const bad = Object.entries(htmlMap).filter(([, h]) => /BODY KNOWLEDGE|body-knowledge/.test(h)).map(([k]) => k);
  assertThat(bad.length === 0, `${label} no legacy BODY KNOWLEDGE`, 'none', bad.join(','));
}

async function runDist() {
  const dist = arg || 'dist';
  const source = loadSource();
  const read = p => fs.readFileSync(path.join(dist, p), 'utf8');
  const pages = { top: read('blog/index.html'), category: {}, categoryExtra: {} };
  const legacy = { 'blog/index.html': pages.top };
  for (const c of BLOG_CATEGORIES) {
    const base = `blog/category/${c.slug}`;
    if (fs.existsSync(path.join(dist, base, 'index.html'))) {
      pages.category[c.slug] = read(`${base}/index.html`);
      legacy[`${base}/index.html`] = pages.category[c.slug];
      const extraDir = path.join(dist, base, 'page');
      pages.categoryExtra[c.slug] = fs.existsSync(extraDir)
        ? fs.readdirSync(extraDir).flatMap(n => cardSlugs(read(`${base}/page/${n}/index.html`)))
        : [];
    }
  }
  verifyCorpus('dist', pages, source);
  for (const a of source.published) {
    const html = read(`blog/${a.slug}/index.html`);
    legacy[`blog/${a.slug}/index.html`] = html;
    assertThat(html.includes(`href="/blog/category/${a.category}/"`), `dist article category link: ${a.slug}`, a.category, 'missing');
    const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1])).find(j => j['@type'] === 'BreadcrumbList');
    assertThat(ld?.itemListElement?.[2]?.name === getBlogCategory(a.category).labelJa, `dist article breadcrumb: ${a.slug}`, 'category included', 'category missing');
  }
  checkLegacy('dist', legacy);
  checkSitemap('dist', read('sitemap.xml'), source);
}

async function get(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'rev-category-acceptance/1.0' } });
  return { status: res.status, cache: res.headers.get('cache-control') || '', text: await res.text() };
}

async function runLive() {
  const base = String(arg || '').replace(/\/+$/, '');
  if (!base) throw new Error('baseUrl required');
  const source = loadSource();
  const pages = { top: '', category: {}, categoryExtra: {} };
  const legacy = {};
  const fetchPlain = async (label, p) => {
    const r = await get(`${base}${p}`);
    assertThat(r.status === 200, `live ${label} HTTP`, '200', String(r.status));
    return r;
  };
  const top = await fetchPlain('/blog/', '/blog/');
  pages.top = top.text; legacy['/blog/'] = top.text;
  assertThat(/no-store|no-cache|max-age=0/.test(top.cache), 'live /blog/ Cache-Control', top.cache, top.cache || 'missing');
  for (const c of BLOG_CATEGORIES) {
    const r = await fetchPlain(`/blog/category/${c.slug}/`, `/blog/category/${c.slug}/`);
    pages.category[c.slug] = r.text; legacy[`/blog/category/${c.slug}/`] = r.text;
    const expectedCount = source.published.filter(a => a.category === c.slug).length;
    pages.categoryExtra[c.slug] = [];
    for (let p = 2; p <= Math.ceil(expectedCount / 12); p += 1) {
      const pr = await fetchPlain(`${c.slug} page ${p}`, `/blog/category/${c.slug}/page/${p}/`);
      pages.categoryExtra[c.slug].push(...cardSlugs(pr.text));
    }
    assertThat(r.text.includes(`<link rel="canonical" href="${base.replace(/^https?:\/\/[^/]+/, 'https://therev-lab.com')}/blog/category/${c.slug}/">`) || r.text.includes(`/blog/category/${c.slug}/">`),
      `live ${c.slug} canonical`, 'ok', 'missing');
    assertThat(r.text.includes(`<title>${c.labelJa}の記事｜THE REV. CONDITIONING LAB.</title>`), `live ${c.slug} title`, 'ok', 'mismatch');
    assertThat(r.text.includes(c.description), `live ${c.slug} description`, 'ok', 'mismatch');
  }
  verifyCorpus('live', pages, source);
  for (const a of source.published) {
    const r = await fetchPlain(`article ${a.slug}`, `/blog/${a.slug}/`);
    legacy[`/blog/${a.slug}/`] = r.text;
    assertThat(r.text.includes(`href="/blog/category/${a.category}/"`), `live article category link: ${a.slug}`, a.category, 'missing');
    const ld = [...r.text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1])).find(j => j['@type'] === 'BreadcrumbList');
    assertThat(ld?.itemListElement?.[2]?.name === getBlogCategory(a.category).labelJa, `live article breadcrumb: ${a.slug}`, 'category included', 'category missing');
    assertThat(a.canonical == null || r.text.includes(`<link rel="canonical" href="${a.canonical}">`), `live article canonical: ${a.slug}`, 'unchanged', 'changed');
  }
  for (const d of source.drafts) {
    const r = await get(`${base}/blog/${d.slug}/`);
    assertThat(r.status !== 200, `live draft URL: ${d.slug}`, `HTTP ${r.status}`, 'HTTP 200');
  }
  checkLegacy('live', legacy);
  checkSitemap('live', (await fetchPlain('/sitemap.xml', '/sitemap.xml')).text, source);
}

function flush() {
  const body = `\n### Blog category verification (${mode})\n\n| Check | Result |\n|---|---|\n${rows.join('\n')}\n`;
  if (summaryPath) fs.appendFileSync(summaryPath, body);
  else console.log(body);
}

async function main() {
  if (mode === 'dist') await runDist();
  else if (mode === 'live') {
    const attempts = Number(process.env.CATEGORY_VERIFY_ATTEMPTS || 12);
    for (let i = 1; i <= attempts; i += 1) {
      rows.length = 0; errors.length = 0;
      try { await runLive(); } catch (e) { ng('live run', String(e.message || e)); }
      if (!errors.length) break;
      if (i < attempts) { console.log(`Category live verification attempt ${i}/${attempts} failed (${errors.length}); retrying in 10s`); await new Promise(r => setTimeout(r, 10000)); }
    }
  } else { console.error('usage: verify-blog-categories.mjs dist|live'); process.exit(2); }
  flush();
  if (errors.length) { for (const e of errors.slice(0, 40)) console.error(`::error::${e}`); process.exit(1); }
  console.log(`Blog category verification (${mode}) OK — ${rows.length} checks`);
}
main().catch(e => { console.error(e); process.exit(1); });
