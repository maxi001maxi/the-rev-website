// Blog一覧のカード公開日検証（Deploy to Xserver の plain /blog/ freshness 用）。
// shell → node -e → RegExp の多重エスケープを避けるため、検証ロジックはここに集約する。
//   node scripts/verify-blog-card-dates.mjs <corpus.html> <expectations-file>
//   expectations-file: 1行 "slug|YYYY.MM.DD"
// 1件でも (slug不在 / カード不正 / 日付不一致) があれば全件を報告して exit 1。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CARD_OPEN = '<article class="blog-card">';
const CARD_CLOSE = '</article>';
const DATE_RE = /<time class="blog-card-date"[^>]*>([^<]+)<\/time>/;

export function verifyCardDate(html, slug, expectedDate) {
  const marker = `data-article-slug="${slug}"`;
  const at = html.indexOf(marker);
  if (at < 0) return { ok: false, reason: 'slug-missing' };
  const start = html.lastIndexOf(CARD_OPEN, at);
  const end = html.indexOf(CARD_CLOSE, at);
  if (start < 0 || end < 0) return { ok: false, reason: 'card-malformed' };
  const card = html.slice(start, end + CARD_CLOSE.length);
  const m = card.match(DATE_RE);
  if (!m) return { ok: false, reason: 'date-missing' };
  const actual = m[1].trim();
  return actual === expectedDate
    ? { ok: true, actual }
    : { ok: false, reason: 'date-mismatch', actual };
}

export function parseExpectations(text) {
  return String(text).split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf('|');
    return { slug: l.slice(0, i), date: l.slice(i + 1) };
  });
}

function main() {
  const [corpusFile, expectationsFile] = process.argv.slice(2);
  if (!corpusFile || !expectationsFile) {
    console.error('usage: verify-blog-card-dates.mjs <corpus.html> <expectations-file>');
    process.exit(2);
  }
  const html = fs.readFileSync(corpusFile, 'utf8');
  const expectations = parseExpectations(fs.readFileSync(expectationsFile, 'utf8'));
  if (!expectations.length) {
    console.error('Plain Blog card dates: no expectations supplied');
    process.exit(1);
  }
  let failed = 0;
  for (const { slug, date } of expectations) {
    const r = verifyCardDate(html, slug, date);
    if (!r.ok) {
      failed += 1;
      console.error(`Plain Blog card date mismatch: ${slug} expected ${date} (${r.reason}${r.actual ? `, actual ${r.actual}` : ''})`);
    }
  }
  if (failed) process.exit(1);
  console.log(`Blog card dates OK — ${expectations.length} articles`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
