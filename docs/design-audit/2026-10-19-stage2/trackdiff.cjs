const fs = require('fs');
const A = 'C:/Users/hp/AppData/Local/Temp/claude/C--Projects-the-rev-website/74a8c45e-1ad6-4ed5-bed9-5ab315db767c/scratchpad/base/';
const B = 'C:/Projects/the-rev-p0/';
const files = ['index.html', 'solution.html', 'trainer.html', 'price.html', 'access.html', 'legal.html', 'privacy.html', 'terms.html', '404.html',
  'templates/partials/header.html', 'templates/partials/drawer.html', 'templates/partials/footer.html', 'templates/blog-index.html', 'templates/blog-post.html'];
const attr = (t, n) => { const m = t.match(new RegExp('\\s' + n + '="([^"]*)"')); return m ? m[1] : ''; };
const rows = h => {
  const m = new Map();
  for (const x of h.matchAll(/<a\b[^>]*>/g)) {
    const t = x[0];
    const href = attr(t, 'href').replace(/&amp;/g, '&');
    const tr = attr(t, 'data-track'), pl = attr(t, 'data-placement');
    if (!(tr || pl || /cl\.gyms\.jp|lin\.ee|instagram\.com/.test(href))) continue;
    const k = [tr, pl, href, attr(t, 'rel'), attr(t, 'target')].join(' | ');
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
};
let total = 0;
for (const f of files) {
  const a = fs.existsSync(A + f) ? rows(fs.readFileSync(A + f, 'utf8')) : new Map();
  const b = rows(fs.readFileSync(B + f, 'utf8'));
  const d = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) { const x = a.get(k) || 0, y = b.get(k) || 0; if (x !== y) d.push((y > x ? '+' : '-') + Math.abs(y - x) + ' ' + k); }
  console.log('##', f, `(before ${[...a.values()].reduce((s, v) => s + v, 0)}, after ${[...b.values()].reduce((s, v) => s + v, 0)})`, d.length ? '' : 'no diff');
  d.forEach(x => { console.log('  ', x); total++; });
}
console.log('total diff lines', total);
