// 使い方: node scripts/prepare-image-job-local.mjs <article.json>
// article.json: { slug, title, description, category, primary_query, image_headline_short, body_path }
// クラウド作業環境からは GitHub API を直接読めないため、一時的に lib/githubContent.mjs を
// 作業ツリー版に差し替えて画像ジョブ(editorial/hybrid-image-jobs/<slug>.json)を作り、必ず元に戻す。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = path.resolve('lib/githubContent.mjs');
const shim = path.resolve('scripts/local-shims/githubContent.local.mjs');
const spec = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const original = fs.readFileSync(target, 'utf8');
let exitCode = 0;
try {
  fs.writeFileSync(target, fs.readFileSync(shim, 'utf8'));
  const { prepareAutomatedHybridImageJob } = await import(pathToFileURL(path.resolve('lib/editorialAutomatedHybridImage.mjs')).href);
  const article = {
    slug: spec.slug, title: spec.title, description: spec.description, category: spec.category,
    primary_query: spec.primary_query, image_headline_short: spec.image_headline_short,
    body_markdown: fs.readFileSync(path.resolve(spec.body_path), 'utf8')
  };
  const r = await prepareAutomatedHybridImageJob(article);
  console.log(JSON.stringify(r, null, 2).slice(0, 2000));
} catch (e) {
  exitCode = 1;
  console.log('ERR', e.code || '', e.message, JSON.stringify(e.detail || e.details || {}).slice(0, 4000));
} finally {
  fs.writeFileSync(target, original);
}
process.exit(exitCode);
