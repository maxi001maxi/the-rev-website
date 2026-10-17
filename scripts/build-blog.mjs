// 2026-09-27 V2.5 Impact asset sync trigger: generated Editorial assets are mirrored by Xserver deploy.
// Phase 10.1 recovery pass 2: use staged assets and verified backup artifact.
// Phase 10.1 deploy recovery marker: safe no-op comment.
// THE REV. CONDITIONING LAB. — Blog / Column ビルドスクリプト
// /content/blog/*.md（Front Matter + Markdown）から /blog/ 配下の静的HTMLを生成する。
// 生成物（/blog/**、sitemap.xml、/blog/feed.xml）は直接編集しないこと。記事修正は /content/blog/*.md から行い、
// `npm run build:blog` を再実行する。

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import {
  BLOG_CATEGORIES,
  getBlogCategory,
  isBlogCategory,
  categoryUrlPath,
  categoryValidationMessage
} from '../assets/js/blog-taxonomy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://therev-lab.com';

// テスト用: 出力先 / 記事ソースを差し替え可能（本番ビルドでは未指定）。
const OUTPUT_ROOT = process.env.BLOG_OUTPUT_ROOT ? path.resolve(process.env.BLOG_OUTPUT_ROOT) : ROOT;
const CONTENT_DIR = process.env.BLOG_CONTENT_DIR
  ? path.resolve(process.env.BLOG_CONTENT_DIR)
  : path.join(ROOT, 'content', 'blog');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const PARTIALS_DIR = path.join(TEMPLATES_DIR, 'partials');
const OUT_DIR = path.join(OUTPUT_ROOT, 'blog');
const BLOG_CSS_PATH = path.join(ROOT, 'assets', 'css', 'blog.css');
const BLOG_CSS_VERSION = createHash('sha256')
  .update(fs.readFileSync(BLOG_CSS_PATH))
  .digest('hex')
  .slice(0, 12);

const PAGE_SIZE = 12;

// カテゴリー定義の正本は assets/js/blog-taxonomy.mjs（ここへ再定義しない）。

const REQUIRED_FIELDS = ['title', 'slug', 'description', 'published', 'updated', 'category', 'author', 'status'];

const CTA_PRESETS = {
  'personal-training': {
    headline: '自分に合ったトレーニングを知りたい方へ。',
    primaryLabel: 'パーソナルトレーニングを見る',
    primaryHref: '/price.html#cat-training',
    secondaryLabel: '初回体験を予約する'
  },
  boxing: {
    headline: '初めてのボクシングにも。',
    primaryLabel: 'パーソナルボクシングを見る',
    primaryHref: '/price.html#cat-boxing',
    secondaryLabel: '初回体験を予約する'
  },
  recovery: {
    headline: 'トレーニング後の休息まで考える。',
    primaryLabel: 'リカバリーについて見る',
    primaryHref: '/solution.html',
    secondaryLabel: null
  },
  general: {
    headline: 'THE REV.について見る',
    primaryLabel: 'THE REV.について見る',
    primaryHref: '/',
    secondaryLabel: '初回体験を予約する'
  }
};

const RESERVE_URL = 'https://cl.gyms.jp/t/CC2237480443/';

/* ---------------- ユーティリティ ---------------- */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyHeading(text) {
  const base = String(text)
    .trim()
    .toLowerCase()
    .replace(/[<>"'&]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-぀-ヿ㐀-鿿]/g, '');
  return base || 'section';
}

function formatDateDisplay(dateStr) {
  // Front Matterの日付（YYYY-MM-DD）はJSTの暦日として入力される前提の文字列であり、
  // 表示整形のためだけにDateオブジェクトへ変換しない（実行環境のローカルタイムゾーンに
  // 依存し、UTCで動くVercelのビルド環境ではJSTとの差で日付が1日ずれてしまうため）。
  // 文字列のまま区切り文字だけ置換することで、実行環境によらず常に同じ表示になる。
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
  if (!match) return dateStr;
  const [, y, m, d] = match;
  return `${y}.${m}.${d}`;
}

function toIso(dateStr) {
  return `${dateStr}T00:00:00+09:00`;
}

function fill(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const v = data[key];
      return v === undefined || v === null ? '' : String(v);
    }
    return '';
  });
}

