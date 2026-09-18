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

  // Generic fallback: keep only the first semantic clause and avoid SEO stuffing.
  const first = title.split(/[？?。！!]/)[0].replace(/[「」『』]/g, '').trim();
  const clipped = first.length > 28 ? first.slice(0, 27) + '。' : (first.endsWith('。') ? first : first + '。');
  return clipped;
}

export function imageCopyIsArticleTitle(article, imageCopy) {
  return clean(article?.title).replace(/[\s\n]/g, '') === clean(imageCopy).replace(/[\s\n]/g, '');
}
