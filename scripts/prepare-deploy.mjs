// Vercelへ公開してよいファイルだけを /dist へ集める。
// content/*.md・scripts/*.mjs・templates/*・node_modules・package.json 等の
// 「サイトのソース」は本番配信物に含めない（/api Functionsは対象外＝Vercelが別途/apiを自動検出する）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

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

function main() {
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

  console.log('[prepare-deploy] dist/ を作成しました（公開対象ファイルのみ）');
}

main();