function readPartial(name) {
  return fs.readFileSync(path.join(PARTIALS_DIR, name), 'utf8');
}

function utmTermFor(slug) {
  return slug ? `&amp;utm_term=${encodeURIComponent(slug)}` : '';
}

function renderChrome(partialTemplate, slug) {
  return fill(partialTemplate, { UTM_TERM: utmTermFor(slug) });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/* ---------------- Markdown → HTML（見出しに id を付与し、TOC を収集） ---------------- */

function renderMarkdown(md) {
  const toc = [];
  const usedIds = new Set();
  const renderer = new marked.Renderer();

  renderer.heading = (text, depth) => {
    let id = slugifyHeading(text);
    let uniqueId = id;
    let i = 2;
    while (usedIds.has(uniqueId)) { uniqueId = `${id}-${i}`; i += 1; }
    usedIds.add(uniqueId);
    if (depth === 2) toc.push({ id: uniqueId, text });
    return `<h${depth} id="${uniqueId}">${text}</h${depth}>\n`;
  };

  const html = marked.parse(md, { renderer, breaks: false, gfm: true });
  const h2Count = toc.length;
  return { html, toc, h2Count };
}

/* ---------------- 記事読み込み・検証 ---------------- */

function loadArticles() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  const articles = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { data: fm, content } = matter(raw);

    const missing = REQUIRED_FIELDS.filter(k => !fm[k] && fm[k] !== false);
    if (missing.length) {
      throw new Error(`[build-blog] ${file}: 必須Front Matterが不足しています → ${missing.join(', ')}`);
    }
    if (!isBlogCategory(fm.category)) {
      throw new Error(`[build-blog] ${file}: 不明なcategory "${fm.category}"。${categoryValidationMessage()}`);
    }
    const categoryInfo = getBlogCategory(fm.category);
    if (fm.category_label && fm.category_label !== categoryInfo.labelEn) {
      throw new Error(`[build-blog] ${file}: category_label "${fm.category_label}" がtaxonomyと一致しません（${categoryInfo.labelEn}）`);
    }
    if (!['draft', 'published'].includes(fm.status)) {
      throw new Error(`[build-blog] ${file}: statusはdraftまたはpublishedのみ有効です`);
    }

    const { html, toc, h2Count } = renderMarkdown(content);

    articles.push({
      file,
      title: fm.title,
      slug: fm.slug,
      description: fm.description,
      published: fm.published,
      updated: fm.updated,
      category: fm.category,
      categoryLabel: categoryInfo.labelEn,
      author: fm.author,
      authorRole: fm.author_role || '',
      thumbnail: fm.thumbnail || '',
      ogImage: fm.og_image || '/assets/images/blog/og/og-default.jpg',
      imageAlt: fm.alt || fm.title,
      status: fm.status,
      featured: !!fm.featured,
      ctaType: fm.cta_type ? String(fm.cta_type) : null,
      keywords: Array.isArray(fm.keywords) ? fm.keywords : [],
      canonical: fm.canonical || `${SITE_URL}/blog/${fm.slug}/`,
      noindex: !!fm.noindex,
      bodyHtml: html,
      toc,
      h2Count
    });
  }

  return articles;
}

/* ---------------- 関連記事 ---------------- */

