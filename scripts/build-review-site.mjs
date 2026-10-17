// Compatibility entry: canonical pages are identical for every environment.
// Only the preview indexing policy changes; no page overlay or prototype runtime.
import fs from 'node:fs';
import path from 'node:path';
const preview = process.env.VERCEL_ENV === 'preview' || process.env.REV_STAGE_FULL_SITE === '1';
const dist = path.resolve('dist');
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if(entry.name !== 'assets' && entry.name !== 'admin') walk(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    let html = fs.readFileSync(file,'utf8');
    const robots = /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/gi;
    const originalTag = html.match(robots)?.[0] || '';
    const originalPolicy = originalTag.match(/\bcontent=["']([^"']*)["']/i)?.[1] || 'index,follow';
    const policy = preview ? 'noindex,nofollow' : originalPolicy;
    html = html.replace(robots, '');
    html = html.replace(/<head\b[^>]*>/i, '$&\n<meta name="robots" content="' + policy + '">');
    fs.writeFileSync(file, html);
  }
}
walk(dist);
if (preview) fs.writeFileSync(path.join(dist,'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log('[site] canonical TOP v7 / Recovery v8; indexing:', preview ? 'preview noindex' : 'production indexable');
