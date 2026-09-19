// THE REV. — 公開ページの外部リンク実通信チェック（GitHub Actionsランナー上で実行）
//
// セッション環境からは外部への到達が制限されるため、実際のHTTP確認はここで行う。
//
// 判定方針（ユーザー指定）：
//   OK            … 最終的に2xx（リダイレクト追従後を含む）
//   BOT_BLOCKED   … 相手側がbot/自動アクセスを拒否している（403 / 405 / 429 / 999 /
//                   Cloudflare等のチャレンジ）。リンク切れとしては扱わない
//   UNVERIFIED    … タイムアウト・DNS・TLS等で判定できなかった
//   BROKEN        … 404等の明確な不在、または5xx
import fs from 'node:fs';
import { publishedBlogPages } from './published-blog-pages.mjs';

const BASE = process.env.BASE_URL?.replace(/\/$/, '');
const BYPASS = process.env.VERCEL_BYPASS_SECRET || '';
if (!BASE) { console.error('BASE_URL is required'); process.exit(1); }

const PAGES = [
  '/', '/solution.html', '/price.html', '/trainer.html', '/legal.html', '/privacy.html', '/terms.html', '/blog/',
  ...publishedBlogPages().map((page) => page.url)
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// 1) Previewの公開ページから外部リンクを収集
const found = new Map(); // url -> Set(pages)
for (const p of PAGES) {
  const r = await fetch(BASE + p, { headers: { 'x-vercel-protection-bypass': BYPASS, 'user-agent': UA } });
  if (!r.ok) { console.log(`::warning::${p} -> ${r.status}`); continue; }
  const html = await r.text();
  for (const m of html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)) {
    const u = decode(m[1]);
    if (!found.has(u)) found.set(u, new Set());
    found.get(u).add(p);
  }
}

// 2) 実通信で確認（同一オリジンは1件だけ確認して残りは代表扱いにはせず、全件確認する）
async function probe(url) {
  const opts = { redirect: 'follow', headers: { 'user-agent': UA, 'accept': 'text/html,application/xhtml+xml,image/*,*/*;q=0.8', 'accept-language': 'ja,en;q=0.9' } };
  for (const method of ['GET', 'HEAD']) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(url, { ...opts, method, signal: ctl.signal });
      clearTimeout(t);
      const finalUrl = r.url !== url ? r.url : null;
      if (r.status >= 200 && r.status < 300) {
        // Cloudflare等のチャレンジは200で返ることがある
        if (method === 'GET') {
          const body = (await r.text()).slice(0, 4000);
          if (/cf-browser-verification|Just a moment\.\.\.|__cf_chl|challenge-platform/i.test(body)) {
            return { state: 'BOT_BLOCKED', code: r.status, note: 'Cloudflare challenge', finalUrl };
          }
        }
        return { state: 'OK', code: r.status, finalUrl };
      }
      if ([401, 403, 405, 406, 429, 999].includes(r.status)) {
        if (method === 'GET') continue; // HEADで再試行
        return { state: 'BOT_BLOCKED', code: r.status, note: 'bot/automation rejected', finalUrl };
      }
      if (r.status >= 300 && r.status < 400) return { state: 'OK', code: r.status, note: 'redirect not followed', finalUrl };
      return { state: 'BROKEN', code: r.status, finalUrl };
    } catch (e) {
      if (method === 'HEAD') return { state: 'UNVERIFIED', code: null, note: String(e.cause?.code || e.name || e.message).slice(0, 60) };
    }
  }
  return { state: 'UNVERIFIED', code: null, note: 'both GET and HEAD failed' };
}

// <link rel="preconnect"> の裸オリジンは「リンク」ではなく接続先の予告であり、
// ドキュメントとしてGETすれば404になるのが正常。判定対象から外す。
const PRECONNECT_ONLY = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);
const urls = [...found.keys()].filter(u => !PRECONNECT_ONLY.has(u.replace(/\/$/, ''))).sort();
const rows = [];
for (const u of urls) {
  const res = await probe(u);
  rows.push({ url: u, pages: [...found.get(u)], ...res });
  console.log(`${res.state.padEnd(12)} ${String(res.code ?? '-').padEnd(4)} ${u.slice(0, 110)}${res.note ? '  (' + res.note + ')' : ''}`);
}

// 本番ドメイン（therev-lab.com）側の状況を切り分けるための追加診断。
// canonical / og:url に含まれる本番URLは、Blogが本番未公開の間は404になるのが正常。
// それ以外の404（例: 既存ページが本番で引けない）は本当の異常なので、
// リダイレクトの経路まで出して区別できるようにする。
const diag = [];
for (const u of rows.filter(r => r.url.includes('therev-lab.com')).map(r => r.url)) {
  try {
    const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': UA } });
    diag.push({ url: u, first: r.status, location: r.headers.get('location') || null, server: r.headers.get('server') || null, xVercelId: !!r.headers.get('x-vercel-id'), poweredBy: r.headers.get('x-powered-by') || null, cache: r.headers.get('x-vercel-cache') || null });
  } catch (e) { diag.push({ url: u, error: String(e.cause?.code || e.message).slice(0, 60) }); }
}

const S = [];
const w = s => S.push(s);
const icon = { OK: '✅', BOT_BLOCKED: '🟡', UNVERIFIED: '🟡', BROKEN: '❌' };
w('# 外部リンク実通信チェック'); w(''); w(`Target: \`${BASE}\` / 対象ページ ${PAGES.length}件 / ユニーク外部URL ${urls.length}件`); w('');
const counts = rows.reduce((a, r) => (a[r.state] = (a[r.state] || 0) + 1, a), {});
w(`**OK ${counts.OK || 0} / BOT_BLOCKED ${counts.BOT_BLOCKED || 0} / UNVERIFIED ${counts.UNVERIFIED || 0} / BROKEN ${counts.BROKEN || 0}**`); w('');
w('| 判定 | HTTP | URL | 備考 |'); w('|---|---|---|---|');
const order = { BROKEN: 0, UNVERIFIED: 1, BOT_BLOCKED: 2, OK: 3 };
for (const r of rows.sort((a, b) => order[a.state] - order[b.state] || a.url.localeCompare(b.url))) {
  w(`| ${icon[r.state]} ${r.state} | ${r.code ?? '-'} | \`${r.url.slice(0, 100)}\` | ${r.note || (r.finalUrl ? '→ ' + r.finalUrl.slice(0, 60) : '')} |`);
}
w(''); w('## 本番ドメイン therev-lab.com の配信元（リダイレクト前の生レスポンス）');
w('本番ドメインがこのVercelプロジェクトから配信されているかを確認する。');
w('x-vercel-id が付かない場合、そのURLはVercel以外のサーバから返っている。'); w('');
w('| URL | 初回HTTP | server | x-vercel-id | x-vercel-cache | Location |'); w('|---|---|---|---|---|---|');
for (const d of diag) w(`| \`${d.url.replace('https://therev-lab.com', '')||'/'}\` | ${d.first ?? d.error} | ${d.server || '—'} | ${d.xVercelId ? 'yes' : '**no**'} | ${d.cache || '—'} | ${d.location || '—'} |`);
fs.writeFileSync('external-links.json', JSON.stringify({ rows, diag }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, S.join('\n') + '\n');
console.log('\n' + S.join('\n'));
process.exit(counts.BROKEN ? 1 : 0);
