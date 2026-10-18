// Usage: node run.mjs <outDir> [mode]   mode = main | bounds
process.on('unhandledRejection', e => { console.error('unhandled (ignored):', String(e).slice(0, 120)); });
import fs from 'node:fs';
import path from 'node:path';
import { launch, evaluate, setViewport, goto, shot, click, key, sleep, withTimeout } from './cdp.mjs';

const OUT = process.argv[2];
const MODE = process.argv[3] || 'main';
const BASE = 'https://therev-lab.com';
const MEASURE = fs.readFileSync(new URL('./measure.js', import.meta.url), 'utf8');
const PAGES = [
  ['top', '/'], ['recovery', '/solution.html'], ['trainer', '/trainer.html'], ['price', '/price.html'],
  ['access', '/access.html'], ['blog', '/blog/'], ['blogcat', '/blog/category/recovery/'],
  ['post', '/blog/denba-health-device-mat-role/'], ['legal', '/legal.html'], ['privacy', '/privacy.html'],
  ['terms', '/terms.html'], ['404', '/no-such-page-audit']
];
const WIDTHS = MODE === 'main'
  ? [[1440, 900], [1280, 800], [768, 1024], [390, 844], [375, 812]]
  : [[1500, 900], [1400, 900], [1399, 900], [1200, 800], [1199, 800], [1024, 768], [861, 900], [860, 900], [641, 900], [640, 900], [360, 740]];
const PAGE_FILTER = process.argv[4] ? process.argv[4].split(',') : (MODE === 'bounds' ? ['top', 'recovery', 'trainer', 'price', 'blog', 'post'] : null);

const drawerProbe = `(() => {
  const d = document.querySelector('.rev-native-drawer:not([hidden]), .rev-drawer[aria-hidden="false"]');
  if (!d) return { open: false };
  const r = d.getBoundingClientRect(); const s = getComputedStyle(d);
  const a = document.activeElement;
  const links = [...d.querySelectorAll('nav a')].map(x => { const rr = x.getBoundingClientRect(); const ss = getComputedStyle(x); return { t: (x.innerText||'').replace(/\\s+/g,' ').trim(), y: Math.round(rr.y), h: Math.round(rr.height), fs: ss.fontSize, fw: ss.fontWeight, ff: ss.fontFamily.slice(0,40), ls: ss.letterSpacing, color: ss.color, current: x.getAttribute('aria-current') }; });
  const cta = [...d.querySelectorAll('a')].filter(x => /予約|LINE|Instagram/.test(x.innerText)).map(x => { const rr = x.getBoundingClientRect(); const ss = getComputedStyle(x); return { t: x.innerText.trim().replace(/\\s+/g,' '), y: Math.round(rr.y), h: Math.round(rr.height), w: Math.round(rr.width), bg: ss.backgroundColor, color: ss.color, radius: ss.borderRadius, fs: ss.fontSize }; });
  const close = d.querySelector('[data-menu-close], .rev-drawer-close');
  const cr = close && close.getBoundingClientRect();
  return { open: true, cls: d.className, rect: { y: r.y, h: r.height, w: r.width }, bg: s.backgroundColor, opacity: s.opacity, z: s.zIndex,
    overflowY: s.overflowY, contentH: d.scrollHeight, bodyPos: document.body.style.position, bodyOverflow: getComputedStyle(document.body).overflow,
    active: a ? (a.tagName + ' ' + (a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,20)) : null, activeInside: d.contains(a),
    close: close ? { label: (close.innerText||'').trim(), x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
    links, cta };
})()`;

const results = [];
const errors = [];
let c = await launch(path.join((process.env.TEMP || '/tmp'), 'chrome-profile-' + MODE), MODE === 'main' ? 9333 : 9334);
let current = ''; const reqUrl = new Map();
const onMsg = m => {
  if (m.method === 'Network.requestWillBeSent') reqUrl.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Runtime.exceptionThrown') errors.push({ page: current, type: 'exception', text: m.params.exceptionDetails.exception?.description?.slice(0, 300) || m.params.exceptionDetails.text });
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push({ page: current, type: 'console', text: m.params.args.map(a => a.value || a.description).join(' ').slice(0, 300) });
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/ERR_BLOCKED_BY_CLIENT/.test(m.params.entry.text)) errors.push({ page: current, type: 'log', text: (m.params.entry.text + ' ' + (m.params.entry.url || '')).slice(0, 300) });
  if (m.method === 'Network.loadingFailed' && m.params.errorText !== 'net::ERR_BLOCKED_BY_CLIENT' && !m.params.canceled) errors.push({ page: current, type: 'netfail', text: m.params.errorText + ' ' + (m.params.blockedReason||'') + ' ' + (reqUrl.get(m.params.requestId)||'').slice(0,160) });
};
c.on(onMsg);
const PROFILE = path.join((process.env.TEMP || '/tmp'), 'chrome-profile-' + MODE);

