import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getEditorialImageStyle, REV_COLUMN_CLASSIC_V1 } from '../lib/editorialImageStyle.mjs';
import { validateImageHeadlineShort } from '../lib/editorialImageCopy.mjs';

const jobPath = process.argv[2];
if (!jobPath) throw new Error('Usage: node scripts/render-blog-image.mjs <job.json>');
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));

const {
  slug,
  category_label = 'COLUMN',
  column_label = '',
  article_title = '',
  image_headline_short = '',
  image_style_template = REV_COLUMN_CLASSIC_V1.id,
  source_image,
  asset_version = ''
} = job;

if (!slug || !image_headline_short || !source_image) {
  throw new Error('job requires slug, image_headline_short, source_image');
}
const copyCheck = validateImageHeadlineShort(image_headline_short);
if (!copyCheck.ok) throw new Error(`invalid image_headline_short: ${copyCheck.errors.join(', ')}`);
const style = getEditorialImageStyle(image_style_template);

const srcPath = path.resolve(source_image);
if (!fs.existsSync(srcPath)) throw new Error(`source image missing: ${source_image}`);
const ext = path.extname(srcPath).toLowerCase();
const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
const imageData = fs.readFileSync(srcPath).toString('base64');
const imageUrl = `data:${mime};base64,${imageData}`;

const safeVersion = String(asset_version || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
const versionSuffix = safeVersion ? `-${safeVersion}` : '';
const outThumb = path.resolve(`assets/images/blog/thumb-${slug}${versionSuffix}.jpg`);
const outOg = path.resolve(`assets/images/blog/og/og-${slug}${versionSuffix}.jpg`);
fs.mkdirSync(path.dirname(outThumb), { recursive: true });
fs.mkdirSync(path.dirname(outOg), { recursive: true });

function esc(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function html({ width, height, og = false }) {
  const padX = og ? 66 : 74;
  const padTop = og ? 64 : 72;
  const headlineSize = og ? style.headline.sizeOg : style.headline.sizeThumb;
  const labelSize = og ? style.label.sizeOg : style.label.sizeThumb;
  const imageWidth = Math.round((1 - style.panelRatio) * 100);
  const copyWidth = 100 - imageWidth;
  const headlineHtml = esc(image_headline_short).replaceAll('\n', '<br>');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${style.colors.background}}
  body{color:${style.colors.text}}
  .card{position:relative;width:100%;height:100%;display:flex;background:${style.colors.background};border:1px solid ${style.colors.border}}
  .copy{position:relative;width:${copyWidth}%;height:100%;padding:${padTop}px ${padX}px 58px ${padX}px;display:flex;flex-direction:column}
  .label{font-family:${style.label.family};font-size:${labelSize}px;font-weight:${style.label.weight};letter-spacing:${style.label.letterSpacing};line-height:1.4;color:${style.colors.muted};white-space:nowrap}
  .hairline{width:34px;height:1px;background:${style.colors.text};opacity:.65;margin-top:${og?36:40}px}
  .headlineWrap{flex:1;display:flex;align-items:center;padding-bottom:${og?30:38}px}
  .headline{margin:0;font-family:${style.headline.family};font-size:${headlineSize}px;font-weight:${style.headline.weight};line-height:${style.headline.lineHeight};letter-spacing:${style.headline.letterSpacing};word-break:keep-all;overflow-wrap:anywhere}
  .media{width:${imageWidth}%;height:100%;overflow:hidden;background:#dedad1}
  .media img{width:100%;height:100%;object-fit:cover;object-position:center}
</style>
</head>
<body>
<div class="card">
  <section class="copy">
    <div class="label">${esc(category_label)}${column_label ? ' / '+esc(column_label) : ''}</div>
    <div class="hairline"></div>
    <div class="headlineWrap"><h1 class="headline">${headlineHtml}</h1></div>
  </section>
  <section class="media">
    <img src="${imageUrl}" alt="">
  </section>
</div>
</body>
</html>`;
}

const browser = await chromium.launch({ headless: true });
try {
  for (const spec of [
    { width: 1200, height: 800, out: outThumb, og: false },
    { width: 1200, height: 630, out: outOg, og: true }
  ]) {
    const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1 });
    await page.setContent(html(spec), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: spec.out, type: 'jpeg', quality: 92, fullPage: false });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  slug,
  article_title,
  image_headline_short,
  image_style_template: style.id,
  asset_version: safeVersion || null,
  thumbnail: outThumb,
  og: outOg,
  thumbnail_public: `/assets/images/blog/thumb-${slug}${versionSuffix}.jpg`,
  og_public: `/assets/images/blog/og/og-${slug}${versionSuffix}.jpg`
}));
