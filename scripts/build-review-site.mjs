// Build isolated, review-only TOP v7 + Recovery v8 from approved local HTML exports.
// Does not run for production. Keep the current main deploy route unchanged.
import fs from 'node:fs';
import path from 'node:path';
const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.REV_STAGE_FULL_SITE === '1';
if (!isPreview) {
  console.log('[stage] skipping review-only page overlay outside preview');
  process.exit(0);
}
const root = process.cwd(), dest = path.join(root, 'dist');
if (!fs.existsSync(dest)) throw new Error('[stage] dist missing: run prepare-deploy first');
function readParts(name, total, expectedChars) {
  let all = '';
  for (let i = 0; i < total; i++) {
    const file = path.join(root, 'staging-src', name + '.part' + String(i).padStart(2,'0') + '.txt');
    if (!fs.existsSync(file)) throw new Error('Missing source segment: ' + file);
    all += fs.readFileSync(file,'utf8');
  }
  if (all.length !== expectedChars) throw new Error('Source length mismatch ' + name + ': '+all.length+' expected '+expectedChars);
  return all;
}
function standalone(src, page) {
  // The approved preview had a parent/iframe router. Replace it with real page URLs.
  const start = '<head><base href="https://therev-lab.com/"><script>(() => {';
  if (!src.startsWith('<!') || !src.includes(start)) throw new Error(page + ': preview HTML signature not found');
  const endMarker = 'window.__REV_INTEGRATED_PAGE__=currentPage;\n})();\n</script>';
  const startAt = src.indexOf(start), endAt = src.indexOf(endMarker,startAt);
  if (endAt<startAt) throw new Error(page + ': preview navigator end not found');
  let html = src.slice(0,startAt)+'<head>'+src.slice(endAt+endMarker.length);
  if(page==='top'){
    const old = "if (push) parent.postMessage({ type: 'rev-integrated-navigate', page: 'top', anchor: 'trial-' + t }, '*');";
    if (!html.includes(old)) throw new Error('TOP trial control signature missing');
    html=html.replace(old,"if (push && history.replaceState) history.replaceState(null, '', '#trial-' + t);");
    if(!html.includes('id="service"')||!html.includes('id="trial"'))throw new Error('TOP sections missing');
  }
  if (html.includes('rev-integrated-navigate')||html.includes('parent.location.href'))throw new Error(page + ': preview router still present');
  if (!html.includes('name="robots"')) html=html.replace(/<head>/,'<head><meta name="robots" content="noindex,nofollow">');
  // Explicit preview-only robots policy, not ready for production indexing.
  html=html.replace(/(<meta name="robots" content=")[^"]*(")/i,'$1noindex,nofollow$2');
  return html;
}
const top = standalone(readParts('top', 13, 7205652),'top');
const recovery = standalone(readParts('recovery',12,7124019),'recovery');
fs.writeFileSync(path.join(dest,'index.html'),top);
fs.writeFileSync(path.join(dest,'solution.html'),recovery);
console.log('[stage] approved pages restored:', top.length, recovery.length);
