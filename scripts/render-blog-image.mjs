import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  getEditorialImageStyle,
  REV_COLUMN_REFERENCE_V2
} from '../lib/editorialImageStyle.mjs';
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
  image_style_template = REV_COLUMN_REFERENCE_V2.id,
  asset_version = ''
} = job;

if (!slug || !image_headline_short || !asset_version) {
  throw new Error('job requires slug, image_headline_short, asset_version');
}

const copyCheck = validateImageHeadlineShort(image_headline_short);
if (!copyCheck.ok) {
  throw new Error(`invalid image_headline_short: ${copyCheck.errors.join(', ')}`);
}

const style = getEditorialImageStyle(image_style_template);
if (style.id !== REV_COLUMN_REFERENCE_V2.id) {
  throw new Error(`Reference V2 renderer received unsupported style: ${style.id}`);
}

const safeVersion = String(asset_version)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '');

const basePath = path.resolve('.editorial-tmp', `${slug}-${safeVersion}-base.jpg`);
if (!fs.existsSync(basePath)) {
  throw new Error(`Reference V2 generated base image missing: ${basePath}`);
}

const baseUrl = `data:image/jpeg;base64,${fs.readFileSync(basePath).toString('base64')}`;
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
  const labelSize = og ? style.overlay.label.sizeOg : style.overlay.label.sizeThumb;
  const headlineSize = og ? style.overlay.headline.sizeOg : style.overlay.headline.sizeThumb;
  const headlineHtml = esc(image_headline_short).replaceAll('\n', '<br>');
  // V2.1: group the small label and headline into the same editorial block.
  // The approved masters place this block noticeably lower than the first V2 render.
  const top = og ? 165 : 210;
  const left = og ? 76 : 80;
  const headlineTop = og ? 252 : 320;
  const maxWidth = og ? 480 : 500;
  const hairlineWidth = og ? 160 : 180;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#f6f2e9}
  body{position:relative;color:${style.overlay.headline.color}}
  .base{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}
  .label{
    position:absolute;left:${left}px;top:${top}px;
    font-family:${style.overlay.label.family};
    font-size:${labelSize}px;
    font-weight:${style.overlay.label.weight};
    letter-spacing:${style.overlay.label.letterSpacing};
    line-height:1.4;
    color:${style.overlay.label.color};
    white-space:nowrap;
  }
  .hairline{
    position:absolute;left:${left}px;top:${top + (og ? 38 : 42)}px;
    width:${hairlineWidth}px;height:1px;background:${style.overlay.headline.color};opacity:.45;
  }
  .headline{
    position:absolute;left:${left}px;top:${headlineTop}px;
    margin:0;
    max-width:${maxWidth}px;
    font-family:${style.overlay.headline.family};
    font-size:${headlineSize}px;
    font-weight:${style.overlay.headline.weight};
    line-height:${style.overlay.headline.lineHeight};
    letter-spacing:${style.overlay.headline.letterSpacing};
    color:${style.overlay.headline.color};
    word-break:keep-all;
    overflow-wrap:anywhere;
    text-rendering:optimizeLegibility;
  }
</style>
</head>
<body>
  <img class="base" src="${baseUrl}" alt="">
  <div class="label">${esc(category_label)}${column_label ? ' / ' + esc(column_label) : ''}</div>
  <div class="hairline"></div>
  <h1 class="headline">${headlineHtml}</h1>
</body>
</html>`;
}

const browser = await chromium.launch({ headless: true });

try {
  for (const spec of [
    { width: style.thumb.width, height: style.thumb.height, out: outThumb, og: false },
    { width: style.og.width, height: style.og.height, out: outOg, og: true }
  ]) {
    const page = await browser.newPage({
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: 1
    });

    await page.setContent(html(spec), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: spec.out,
      type: 'jpeg',
      quality: 94,
      fullPage: false
    });
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
  asset_version: safeVersion,
  generated_base: basePath,
  thumbnail: outThumb,
  og: outOg,
  thumbnail_public: `/assets/images/blog/thumb-${slug}${versionSuffix}.jpg`,
  og_public: `/assets/images/blog/og/og-${slug}${versionSuffix}.jpg`
}));
