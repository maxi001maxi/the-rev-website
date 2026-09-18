import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const jobPath = process.argv[2];
if (!jobPath) throw new Error('Usage: node scripts/render-blog-image.mjs <job.json>');
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));

const {
  slug,
  category_label = 'COLUMN',
  column_label = '',
  headline,
  subcopy = '',
  source_image,
  asset_version = ''
} = job;

if (!slug || !headline || !source_image) {
  throw new Error('job requires slug, headline, source_image');
}

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
  const pad = og ? 62 : 74;
  const headlineSize = og ? 48 : 56;
  const subSize = og ? 24 : 26;
  const imageWidth = og ? 44 : 43;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#f1eee6}
  body{font-family:"Noto Sans CJK JP","Noto Sans JP","Yu Gothic","Hiragino Sans",sans-serif;color:#191919}
  .card{position:relative;width:100%;height:100%;display:flex;background:#f1eee6}
  .copy{position:relative;width:${100-imageWidth}%;height:100%;padding:${pad}px ${og?54:64}px ${pad-4}px ${pad}px;display:flex;flex-direction:column;justify-content:space-between}
  .top{display:flex;align-items:center;gap:16px}
  .brand{font-size:${og?18:20}px;font-weight:700;letter-spacing:.16em}
  .rule{width:44px;height:1px;background:#191919;opacity:.65}
  .label{font-size:${og?14:15}px;letter-spacing:.12em;font-weight:500;color:#5d5b55}
  .headline{margin:0;font-size:${headlineSize}px;line-height:1.22;letter-spacing:-.025em;font-weight:700;word-break:keep-all;overflow-wrap:anywhere}
  .sub{margin-top:24px;font-size:${subSize}px;line-height:1.55;font-weight:500;color:#4c4a45;max-width:92%}
  .footer{display:flex;align-items:end;justify-content:space-between;color:#6d6a63;font-size:${og?14:15}px;letter-spacing:.08em}
  .dot{width:7px;height:7px;border-radius:50%;background:#191919;display:inline-block;margin-right:10px}
  .media{position:relative;width:${imageWidth}%;height:100%;overflow:hidden;background:#d9d5cb}
  .media img{width:100%;height:100%;object-fit:cover;object-position:center}
  .media::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(241,238,230,.16),rgba(0,0,0,.02) 28%,rgba(0,0,0,.08));}
  .mediaTag{position:absolute;right:26px;bottom:24px;z-index:2;color:white;font-size:${og?14:15}px;letter-spacing:.16em;font-weight:700;text-shadow:0 1px 8px rgba(0,0,0,.38)}
  .accent{position:absolute;left:${pad}px;top:${og?126:142}px;width:54px;height:3px;background:#1f1f1f}
</style>
</head>
<body>
<div class="card">
  <section class="copy">
    <div>
      <div class="top">
        <div class="brand">THE REV.</div><div class="rule"></div>
        <div class="label">${esc(category_label)}${column_label ? ' / '+esc(column_label) : ''}</div>
      </div>
      <div class="accent"></div>
    </div>
    <div>
      <h1 class="headline">${esc(headline)}</h1>
      ${subcopy ? `<div class="sub">${esc(subcopy)}</div>` : ''}
    </div>
    <div class="footer"><span><span class="dot"></span>CONDITIONING LAB.</span><span>THE REV. COLUMN</span></div>
  </section>
  <section class="media">
    <img src="${imageUrl}" alt="">
    <div class="mediaTag">NARA / SHIN-OMIYA</div>
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
  asset_version: safeVersion || null,
  thumbnail: outThumb,
  og: outOg,
  thumbnail_public: `/assets/images/blog/thumb-${slug}${versionSuffix}.jpg`,
  og_public: `/assets/images/blog/og/og-${slug}${versionSuffix}.jpg`
}));
