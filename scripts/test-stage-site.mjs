// Mandatory build-time checks for the isolated THE REV. prepublish site.
// Intentionally no browser emulator: this checks the built file relationships.
// Visual/interaction QA is maintained separately.
import fs from 'node:fs';
import path from 'node:path';
const active = process.env.REV_STAGE_FULL_SITE === '1' ||
  (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'feature/unified-v7-header-20261015');
if (!active) { console.log('[stage-qa] skipped outside the designated preview'); process.exit(0); }
const dist=path.resolve('dist');
const routes={ '/':'index.html','/solution.html':'solution.html','/trainer.html':'trainer.html',
  '/price.html':'price.html','/blog/':'blog/index.html','/access.html':'access.html'};
const read=(relative)=>{const full=path.join(dist,relative);if(!fs.existsSync(full)) throw new Error('Missing: '+relative);
  const s=fs.readFileSync(full,'utf8');if(!s.includes('</html>')) throw new Error('Truncated HTML: '+relative);return s;};
const pages=Object.fromEntries(Object.entries(routes).map(([route,file])=>[route,read(file)]));
const top=pages['/'],rec=pages['/solution.html'];
if(!top.includes('id="service"') || !top.includes('id="trial"') || !top.includes('ちゃんと向き合う時間')) throw new Error('Approved TOP markers or anchors missing');
if(!rec.includes('rv-denba') || !rec.includes('DENBA') || !rec.includes('id="top"')) throw new Error('Recovery markers/anchor missing');
for(const route of ['/','/solution.html']){
  if(!/name="robots"\s+content="noindex,nofollow"/i.test(pages[route]))throw new Error('Preview index policy absent: '+route);
}
const labels=['サービス','リカバリー','トレーナー','料金','コラム','初回体験','アクセス'];
for(const [route,s] of Object.entries(pages)){
  const h=s.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)?.[0];
  if(!h)throw new Error('Header missing: '+route);
  for(const label of labels)if(!h.includes(label))throw new Error('Missing navigation label: '+label+' '+route);
  const a=[...h.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)].map(m=>m[1].replace(/&amp;/g,'&'));
  for(const target of ['/solution.html','/trainer.html','/price.html','/blog/','/access.html']){
    if(route===target)continue;
    if(!a.some(href=>href===target))throw new Error('Broken header route '+route+' -> '+target);
  }
  if(!a.some(href=>href==='#service'||href==='/#service'))throw new Error('Service route missing: '+route);
  if(!a.some(href=>href==='#trial'||href==='/#trial'))throw new Error('Trial route missing: '+route);
  if(!a.some(href=>href.startsWith('https://cl.gyms.jp/')))throw new Error('Booking button missing: '+route);
  if(route!=='/' && route!=='/solution.html' && !s.includes('unified-header-v7.css'))
    throw new Error('Shared header stylesheet absent: '+route);
}
const css=path.join(dist,'assets/css/unified-header-v7.css');
if(!fs.existsSync(css))throw new Error('Shared CSS is missing from distribution');
console.log('[stage-qa] PASS: 6 real pages, linked headers, anchors, booking, preview robots and CSS');
