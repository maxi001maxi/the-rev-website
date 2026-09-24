// Image-copy rules for THE REV. column cards.
// Article titles are informational/SEO text. Thumbnail copy is brand/editorial text.

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function validateImageHeadlineShort(value) {
  const normalized = cleanMultiline(value);
  const text = normalized.replace(/\n/g, '');
  const lines = normalized ? normalized.split('\n') : [];
  const errors = [];
  if (!text) errors.push('image headline is empty');
  if (text.length > 34) errors.push('image headline is too long');
  if (lines.length > 4) errors.push('image headline has too many lines');
  if (lines.some((line) => line.length > 18)) errors.push('image headline line is too long');
  if (/解説します|紹介します|徹底解説|完全版|必見/.test(text)) errors.push('image headline is too explanatory/promotional');
  return { ok: errors.length === 0, errors };
}

export function buildImageHeadlineShort(article) {
  const explicit = cleanMultiline(article?.imageHeadlineShort || article?.image_headline_short);
  if (explicit) return explicit;

  const title = clean(article?.title);
  const text = [title, clean(article?.description), clean(article?.bodyMarkdown)].join(' ');

  // Known editorial patterns. These are intentionally concise and brand-like.
  if (/健康診断|健診|血圧|血糖|脂質/.test(text)) {
    return '健診のあとこそ、\n無理なく始める。';
  }
  if (/仕事終わり|疲れている|疲れた日|疲労/.test(text)) {
    return '疲れた日は、\n軽く始めて決める。';
  }
  if (/初心者.*ボクシング|ボクシング.*初心者/.test(text)) {
    return '初心者だからこそ、\nパーソナル。';
  }
  if (/酸素|OXY|oxygen/i.test(text)) {
    return '鍛えたあとに、\n休む時間を。';
  }
  if (/体験|初回/.test(text)) {
    return '体験で見るのは、\n設備だけじゃない。';
  }
  if (/頻度|週.*回/.test(text)) {
    return '続けられる頻度を、\n最初に決める。';
  }
  if (/追い込|限界|強度/.test(text)) {
    return '追い込むだけが、\n正解ではない。';
  }
  if (/筋肉量.*増えない|体重.*変わらない|筋トレ.*無駄|体組成.*数字/.test(text)) {
    return '体重計に出ない、\n進歩がある。';
  }

  // Generic fallback: keep only the first semantic clause and avoid SEO stuffing.
  const first = title.split(/[？?。！!]/)[0].replace(/[「」『』]/g, '').trim();
  const stem = first.length > 28 ? first.slice(0, 28) : first;
  if (stem.length <= 18) return stem.endsWith('。') ? stem : stem + '。';

  // Unattended generation must never stall only because the SEO title is long.
  // Keep the semantic first clause, then deterministically wrap it into two short lines.
  const splitAt = Math.min(16, Math.ceil(stem.length / 2));
  const firstLine = stem.slice(0, splitAt);
  const secondLine = stem.slice(splitAt, 30);
  return firstLine + '\n' + secondLine + (secondLine.endsWith('。') ? '' : '。');
}

export function imageCopyIsArticleTitle(article, imageCopy) {
  return clean(article?.title).replace(/[\s\n]/g, '') === clean(imageCopy).replace(/[\s\n]/g, '');
}
