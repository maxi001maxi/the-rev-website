// Vercelへ公開してよいファイルだけを /dist へ集める。
// content/*.md・scripts/*.mjs・templates/*・node_modules・package.json 等の
// 「サイトのソース」は本番配信物に含めない（/api Functionsは対象外＝Vercelが別途/apiを自動検出する）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const VERCEL_PREPARED_SENTINEL = path.join(ROOT, '.vercel-prepare-deploy-complete');

const ROOT_FILES = ['favicon.ico', 'robots.txt', 'sitemap.xml'];
const ROOT_DIRS = ['assets', 'blog', 'admin'];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function fingerprintRootStylesheet() {
  const cssPath = path.join(DIST, 'assets', 'css', 'style.css');
  if (!fs.existsSync(cssPath)) {
    throw new Error('[prepare-deploy] assets/css/style.css がdistにありません。');
  }

  const css = fs.readFileSync(cssPath);
  const fingerprint = crypto.createHash('sha256').update(css).digest('hex').slice(0, 12);
  const rootHtmlFiles = fs.readdirSync(DIST)
    .filter((entry) => entry.endsWith('.html') && fs.statSync(path.join(DIST, entry)).isFile());

  let updated = 0;
  for (const entry of rootHtmlFiles) {
    const htmlPath = path.join(DIST, entry);
    const before = fs.readFileSync(htmlPath, 'utf8');
    const after = before
      .replace(/href="assets\/css\/style\.css(?:\?v=[^"]*)?"/g, `href="assets/css/style.css?v=${fingerprint}"`)
      .replace(/href='assets\/css\/style\.css(?:\?v=[^']*)?'/g, `href='assets/css/style.css?v=${fingerprint}'`);

    if (after !== before) {
      fs.writeFileSync(htmlPath, after);
      updated += 1;
    }
  }

  if (updated === 0) {
    throw new Error('[prepare-deploy] style.css参照を持つルートHTMLが見つかりません。');
  }

  console.log(`[prepare-deploy] style.css fingerprint: ${fingerprint} / HTML更新: ${updated}件`);
}

function fingerprintPublicJavascript() {
  const names = ['main', 'unified-navigation', 'home-v7'];
  const hashes = Object.fromEntries(names.map(name => [name,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, 'assets', 'js', name + '.js'))).digest('hex').slice(0, 12)
  ]));
  const files = fs.readdirSync(DIST).filter(name => name.endsWith('.html')).map(name => path.join(DIST, name));
  function collect(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (entry.name.endsWith('.html')) files.push(file);
    }
  }
  if (fs.existsSync(path.join(DIST, 'blog'))) collect(path.join(DIST, 'blog'));
  let updated = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replace(/src=(["'])((?:\.\.\/)*\/?assets\/js\/(main|unified-navigation|home-v7)\.js)(?:\?[^"']*)?\1/g,
      (_, quote, url, name) => `src=${quote}${url}?v=${hashes[name]}${quote}`);
    if (after !== before) {fs.writeFileSync(file, after); updated++;}
  }
  console.log(`[prepare-deploy] public JS fingerprints: ${JSON.stringify(hashes)} / HTML更新: ${updated}件`);
}

function main() {
  // Vercelでは同一Deployment内で vercel-build が二重実行される場合がある。
  // 2回目にdistを削除すると、Vercelが1回目のdistをpackaging中にENOENT raceを起こすため、
  // 同一Vercel build filesystem内では2回目以降をno-opにする。
  if (process.env.VERCEL === '1' && fs.existsSync(VERCEL_PREPARED_SENTINEL) && fs.existsSync(DIST)) {
    console.log('[prepare-deploy] Vercel duplicate invocation detected; existing dist/ を再利用します');
    return;
  }

  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // ルート直下の *.html（index.html, trainer.html, price.html, ... 404.html）
  for (const entry of fs.readdirSync(ROOT)) {
    if (entry.endsWith('.html') && fs.statSync(path.join(ROOT, entry)).isFile()) {
      copyRecursive(path.join(ROOT, entry), path.join(DIST, entry));
    }
  }

  for (const f of ROOT_FILES) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) copyRecursive(src, path.join(DIST, f));
  }

  for (const d of ROOT_DIRS) {
    const src = path.join(ROOT, d);
    if (fs.existsSync(src)) copyRecursive(src, path.join(DIST, d));
  }

  // TOPを含むルートHTMLはstyle.cssの内容ハッシュ付きURLを参照する。
  // Xserver deploy側でもstyle.cssを明示上書きし、本番bytes一致を確認してからHTMLを切り替える。
  // Xserver/CDN/ブラウザに古いCSSが残り、REAL VOICE等のレイアウトだけ崩れる事故を防ぐ。
  fingerprintRootStylesheet();
  // Xserver serves JavaScript with a seven-day cache lifetime. A new URL is
  // required for returning visitors to receive navigation/tracking fixes.
  fingerprintPublicJavascript();

  if (process.env.VERCEL === '1') {
    fs.writeFileSync(VERCEL_PREPARED_SENTINEL, new Date().toISOString(), 'utf8');
  }

  console.log('[prepare-deploy] dist/ を作成しました（公開対象ファイルのみ）');
}

main();
