// Stage 2 verification (CDP, no npm deps): header geometry parity, contrast, overflow, JS errors,
// menu focus behaviour, sticky bar. usage: node stage2-verify.mjs <siteRoot> <out.json>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { launch, setViewport, goto, evaluate } from './cdp.mjs';
const [root, out] = process.argv.slice(2);
const PAGES = (process.env.PAGES || 'index.html,solution.html,trainer.html,price.html,access.html,legal.html,privacy.html,terms.html,blog/index.html,blog/category/boxing/,blog/boxing-beginner-first-step/,404.html').split(',');
const WIDTHS = (process.env.WIDTHS || '1500,1440,1400,1399,1280,1024,861,768,390,375').split(',').map(Number);
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]); let f = path.join(root, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;

const PROBE = `(() => {
  const parse = s => { const m = s.match(/rgba?[(]([^)]+)[)]/); if (!m) return [0,0,0,0]; const a = m[1].split(',').map(parseFloat); return [a[0],a[1],a[2],a.length>3?a[3]:1]; };
  const over = (f,b) => { const a=f[3]; return [f[0]*a+b[0]*(1-a), f[1]*a+b[1]*(1-a), f[2]*a+b[2]*(1-a), 1]; };
  const lum = c => { const t=c.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}); return .2126*t[0]+.7152*t[1]+.0722*t[2]; };
  const ratio = (a,b) => { const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  const h = document.querySelector('#site-header'); if (!h) return { noHeader: true };
  const dark = document.body.classList.contains('header-tone-dark') && scrollY < 24; const eff = el => { const st=[]; for (let e=el;e;e=e.parentElement){ const c=parse(getComputedStyle(e).backgroundColor); if(c[3]>0) st.push(c); if(c[3]===1) break; } let acc = (dark && h.contains(el)) ? [35,34,32,1] : [255,255,255,1]; for(let i=st.length-1;i>=0;i--) acc=over(st[i],acc); return acc; };
  const vis = el => { const r=el.getBoundingClientRect(), s=getComputedStyle(el); return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'; };
  
  const items = []; const add = (k,el,fg,bgEl,need) => { const bg=eff(bgEl), f=over(fg,bg); items.push({k, r:+ratio(f,bg).toFixed(2), need}); };
  h.querySelectorAll('nav ul a').forEach(a => { if (vis(a)) add('nav', a, parse(getComputedStyle(a).color), a, 4.5); });
  const res = h.querySelector('nav>a'); if (res && vis(res)) add('cta', res, parse(getComputedStyle(res).color), res, 4.5);
  const t = h.querySelector('#menu-toggle');
  if (t && vis(t)) { const sp = t.querySelector('[aria-hidden] span'); if (sp) add('burger', sp, parse(getComputedStyle(sp).backgroundColor), t, 3); add('menulabel', t, parse(getComputedStyle(t).color), t, 4.5); }
  const logos = [...h.querySelectorAll('.rev-home-logo')].map(i => ({ c: i.className.includes('dark')?'dark':'light', o:+getComputedStyle(i).opacity, w:Math.round(i.getBoundingClientRect().width*10)/10, x:Math.round(i.getBoundingClientRect().x*10)/10 }));
  const ul = h.querySelector('nav ul'); const hr = h.getBoundingClientRect();
  return { hdr:{ h:Math.round(hr.height*10)/10, pos:getComputedStyle(h).position }, logos, navFont: ul && vis(ul) ? getComputedStyle(ul).fontSize : null,
    resH: res && vis(res) ? Math.round(res.getBoundingClientRect().height) : null,
    toggle: t && vis(t) ? { w:Math.round(t.getBoundingClientRect().width), h:Math.round(t.getBoundingClientRect().height) } : null, items,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
})()`;

const MENU = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const t = document.querySelector('#menu-toggle'), d = document.querySelector('.rev-native-drawer');
  if (!t || !d || !t.getClientRects().length) return { skip: true };
  const y0 = scrollY; t.click(); await sleep(250);
  const r = { opened: !d.hidden, focusInside: d.contains(document.activeElement), locked: document.body.style.position === 'fixed' };
  const links = [...d.querySelectorAll('a[href],button')].filter(e => e.getClientRects().length); r.items = links.length;
  links.at(-1).focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key:'Tab', bubbles:true, cancelable:true })); r.wrapFwd = document.activeElement === links[0];
  links[0].focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key:'Tab', shiftKey:true, bubbles:true, cancelable:true })); r.wrapBack = document.activeElement === links.at(-1);
  document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true, cancelable:true })); await sleep(150);
  r.closed = d.hidden; r.focusBack = document.activeElement === t; r.restoredScroll = Math.abs(scrollY - y0) < 2; r.unlocked = document.body.style.position === '';
  return r;
})()`;

const STICKY = `(async () => {
  const s = document.getElementById('rev-sticky'); if (!s) return { none: true };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const a = !s.hidden; window.scrollTo({ top: 900, behavior: 'instant' }); await sleep(300); const b = !s.hidden;
  const r = s.getBoundingClientRect(), bk = s.querySelector('a');
  const res = { atTop: a, mid: b, h: Math.round(r.height), btnH: Math.round(bk.getBoundingClientRect().height) };
  document.querySelector('footer').scrollIntoView({ block: 'center', behavior: 'instant' }); await sleep(300); res.atEnd = !s.hidden; window.scrollTo({ top: 0, behavior: 'instant' }); return res;
})()`;

const results = [];
const c = await launch((process.env.TEMP || '/tmp') + '/rev-s2-' + Math.floor(Math.random() * 1e6), 9300 + Math.floor(Math.random() * 600));
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)));addEventListener('unhandledrejection',e=>__errs.push('rej:'+e.reason));" });
for (const page of PAGES) for (const w of WIDTHS) {
  await setViewport(c, w, 900); await goto(c, `${base}/${page}`); await evaluate(c, 'new Promise(r=>setTimeout(r,1800))');
  const rec = { page, w, states: [] };
  for (const sc of [0, 900]) { await evaluate(c, `window.scrollTo({top:${sc},behavior:"instant"});new Promise(r=>setTimeout(r,700))`); rec.states.push({ sc, ...await evaluate(c, PROBE) }); }
  await evaluate(c, 'window.scrollTo({top:0,behavior:"instant"})');
  if ([1399, 768, 390].includes(w)) rec.menu = await evaluate(c, MENU);
  if (w <= 768) rec.sticky = await evaluate(c, STICKY);
  rec.errs = await evaluate(c, 'window.__errs');
  results.push(rec);
}
c.close(); srv.close();
fs.writeFileSync(out, JSON.stringify(results, null, 1));

let bad = 0; const note = (r, m) => { bad++; console.log('FAIL', r.page, '@' + r.w, m); };
const top = {}; for (const r of results.filter(r => r.page === 'index.html')) top[r.w] = r.states[0];
for (const r of results) {
  for (const s of r.states) {
    if (s.noHeader) { note(r, 'no #site-header'); continue; }
    const photo = r.page === 'index.html' && s.sc === 0; for (const i of s.items) if (i.r < i.need && !photo) note(r, `scroll${s.sc} ${i.k} ${i.r}<${i.need}`);
    if (s.overflow) note(r, `overflow ${s.sw}>${s.cw}`);
    const t = top[r.w]?.hdr; if (t && Math.abs(s.hdr.h - t.h) > 0.5) note(r, `header height ${s.hdr.h} vs TOP ${t.h}`);
    const lg = s.logos.find(l => l.o > 0.5), tl = top[r.w]?.logos.find(l => l.o > 0.5);
    if (lg && tl && r.page !== 'index.html' && (Math.abs(lg.w - tl.w) > 0.5 || Math.abs(lg.x - tl.x) > 0.5)) note(r, `logo ${lg.w}@${lg.x} vs TOP ${tl.w}@${tl.x}`);
    if (top[r.w] && s.navFont !== top[r.w].navFont) note(r, `nav font ${s.navFont} vs TOP ${top[r.w].navFont}`);
  }
  if (r.errs?.length) note(r, 'js errors ' + r.errs.join('|'));
  const m = r.menu; if (m && !m.skip) for (const k of ['opened', 'focusInside', 'locked', 'wrapFwd', 'wrapBack', 'closed', 'focusBack', 'restoredScroll', 'unlocked']) if (!m[k]) note(r, 'menu ' + k);
  const s = r.sticky; if (s && !s.none) { if (s.atTop) note(r, 'sticky visible at top'); if (r.w <= 768 && !s.mid) note(r, 'sticky not shown mid-page'); if (s.atEnd) note(r, 'sticky overlaps footer'); }
}
console.log('done', results.length, 'page-widths;', bad, 'failures');
process.exit(0);