function findRelated(article, all) {
  const others = all.filter(a => a.slug !== article.slug);
  const scored = others.map(a => {
    let score = 0;
    if (a.category === article.category) score += 10;
    const sharedKeywords = a.keywords.filter(k => article.keywords.includes(k));
    score += sharedKeywords.length * 3;
    const daysApart = Math.abs(new Date(a.published) - new Date(article.published)) / 86400000;
    score += Math.max(0, 5 - daysApart / 30);
    return { a, score };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, 3).map(s => s.a);
}

/* ---------------- 部品HTML生成 ---------------- */

function articleCardHtml(article, placement) {
  const thumb = article.thumbnail
    ? `<div class="blog-card-media"><img src="${escapeHtml(article.thumbnail)}" alt="" width="640" height="360" loading="lazy" decoding="async"></div>`
    : '';
  return `<article class="blog-card">
<a class="blog-card-link" href="/blog/${article.slug}/" data-track="article_click" data-placement="${placement}" data-article-slug="${article.slug}">
${thumb}
<div class="blog-card-body">
<p class="blog-card-cat">${escapeHtml(article.categoryLabel)}</p>
<time class="blog-card-date" datetime="${toIso(article.published)}">${formatDateDisplay(article.published)}</time>
<h2 class="blog-card-title">${escapeHtml(article.title)}</h2>
<p class="blog-card-desc">${escapeHtml(article.description)}</p>
<span class="blog-card-more">READ ARTICLE<span class="tz-arrow" aria-hidden="true"></span></span>
</div>
</a>
</article>`;
}

function resolveAuthorRole(article) {
  const fallback = article.author === 'THE REV. CONDITIONING LAB.' ? '' : 'THE REV. CONDITIONING LAB.';
  const role = article.authorRole || fallback;
  return role && role !== article.author ? role : '';
}

function authorLineHtml(article, tag) {
  const role = resolveAuthorRole(article);
  const roleHtml = role ? `<${tag}>${escapeHtml(role)}</${tag}>` : '';
  return `${escapeHtml(article.author)}${roleHtml}`;
}

function tocHtml(article) {
  if (article.h2Count < 3) return '';
  const items = article.toc.map(t => `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`).join('\n');
  return `<nav class="blog-toc" aria-label="目次">
<p class="blog-toc-label">CONTENTS</p>
<ol class="blog-toc-list">
${items}
</ol>
</nav>`;
}

function authorBlockHtml(article) {
  const isHattori = article.author.includes('服部');
  const bio = isHattori
    ? '二輪ロードレース、プロボクシングを経て、現在はTHE REV. CONDITIONING LAB.でパーソナルトレーニングを担当。累計約5,000セッション。'
    : 'THE REV. CONDITIONING LAB. のトレーニング・コンディショニングに関する知見をもとに構成しています。';
  return `<aside class="blog-author">
<p class="blog-author-label">WRITTEN BY</p>
<p class="blog-author-name">${authorLineHtml(article, 'span')}</p>
<p class="blog-author-bio">${escapeHtml(bio)}</p>
<a class="tz-link" href="/trainer.html">トレーナーについて<span class="tz-arrow" aria-hidden="true"></span></a>
</aside>`;
}

function ctaBlockHtml(article) {
  if (!article.ctaType) return '';
  const preset = CTA_PRESETS[article.ctaType] || CTA_PRESETS.general;
  const secondary = preset.secondaryLabel
    ? `<a class="btn-outline-gold" href="${RESERVE_URL}?utm_source=website&amp;utm_medium=referral&amp;utm_campaign=trial&amp;utm_content=blog_article_bottom&amp;utm_term=${encodeURIComponent(article.slug)}" data-track="article_cta_click" data-article-slug="${article.slug}" data-cta-type="${article.ctaType}" data-placement="article_bottom_secondary" rel="noopener" target="_blank">${escapeHtml(preset.secondaryLabel)}<span class="bog-arrow"></span></a>`
    : '';
  return `<div class="blog-cta">
<p class="blog-cta-headline">${escapeHtml(preset.headline)}</p>
<div class="blog-cta-actions">
<a class="cta" href="${preset.primaryHref}" data-track="article_cta_click" data-article-slug="${article.slug}" data-cta-type="${article.ctaType}" data-placement="article_bottom_primary">${escapeHtml(preset.primaryLabel)}<span class="arrow"></span></a>
${secondary}
</div>
</div>`;
}

function relatedBlockHtml(article, all) {
  const related = findRelated(article, all);
  if (!related.length) return '';
  const items = related.map(r => `<article class="blog-related-card">
<a href="/blog/${r.slug}/" data-track="related_article_click" data-source-slug="${article.slug}" data-target-slug="${r.slug}">
${r.thumbnail ? `<img src="${escapeHtml(r.thumbnail)}" alt="" width="400" loading="lazy" decoding="async">` : ''}
<p class="blog-related-cat">${escapeHtml(r.categoryLabel)}</p>
<h3>${escapeHtml(r.title)}</h3>
</a>
</article>`).join('\n');
  return `<section class="blog-related" aria-label="関連記事">
<h2 class="blog-related-label">RELATED ARTICLES</h2>
<div class="blog-related-grid">
${items}
</div>
</section>`;
}

function articleJsonLd(article) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: toIso(article.published),
    dateModified: toIso(article.updated),
    author: { '@type': article.author.includes('服部') ? 'Person' : 'Organization', name: article.author },
    publisher: {
      '@type': 'Organization',
      name: 'THE REV. CONDITIONING LAB.',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/images/logo-mark.png` }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': article.canonical },
    image: article.ogImage.startsWith('http') ? article.ogImage : `${SITE_URL}${article.ogImage}`
  });
}

function breadcrumbJsonLd(items) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: it.url
    }))
  });
}

function paginationHtml(current, totalPages, basePath) {
  if (totalPages <= 1) return '';
  const links = [];
  for (let p = 1; p <= totalPages; p += 1) {
    const href = p === 1 ? basePath : `${basePath}page/${p}/`;
    const cur = p === current ? ' aria-current="page"' : '';
    links.push(`<a class="blog-page-link" href="${href}"${cur}>${p}</a>`);
  }
  return `<nav class="blog-pagination" aria-label="ページネーション">${links.join('\n')}</nav>`;
}

/* ---------------- 出力 ---------------- */

function writeFile(relPath, content) {
  const full = path.join(OUTPUT_ROOT, relPath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, content, 'utf8');
}

function buildArticlePages(published, all, postTemplate) {
  for (const article of published) {
    const header = renderChrome(readPartial('header.html'), article.slug);
    const footer = renderChrome(readPartial('footer.html'), article.slug);
    const drawer = renderChrome(readPartial('drawer.html'), article.slug);

    const updatedBlock = article.updated !== article.published
      ? ` <time class="blog-update" datetime="${toIso(article.updated)}">UPDATE ${formatDateDisplay(article.updated)}</time>`
      : '';

    const heroImage = article.thumbnail
      ? `<figure class="blog-hero-media"><img src="${escapeHtml(article.thumbnail)}" alt="${escapeHtml(article.imageAlt)}" width="1200" height="675" fetchpriority="high" decoding="async"></figure>`
      : '';

    const breadcrumb = breadcrumbJsonLd([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Column', url: `${SITE_URL}/blog/` },
      { name: getBlogCategory(article.category).labelJa, url: `${SITE_URL}${categoryUrlPath(article.category)}` },
      { name: article.title, url: article.canonical }
    ]);

    const html = fill(postTemplate, {
      TITLE: escapeHtml(`${article.title}｜THE REV.`),
      BLOG_CSS_VERSION,
      DESCRIPTION: escapeHtml(article.description),
      CANONICAL: article.canonical,
      ROBOTS_META: article.noindex ? '<meta name="robots" content="noindex,follow">\n' : '',
      OG_IMAGE: article.ogImage.startsWith('http') ? article.ogImage : `${SITE_URL}${article.ogImage}`,
      OG_IMAGE_WIDTH: '1200',
      OG_IMAGE_HEIGHT: '630',
      ARTICLE_JSONLD: articleJsonLd(article),
      BREADCRUMB_JSONLD: breadcrumb,
      HEADER: header,
      FOOTER: footer,
      DRAWER: drawer,
      CATEGORY_LABEL: escapeHtml(article.categoryLabel),
      CATEGORY_SLUG: article.category,
      CATEGORY_URL: categoryUrlPath(article.category),
      PUBLISHED_ISO: toIso(article.published),
      PUBLISHED_DISPLAY: formatDateDisplay(article.published),
      UPDATED_BLOCK: updatedBlock,
      ARTICLE_TITLE_HTML: escapeHtml(article.title).replace(/\n/g, '<br>'),
      AUTHOR_LINE: `<span class="blog-article-author-label">WRITTEN BY</span>${authorLineHtml(article, 'span')}`,
      HERO_IMAGE_BLOCK: heroImage,
      TOC_BLOCK: tocHtml(article),
      BODY_HTML: article.bodyHtml,
      AUTHOR_BLOCK: authorBlockHtml(article),
      CTA_BLOCK: ctaBlockHtml(article),
      RELATED_BLOCK: relatedBlockHtml(article, published),
      SLUG: article.slug,
      ARTICLE_VIEW_PUSH: JSON.stringify({
        event: 'article_view',
        event_version: 'e1_v1',
        site_version: 'pre_m1',
        page_path: `/blog/${article.slug}/`,
        page_type: 'blog_article',
        article_slug: article.slug,
        article_category: article.category,
        article_title: article.title
      })
    });

    writeFile(`blog/${article.slug}/index.html`, html);
  }
}

function publishedByCategory(published) {
  const sorted = [...published].sort((a, b) => new Date(b.published) - new Date(a.published));
  return new Map(BLOG_CATEGORIES.map(c => [c.slug, sorted.filter(a => a.category === c.slug)]));
}

function articleCountLabel(n) {
  return `${n} ${n === 1 ? 'ARTICLE' : 'ARTICLES'}`;
}

function categoryNavHtml(byCategory, activeSlug, placement) {
  const items = BLOG_CATEGORIES.map(c => {
    const count = byCategory.get(c.slug).length;
    const current = c.slug === activeSlug ? ' aria-current="page"' : '';
    return `<li><a class="blog-cat-nav-item" href="${categoryUrlPath(c.slug)}"${current} data-track="category_nav_click" data-category-slug="${c.slug}" data-placement="${placement}">
<span class="blog-cat-nav-en">${escapeHtml(c.labelEn)}</span>
<span class="blog-cat-nav-ja">${escapeHtml(c.labelJa)}</span>
<span class="blog-cat-nav-count">${articleCountLabel(count)}</span>
<span class="tz-arrow" aria-hidden="true"></span>
</a></li>`;
  }).join('\n');
  return `<section class="section blog-cat-nav-sec" data-screen-label="カテゴリー導線">
<div class="wrap">
<nav class="blog-cat-nav" aria-labelledby="blog-cat-nav-title">
<p class="eyebrow">BROWSE BY CATEGORY</p>
<h2 class="blog-cat-nav-title" id="blog-cat-nav-title">カテゴリーから探す</h2>
<ul class="blog-cat-nav-list">
${items}
</ul>
</nav>
</div>
</section>`;
}

function renderListingPage(template, ctx) {
  const header = renderChrome(readPartial('header.html'), '');
  const footer = renderChrome(readPartial('footer.html'), '');
  const drawer = renderChrome(readPartial('drawer.html'), '');
  return fill(template, {
    TITLE: escapeHtml(ctx.title),
    BLOG_CSS_VERSION,
    DESCRIPTION: escapeHtml(ctx.description),
    CANONICAL: ctx.canonical,
    ROBOTS_META: ctx.noindex ? '<meta name="robots" content="noindex,follow">\n' : '',
    OG_IMAGE: `${SITE_URL}/assets/images/blog/og/og-default.jpg`,
    BREADCRUMB_JSONLD: breadcrumbJsonLd(ctx.breadcrumb),
    HEADER: header,
    FOOTER: footer,
    DRAWER: drawer,
    BODY_CLASS: ctx.bodyClass,
    HERO_BLOCK: ctx.heroBlock,
    CATEGORY_NAV_BLOCK: ctx.categoryNav,
    LIST_HEADING_BLOCK: ctx.listHeading,
    ARTICLE_CARDS: ctx.articles.map(a => articleCardHtml(a, ctx.placement)).join('\n'),
    EMPTY_STATE: ctx.articles.length ? '' : '<p class="blog-empty">現在公開中の記事はありません。近日公開予定です。</p>',
    PAGINATION_BLOCK: paginationHtml(ctx.page, ctx.totalPages, ctx.basePath)
  });
}

function buildIndexPages(published, indexTemplate) {
  const sorted = [...published].sort((a, b) => new Date(b.published) - new Date(a.published));
  const byCategory = publishedByCategory(published);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  const breadcrumb = [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Column', url: `${SITE_URL}/blog/` }
  ];
  const heroBlock = `<section class="blog-lp-hero" data-screen-label="COLUMN見出し">
<div class="wrap blog-lp-hero-wrap">
<p class="eyebrow reveal">Column</p>
<h1 class="blog-lp-title reveal d1">身体づくりを、もう少し深く。</h1>
<p class="blog-lp-lead reveal d2">トレーニング、身体・健康、ジム選び、リカバリー、ボクシング。<br>THE REV.で実際に聞かれる疑問や、身体づくりについての考え方をまとめています。</p>
</div>
</section>`;
  const listHeading = `<p class="eyebrow">LATEST ARTICLES</p>
<h2 class="blog-list-title">新着記事</h2>`;

  for (let page = 1; page <= totalPages; page += 1) {
    const start = (page - 1) * PAGE_SIZE;
    const html = renderListingPage(indexTemplate, {
      title: page === 1 ? 'コラム｜THE REV. CONDITIONING LAB.' : `コラム（${page}ページ目）｜THE REV.`,
      description: 'トレーニング、身体・健康、ジム選び、リカバリー、ボクシング。THE REV.で実際に聞かれる疑問や、身体づくりについての考え方をまとめたコラムです。',
      canonical: page === 1 ? `${SITE_URL}/blog/` : `${SITE_URL}/blog/page/${page}/`,
      noindex: false,
      breadcrumb,
      bodyClass: 'blog blog-index',
      heroBlock,
      categoryNav: categoryNavHtml(byCategory, null, 'blog_index'),
      listHeading,
      articles: sorted.slice(start, start + PAGE_SIZE),
      placement: 'blog_index',
      page,
      totalPages,
      basePath: '/blog/'
    });
    writeFile(page === 1 ? 'blog/index.html' : `blog/page/${page}/index.html`, html);
  }
}

function buildCategoryPages(published, indexTemplate) {
  const byCategory = publishedByCategory(published);

  for (const category of BLOG_CATEGORIES) {
    const articles = byCategory.get(category.slug);
    const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
    const basePath = categoryUrlPath(category.slug);
    const breadcrumb = [
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Column', url: `${SITE_URL}/blog/` },
      { name: category.labelJa, url: `${SITE_URL}${basePath}` }
    ];
    const heroBlock = `<section class="blog-lp-hero blog-category-hero" data-screen-label="カテゴリー見出し">
<div class="wrap blog-lp-hero-wrap">
<p class="eyebrow reveal">COLUMN / ${escapeHtml(category.labelEn)}</p>
<h1 class="blog-lp-title reveal d1">${escapeHtml(category.labelJa)}</h1>
<p class="blog-lp-lead reveal d2">${escapeHtml(category.description)}</p>
<p class="blog-category-count reveal d3">${articleCountLabel(articles.length)}</p>
</div>
</section>`;
    const listHeading = `<p class="eyebrow">${escapeHtml(category.labelEn)} ARTICLES</p>
<h2 class="blog-list-title">${escapeHtml(category.labelJa)}の記事</h2>`;

    for (let page = 1; page <= totalPages; page += 1) {
      const start = (page - 1) * PAGE_SIZE;
      const html = renderListingPage(indexTemplate, {
        title: page === 1
          ? `${category.labelJa}の記事｜THE REV. CONDITIONING LAB.`
          : `${category.labelJa}の記事（${page}ページ目）｜THE REV.`,
        description: `${category.description}THE REV. CONDITIONING LAB.のコラムです。`,
        canonical: page === 1 ? `${SITE_URL}${basePath}` : `${SITE_URL}${basePath}page/${page}/`,
        // 記事が1本も無い将来のカテゴリーはindex対象外（ページ自体は存在してよい）。
        noindex: articles.length === 0,
        breadcrumb,
        bodyClass: 'blog blog-index blog-category',
        heroBlock,
        categoryNav: categoryNavHtml(byCategory, category.slug, 'category_page'),
        listHeading,
        articles: articles.slice(start, start + PAGE_SIZE),
        placement: 'category_index',
        page,
        totalPages,
        basePath
      });
      writeFile(page === 1 ? `blog/category/${category.slug}/index.html` : `blog/category/${category.slug}/page/${page}/index.html`, html);
    }
  }
}

function buildSitemap(published) {
  const staticUrls = [
    { loc: `${SITE_URL}/`, priority: '1.0' },
    { loc: `${SITE_URL}/solution.html`, priority: '0.9' },
    { loc: `${SITE_URL}/price.html`, priority: '0.9' },
    { loc: `${SITE_URL}/access.html`, priority: '0.8' },
    { loc: `${SITE_URL}/trainer.html`, priority: '0.8' },
    { loc: `${SITE_URL}/legal.html`, priority: '0.4' },
    { loc: `${SITE_URL}/privacy.html`, priority: '0.4' },
    { loc: `${SITE_URL}/terms.html`, priority: '0.4' }
  ];
  const blogUrls = [
    { loc: `${SITE_URL}/blog/`, priority: '0.8' },
    // カテゴリーTOPのみ（pagination・記事0件カテゴリーは含めない）。lastmod = カテゴリー内公開記事のupdated最大値。
    ...BLOG_CATEGORIES
      .map(c => ({ c, items: published.filter(a => a.category === c.slug) }))
      .filter(x => x.items.length > 0)
      .map(x => ({
        loc: `${SITE_URL}${categoryUrlPath(x.c.slug)}`,
        priority: '0.7',
        lastmod: x.items.map(a => a.updated).sort().at(-1)
      })),
    ...published
      .filter(a => !a.noindex)
      .map(a => ({ loc: a.canonical, priority: '0.7', lastmod: a.updated }))
  ];
  const all = [...staticUrls, ...blogUrls];
  const body = all.map(u => {
    const lastmod = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '';
    return `  <url><loc>${u.loc}</loc>${lastmod}<priority>${u.priority}</priority></url>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  writeFile('sitemap.xml', xml);
}

function buildAnalyticsPageCatalog(published) {
  const staticPages = {
    '/': {
      title: 'トップページ',
      summary: 'THE REV.のサービス全体を案内する入口ページです。'
    },
    '/price.html': {
      title: '料金・プラン',
      summary: '初回体験、パーソナルトレーニング、酸素ルーム・DENBAなどの料金と利用条件です。'
    },
    '/access.html': {
      title: 'アクセス・ご来店案内',
      summary: '店舗の場所、駅からの行き方、駐車場・自転車・バイクでの来店方法です。'
    },
    '/blog': {
      title: 'コラム一覧',
      summary: 'トレーニング、身体・健康、ジム選び、リカバリー、ボクシングの記事一覧です。'
    },
    '/trainer.html': {
      title: '代表トレーナー紹介',
      summary: '代表トレーナー服部真騎士のプロフィールと指導への考え方です。'
    },
    '/solution.html': {
      title: '酸素ルーム・DENBA',
      summary: '酸素ルームとDENBA Healthの設備、利用方法、料金を案内するページです。'
    },
    '/legal.html': {
      title: '特定商取引法に基づく表記',
      summary: '事業者情報や販売条件などの法定表示ページです。'
    },
    '/privacy.html': {
      title: 'プライバシーポリシー',
      summary: '個人情報やアクセス解析データの取り扱い方針です。'
    },
    '/terms.html': {
      title: '利用規約',
      summary: 'THE REV.のサービス利用に関する規約です。'
    }
  };

  const catalog = { ...staticPages };
  for (const category of BLOG_CATEGORIES) {
    catalog[`/blog/category/${category.slug}`] = {
      title: `${category.labelJa}の記事`,
      summary: category.description
    };
  }
  for (const article of published) {
    catalog[`/blog/${article.slug}`] = {
      title: article.title,
      summary: article.description
    };
  }

  const source = [
    '// AUTO-GENERATED by scripts/build-blog.mjs.',
    '// Analytics表示用の人間向けページ名・概要。手動編集しない。',
    `export const PAGE_CATALOG = Object.freeze(${JSON.stringify(catalog, null, 2)});`,
    ''
  ].join('\n');

  writeFile('admin/js/generated-page-catalog.mjs', source);
}

function buildRss(published) {
  const sorted = [...published]
    .filter(a => !a.noindex)
    .sort((a, b) => new Date(b.published) - new Date(a.published))
    .slice(0, 20);
  const items = sorted.map(a => `  <item>
    <title>${escapeHtml(a.title)}</title>
    <link>${a.canonical}</link>
    <guid>${a.canonical}</guid>
    <pubDate>${new Date(toIso(a.published)).toUTCString()}</pubDate>
    <description>${escapeHtml(a.description)}</description>
  </item>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>THE REV. CONDITIONING LAB. — COLUMN</title>
<link>${SITE_URL}/blog/</link>
<atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml"/>
<description>THE REV.で実際に聞かれる身体づくりの疑問や、代表トレーナーの考え方をまとめたコラムです。</description>
<language>ja</language>
${items}
</channel>
</rss>
`;
  writeFile('blog/feed.xml', xml);
}

function buildBlogCachePolicy() {
  const policy = `# AUTO-GENERATED by scripts/build-blog.mjs.
# Blog HTML changes whenever Editorial publishes. Revalidate HTML/XML on every request
# while leaving fingerprinted CSS/images free to use their normal cache policy.
<IfModule mod_headers.c>
  <FilesMatch "\\.(?:html?|xml)$">
    Header always set Cache-Control "no-store, no-cache, max-age=0, must-revalidate"
    Header always set Pragma "no-cache"
    Header always set Expires "0"
  </FilesMatch>
</IfModule>
`;
  writeFile('blog/.htaccess', policy);
}

/* ---------------- 実行 ---------------- */

function main() {
  const all = loadArticles();
  const published = all.filter(a => a.status === 'published');

  const postTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'blog-post.html'), 'utf8');
  const indexTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'blog-index.html'), 'utf8');

  // 既存の生成物をクリーンにしてから再生成（削除された記事が残らないように）
  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);
  buildBlogCachePolicy();

  buildArticlePages(published, all, postTemplate);
  buildIndexPages(published, indexTemplate);
  buildCategoryPages(published, indexTemplate);
  buildSitemap(published);
  buildRss(published);
  buildAnalyticsPageCatalog(published);

  console.log('[build-blog] 完了');
  console.log(`  記事ファイル数: ${all.length}（公開: ${published.length} / 下書き: ${all.length - published.length}）`);
  console.log(`  生成: /blog/index.html, /blog/category/{slug}/ ×${BLOG_CATEGORIES.length}, /blog/{slug}/index.html ×${published.length}`);
  console.log('  更新: sitemap.xml, blog/feed.xml, admin/js/generated-page-catalog.mjs');
  if (all.length !== published.length) {
    const drafts = all.filter(a => a.status !== 'published').map(a => a.file);
    console.log(`  下書き（非公開）: ${drafts.join(', ')}`);
  }
}

main();
