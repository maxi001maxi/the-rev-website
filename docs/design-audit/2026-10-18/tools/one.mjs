import { launch, setViewport, goto, shot, evaluate } from './cdp.mjs';
const [url, out, w, h] = process.argv.slice(2);
const c = await launch((process.env.TEMP || '/tmp') + '/rev-audit-chrome-profile-one', 9341);
await setViewport(c, +w, +h); await goto(c, url); await shot(c, out);
console.log(JSON.stringify(await evaluate(c, `(() => { const a = document.querySelector('.skip-link'); if (!a) return null; const r = a.getBoundingClientRect(); const s = getComputedStyle(a); return { x: r.x, y: r.y, w: r.width, h: r.height, bg: s.backgroundColor, visible: r.width > 0 && s.visibility !== 'hidden' }; })()`)));
c.close(); process.exit(0);
