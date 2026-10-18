// Viewport-by-viewport captures for readable visual review.
process.on('unhandledRejection', e => { console.error('unhandled (ignored):', String(e).slice(0, 120)); });
// Usage: node segs.mjs <outDir> <w:h,w:h> <page,page> [port]
import path from 'node:path';
import fs from 'node:fs';
import { launch, evaluate, setViewport, goto, shot, sleep, withTimeout } from './cdp.mjs';

const [OUT, sizes, pagesArg, port = '9335'] = process.argv.slice(2);
const MAP = { top: '/', recovery: '/solution.html', trainer: '/trainer.html', price: '/price.html', access: '/access.html',
  blog: '/blog/', blogcat: '/blog/category/recovery/', post: '/blog/denba-health-device-mat-role/', legal: '/legal.html',
  privacy: '/privacy.html', terms: '/terms.html', '404': '/no-such-page-audit' };
let c = await launch((process.env.TEMP || '/tmp') + '/rev-audit-chrome-profile-segs-' + port, +port);
for (const s of sizes.split(',')) {
  const [w, h] = s.split(':').map(Number);
  for (const name of pagesArg.split(',')) {
    if (fs.existsSync(path.join(OUT, name + '-' + w, '00.jpg'))) continue;
    if (!c.isAlive()) { c = await launch((process.env.TEMP || '/tmp') + '/rev-audit-chrome-profile-segs-r' + Date.now(), 9400 + Math.floor(Math.random()*500)); }
    try { await withTimeout((async () => {
    await setViewport(c, w, h);
    await goto(c, 'https://therev-lab.com' + MAP[name]);
    const H = await evaluate(c, 'document.documentElement.scrollHeight');
    let i = 0;
    for (let y = 0; y < H; y += h) {
      await evaluate(c, `window.scrollTo(0, ${y})`); await sleep(650);
      await shot(c, path.join(OUT, `${name}-${w}`, `${String(i).padStart(2, '0')}.jpg`), { quality: 70 });
      i++; if (i > 40) break;
    }
    console.log(name, w, i, 'segments');
    })(), 150000, name); } catch (e) { console.log(name, w, 'ERR', String(e).slice(0,200)); try { c.close(); } catch {} c = await launch((process.env.TEMP || '/tmp') + '/rev-audit-chrome-profile-segs-w' + Date.now(), 9400 + Math.floor(Math.random()*500)); }
  }
}
c.close(); process.exit(0);
