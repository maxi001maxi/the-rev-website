// P0 header verification: static server + headless Chrome (CDP, no npm deps).
// usage: node p0-measure.mjs <repoRoot> <outDir> [label]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, setViewport, goto, shot, evaluate } from './cdp.mjs';

const [root, outDir, label = 'run'] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(root, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const PAGES = (process.env.PAGES || 'index.html,solution.html,trainer.html,price.html,access.html,legal.html,privacy.html,terms.html,blog/index.html,blog/personal-training-frequency/').split(',');
const WIDTHS = (process.env.WIDTHS || '1500,1440,1400,1399,1280,1024,861,768,390').split(',').map(Number);
const SHOT = process.env.SHOT ? process.env.SHOT.split(',') : [];

const PROBE = `(() => {
  const parse = s => { const m = s.match(/rgba?[(]([^)]+)[)]/); if (!m) return [0,0,0,0]; const a = m[1].split(',').map(x=>parseFloat(x)); return [a[0],a[1],a[2],a.length>3?a[3]:1]; };
  const over = (f,b) => { const a=f[3]; return [f[0]*a+b[0]*(1-a), f[1]*a+b[1]*(1-a), f[2]*a+b[2]*(1-a), 1]; };
  const lum = c => { const t = c.slice(0,3).map(v => { v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4); }); return .2126*t[0]+.7152*t[1]+.0722*t[2]; };
  const ratio = (a,b) => { const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  // effective background: stack of element backgrounds up the tree, composited bottom-up over white
  const eff = el => { const stack=[]; for (let e=el; e; e=e.parentElement) { const c=parse(getComputedStyle(e).backgroundColor); if (c[3]>0) stack.push(c); if (c[3]===1) break; } let acc=[255,255,255,1]; for (let i=stack.length-1;i>=0;i--) acc=over(stack[i],acc); return acc; };
  const vis = el => { const r=el.getBoundingClientRect(), s=getComputedStyle(el); return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'; };
  const out = { header: null, items: [] };
  const h = document.querySelector('header.site-header, #site-header, header');
  if (!h) return out;
  const hs = getComputedStyle(h);
  out.header = { cls: h.className, bg: hs.backgroundColor, pos: hs.position, scrolled: h.classList.contains('scrolled') || h.classList.contains('rev-is-scrolled') };
  const add = (kind, el, fg, bgEl, need) => { const bg = eff(bgEl); const f = over(fg, bg); out.items.push({ kind, text: (el.textContent||'').trim().slice(0,14), fg: f.slice(0,3).map(Math.round).join(','), bg: bg.slice(0,3).map(Math.round).join(','), ratio: +ratio(f,bg).toFixed(2), need }); };
  h.querySelectorAll('.nav .nav-link').forEach(a => { if (vis(a)) add('nav', a, parse(getComputedStyle(a).color), a, 4.5); });
  h.querySelectorAll('.nav .cta-mini, a[data-placement*="header"]').forEach(a => { if (vis(a) && a.closest('.nav')) add('cta', a, parse(getComputedStyle(a).color), a, 4.5); });
  const t = h.querySelector('.nav-toggle, #menu-toggle'); if (t && vis(t)) { const sp = t.querySelector('span'); if (sp && parse(getComputedStyle(sp).backgroundColor)[3] > 0) add('burger', sp, parse(getComputedStyle(sp).backgroundColor), t, 3); }
  return out;
})()`;

const results = [];
const c = await launch((process.env.TEMP || '/tmp') + `/rev-p0-chrome-${label}`, 9300 + Math.floor(Math.random() * 600));
for (const page of PAGES) for (const w of WIDTHS) {
  await setViewport(c, w, 900);
  await goto(c, `${base}/${page}`);
  await evaluate(c, `new Promise(r=>setTimeout(r,1200))`); // loader
  for (const sc of [0, 900]) {
    await evaluate(c, `window.scrollTo(0,${sc}); new Promise(r=>setTimeout(r,900))`);
    const r = await evaluate(c, PROBE);
    const fails = r.items.filter(i => i.ratio < i.need);
    results.push({ page, w, scroll: sc, header: r.header, min: r.items.length ? Math.min(...r.items.map(i => i.ratio)) : null, fails, items: r.items });
    if (SHOT.includes(`${page}@${w}@${sc}`)) await shot(c, path.join(outDir, `${page.replace(/[\/.]/g, '_')}-${w}-s${sc}.jpg`));
  }
}
c.close(); server.close();
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `contrast-${label}.json`), JSON.stringify(results, null, 1));
const bad = results.filter(r => r.fails.length);
console.log(`${label}: ${results.length} states, ${bad.length} with failures`);
for (const r of bad) console.log(`FAIL ${r.page}@${r.w} scroll=${r.scroll} ` + r.fails.map(f => `${f.kind}"${f.text}" ${f.ratio}<${f.need}`).join('; '));
process.exit(0);