for (const [w, h] of WIDTHS) {
  for (const [name, p] of PAGES) {
    if (PAGE_FILTER && !PAGE_FILTER.includes(name)) continue;
    current = `${name}@${w}`;
    const tag = `${name}-${w}`;
    const rec = { page: name, path: p, width: w, height: h };
    if (fs.existsSync(path.join(OUT, tag + '-b-scrolled.jpg'))) { continue; }
    if (!c.isAlive()) { try { c.close(); } catch {} c = await launch(PROFILE + '-' + Date.now(), 9400 + Math.floor(Math.random()*500)); c.on(onMsg); }
    await setViewport(c, w, h);
    try { await withTimeout((async () => {
      await goto(c, BASE + p);
      await shot(c, path.join(OUT, `${tag}-a-top.jpg`));
      rec.top = await evaluate(c, MEASURE);
      await evaluate(c, 'window.scrollTo(0, 900)'); await sleep(700);
      await shot(c, path.join(OUT, `${tag}-b-scrolled.jpg`));
      rec.scrolled = await evaluate(c, MEASURE);
      await evaluate(c, 'window.scrollTo(0, 0)'); await sleep(500);
      const tg = rec.top.header && rec.top.header && rec.top.toggle;
      if (tg) {
        // open from a scrolled position to test scroll restoration
        await evaluate(c, 'window.scrollTo(0, 600)'); await sleep(500);
        const t = (await evaluate(c, MEASURE)).toggle;
        await click(c, t.rect.x + t.rect.w / 2, t.rect.y + t.rect.h / 2); await sleep(700);
        await shot(c, path.join(OUT, `${tag}-c-menu.jpg`));
        rec.drawer = await evaluate(c, drawerProbe);
        const tabTrail = [];
        for (let i = 0; i < 16; i++) { await key(c, 'Tab'); tabTrail.push(await evaluate(c, `(() => { const a = document.activeElement; const d = document.querySelector('.rev-native-drawer:not([hidden]), .rev-drawer[aria-hidden="false"]'); return (d && d.contains(a) ? 'in' : 'OUT') + ':' + (a.innerText || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 12); })()`)); }
        rec.drawerTab = tabTrail;
        await key(c, 'Escape'); await sleep(500);
        rec.afterEsc = await evaluate(c, `({ scrollY, focused: (document.activeElement.getAttribute('aria-label') || document.activeElement.tagName), expanded: (document.querySelector('#menu-toggle, .nav-toggle')||{}).getAttribute?.('aria-expanded'), bodyPos: document.body.style.position })`);
      }
      if (MODE === 'main' && process.env.FULL === '1') {
        // trigger reveal animations / lazy images, then capture the full page
        const H = await evaluate(c, 'document.documentElement.scrollHeight');
        for (let y = 0; y < H; y += Math.round(h * 0.8)) { await evaluate(c, `window.scrollTo(0, ${y})`); await sleep(160); }
        await evaluate(c, 'window.scrollTo(0, 0)'); await sleep(800);
        await shot(c, path.join(OUT, `${tag}-z-full.jpg`), { full: true, quality: 62 });
      }
    })(), 240000, tag); } catch (e) { rec.error = String(e).slice(0, 300); try { c.close(); } catch {} c = await launch(PROFILE + '-w' + Date.now(), 9400 + Math.floor(Math.random()*500)); c.on(onMsg); }
    results.push(rec); fs.appendFileSync(path.join(OUT, 'metrics-' + MODE + '.jsonl'), JSON.stringify(rec) + '\n');
    process.stdout.write(`${tag} ${rec.error ? 'ERR ' + rec.error : 'ok'}\n`);
  }
}
fs.writeFileSync(path.join(OUT, `metrics-${MODE}.json`), JSON.stringify({ results, errors }, null, 1));
c.close();
process.exit(0);
