// Detect glyph fallback: for each text-bearing element, list platform fonts actually used.
process.on('unhandledRejection', e => { console.error('unhandled (ignored):', String(e).slice(0, 120)); });
import fs from 'node:fs';
import { launch, evaluate, setViewport, goto } from './cdp.mjs';
const [OUT, only] = process.argv.slice(2);
const PAGES = ['/', '/solution.html', '/trainer.html', '/price.html', '/access.html', '/blog/', '/blog/denba-health-device-mat-role/', '/legal.html', '/privacy.html', '/terms.html'];
const c = await launch((process.env.TEMP || '/tmp') + '/rev-audit-chrome-profile-fonts', 9340);
await c.send('DOM.enable'); await c.send('CSS.enable');
await setViewport(c, 1440, 900);
const out = {};
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT,'utf8')) : {};
for (const p of (only ? only.split(',') : PAGES)) { try {
  await goto(c, 'https://therev-lab.com' + p);
  await evaluate(c, `(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=700){scrollTo(0,y);await new Promise(r=>setTimeout(r,60));if(y>40000)break;}scrollTo(0,0);await document.fonts.ready;return 1})()`);
  const { root } = await c.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await c.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'h1,h2,h3,h4,p,li,dt,dd,a,span,strong,b,small,summary,button,td,th,figcaption,time,label' });
  const fallback = {};
  for (const id of nodeIds) {
    let r; try { r = await c.send('CSS.getPlatformFontsForNode', { nodeId: id }); } catch { continue; }
    const odd = r.fonts.filter(f => !/Zen Kaku Gothic New|Shippori Mincho|Jost|RV Glyph/i.test(f.familyName));
    if (!odd.length) continue;
    const { outerHTML } = await c.send('DOM.getOuterHTML', { nodeId: id });
    const text = outerHTML.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
    for (const f of odd) { (fallback[f.familyName] ||= []).push(`${f.glyphCount}g: ${text}`); }
  }
  for (const k in fallback) fallback[k] = [...new Set(fallback[k])].slice(0, 12);
  out[p] = fallback;
  prev[p] = fallback; fs.writeFileSync(OUT, JSON.stringify(prev, null, 1));
  console.log(p, Object.keys(fallback).map(k => k + ':' + fallback[k].length).join(' '));
} catch (e) { console.log(p, 'ERR', String(e).slice(0,100)); } }
c.close(); process.exit(0);
