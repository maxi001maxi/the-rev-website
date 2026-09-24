import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { REV_COLUMN_REFERENCE_V2 } from '../lib/editorialImageStyle.mjs';
import { HYBRID_IMAGE_FORMAT } from '../lib/editorialHybridImageFormat.mjs';
import { validateImageHeadlineShort } from '../lib/editorialImageCopy.mjs';

const jobPath = process.argv[2];
if (!jobPath) throw new Error('Usage: node scripts/render-hybrid-editorial-overlay.mjs <hybrid-job.json>');

const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const {
  slug,
  category_label = 'COLUMN',
  column_label = '',
  image_headline_short = '',
  asset_version = '',
  generated_scene_path = '',
  layout_template_id = '',
  policy_revision = ''
} = job;

if (!slug || !image_headline_short || !asset_version || !generated_scene_path) {
  throw new Error('Hybrid V2.4 job requires slug, image_headline_short, asset_version and generated_scene_path.');
}
if (layout_template_id !== HYBRID_IMAGE_FORMAT.layoutTemplateId) {
  throw new Error(`layout_template_id must be ${HYBRID_IMAGE_FORMAT.layoutTemplateId}`);
}
if (policy_revision !== HYBRID_IMAGE_FORMAT.policyRevision) {
  throw new Error(`policy_revision must be ${HYBRID_IMAGE_FORMAT.policyRevision}`);
}
if (!fs.existsSync(generated_scene_path)) {
  throw new Error(`generated scene missing: ${generated_scene_path}`);
}

const copyCheck = validateImageHeadlineShort(image_headline_short);
if (!copyCheck.ok) throw new Error(`invalid image_headline_short: ${copyCheck.errors.join(', ')}`);

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

const sceneUrl = `data:${mimeFor(generated_scene_path)};base64,${fs.readFileSync(generated_scene_path).toString('base64')}`;
const suffix = safeVersion ? `-${safeVersion}` : '';
const outThumb = path.resolve(`assets/images/blog/thumb-${slug}${suffix}.jpg`);
const outOg = path.resolve(`assets/images/blog/og/og-${slug}${suffix}.jpg`);
const outGbp = path.resolve(`assets/images/gbp/gbp-${slug}${suffix}.jpg`);
fs.mkdirSync(path.dirname(outThumb), { recursive: true });
fs.mkdirSync(path.dirname(outOg), { recursive: true });
fs.mkdirSync(path.dirname(outGbp), { recursive: true });

function esc(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function html({ width, height, og = false, gbp = false }) {
  const style = REV_COLUMN_REFERENCE_V2;
  const labelSize = og ? style.overlay.label.sizeOg : style.overlay.label.sizeThumb;
  const headlineSize = og ? style.overlay.headline.sizeOg : style.overlay.headline.sizeThumb;
  const headlineHtml = esc(image_headline_short).replaceAll('\n', '<br>');
  const top = gbp ? 248 : (og ? 165 : 177);
  const left = og ? 76 : 80;
  const headlineTop = gbp ? 350 : (og ? 252 : 270);
  const maxWidth = og ? 480 : 500;
  const hairlineWidth = og ? 160 : 180;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box}
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#f5f1e8}
body{position:relative;color:${style.overlay.headline.color}}
.paper{
  position:absolute;inset:0;
  background:
    radial-gradient(ellipse at 18% 84%,rgba(183,168,139,.08),transparent 36%),
    linear-gradient(90deg,#f7f4ec 0%,#f5f1e8 48.8%,#eee9df 49%,#eee9df 49.2%,transparent 49.2%);
}
.scene{
  position:absolute;right:0;top:0;width:50.8%;height:100%;
  object-fit:cover;object-position:center;
}
.scene-shade{
  position:absolute;right:0;top:0;width:50.8%;height:100%;
  background:linear-gradient(90deg,rgba(245,241,232,.04),rgba(0,0,0,.015));
  pointer-events:none;
}
.frame{position:absolute;inset:0;border:1px solid rgba(74,68,58,.16);pointer-events:none}
.label{
  position:absolute;left:${left}px;top:${top}px;
  font-family:${style.overlay.label.family};
  font-size:${labelSize}px;font-weight:${style.overlay.label.weight};
  letter-spacing:${style.overlay.label.letterSpacing};line-height:1.4;
  color:${style.overlay.label.color};white-space:nowrap;
}
.hairline{
  position:absolute;left:${left}px;top:${top + (og ? 38 : 42)}px;
  width:${hairlineWidth}px;height:1px;background:${style.overlay.headline.color};opacity:.45;
}
.headline{
  position:absolute;left:${left}px;top:${headlineTop}px;margin:0;
  max-width:${maxWidth}px;
  font-family:${style.overlay.headline.family};
  font-size:${headlineSize}px;font-weight:${style.overlay.headline.weight};
  line-height:${style.overlay.headline.lineHeight};
  letter-spacing:${style.overlay.headline.letterSpacing};
  color:${style.overlay.headline.color};
  word-break:keep-all;overflow-wrap:anywhere;text-rendering:optimizeLegibility;
}
</style>
</head>
<body>
<div class="paper"></div>
<img class="scene" src="${sceneUrl}" alt="">
<div class="scene-shade"></div>
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
    { width: 1200, height: 675, out: outThumb, og: false, gbp: false },
    { width: 1200, height: 630, out: outOg, og: true, gbp: false },
    { width: 1200, height: 900, out: outGbp, og: false, gbp: true }
  ]) {
    const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1 });
    await page.setContent(html(spec), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: spec.out, type: 'jpeg', quality: 94, fullPage: false });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  slug,
  asset_version: safeVersion,
  policy_revision,
  layout_template_id,
  generated_scene_path,
  thumbnail: outThumb,
  og: outOg,
  gbp: outGbp,
  thumbnail_public: `/assets/images/blog/thumb-${slug}${suffix}.jpg`,
  og_public: `/assets/images/blog/og/og-${slug}${suffix}.jpg`,
  gbp_public: `/assets/images/gbp/gbp-${slug}${suffix}.jpg`
}));
