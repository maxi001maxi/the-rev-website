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
  asset_version = '',
  content_reference = '',
  render_mode = ''
} = job;

if (!slug || !image_headline_short || !asset_version || !content_reference) {
  throw new Error('job requires slug, image_headline_short, asset_version, content_reference');
}
if (render_mode !== 'source-photo-lock-v1') {
  throw new Error(`Reference V2.2 requires render_mode=source-photo-lock-v1, got: ${render_mode || '(missing)'}`);
}
if (!fs.existsSync(content_reference)) {
  throw new Error(`source photo missing: ${content_reference}`);
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

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

const sourcePhotoUrl =
  `data:${mimeFor(content_reference)};base64,${fs.readFileSync(content_reference).toString('base64')}`;
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
  body{position:relative;color:${style.overlay.headline.color};background:#f5f1e8}
  .paper{
    position:absolute;inset:0;
    background:
      radial-gradient(ellipse at 18% 84%, rgba(183,168,139,.08), transparent 36%),
      linear-gradient(90deg,#f7f4ec 0%,#f5f1e8 48.8%,#eee9df 49%,#eee9df 49.2%,transparent 49.2%);
  }
  .photo{
    position:absolute;right:0;top:0;width:50.8%;height:100%;
    object-fit:cover;object-position:center;
    filter:none;
  }
  .frame{position:absolute;inset:0;border:1px solid rgba(74,68,58,.16);pointer-events:none}
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
  <div class="paper"></div>
  <img class="photo" src="${sourcePhotoUrl}" alt="">
  <div class="frame"></div>
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
  render_mode,
  content_reference,
  source_photo_locked: true,
  allowed_photo_transforms: ['crop', 'resize'],
  thumbnail: outThumb,
  og: outOg,
  thumbnail_public: `/assets/images/blog/thumb-${slug}${versionSuffix}.jpg`,
  og_public: `/assets/images/blog/og/og-${slug}${versionSuffix}.jpg`
}));
