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

function unique(values) {
  return [...new Set(values.map(cleanMultiline).filter(Boolean))];
}

function normalizeForSimilarity(value) {
  return cleanMultiline(value)
    .replace(/[\s\n、。！？!?・「」『』（）()｜|／/]/g, '')
    .toLowerCase();
}

function bigrams(value) {
  const s = normalizeForSimilarity(value);
  const set = new Set();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
}

function longestCommonSubstringLength(aValue, bValue) {
  const a = normalizeForSimilarity(aValue);
  const b = normalizeForSimilarity(bValue);
  if (!a || !b) return 0;
  const prev = new Array(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i += 1) {
    const curr = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      }
    }
    for (let j = 0; j < curr.length; j += 1) prev[j] = curr[j];
  }
  return best;
}

export function imageHeadlineSimilarity(a, b) {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const aa = bigrams(a);
  const bb = bigrams(b);
  const intersection = [...aa].filter((x) => bb.has(x)).length;
  const union = new Set([...aa, ...bb]).size || 1;
  const jaccard = intersection / union;

  const lcs = longestCommonSubstringLength(a, b);
  const lcsRatio = lcs / Math.max(1, Math.min(na.length, nb.length));
  return Math.max(jaccard, lcsRatio);
}

export function imageHeadlineIsRecentRepeat(candidate, recentHeadlines = []) {
  const normalized = normalizeForSimilarity(candidate);
  if (!normalized) return false;
  for (const recent of recentHeadlines) {
    const other = normalizeForSimilarity(recent);
    if (!other) continue;
    if (normalized === other) return true;

    const lcs = longestCommonSubstringLength(candidate, recent);
    const lcsRatio = lcs / Math.max(1, Math.min(normalized.length, other.length));
    if (lcs >= 4 && lcsRatio >= 0.42) return true;
    if (imageHeadlineSimilarity(candidate, recent) >= 0.55) return true;
  }
  return false;
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

function wrapTitleClause(value) {
  const text = clean(value).replace(/[「」『』]/g, '').replace(/[？?。！!]$/g, '');
  if (!text) return '';
  const stem = text.length > 28 ? text.slice(0, 28) : text;
  if (stem.length <= 18) return stem.endsWith('。') ? stem : stem + '。';
  const splitAt = Math.min(16, Math.ceil(stem.length / 2));
  const firstLine = stem.slice(0, splitAt);
  const secondLine = stem.slice(splitAt, 30);
  return firstLine + '\n' + secondLine + (secondLine.endsWith('。') ? '' : '。');
}

export function buildImageHeadlineCandidates(article) {
  const explicit = cleanMultiline(article?.imageHeadlineShort || article?.image_headline_short);
  if (explicit) return [explicit];

  const title = clean(article?.title);
  const text = [title, clean(article?.description), clean(article?.bodyMarkdown)].join(' ');
  let candidates = [];

  if (/新大宮/.test(text) && /(ジム|パーソナルジム)/.test(text) && /(選び|選ぶ|比較|設備)/.test(text)) {
    candidates = [
      '設備だけで、\n決めない。',
      '通いやすさまで、\n選ぶ基準に。',
      '使う場面まで、\n見て選ぶ。',
      '続ける目線で、\nジムを見る。'
    ];
  } else if (/健康診断|健診|血圧|血糖|脂質/.test(text)) {
    candidates = [
      '健診のあとこそ、\n無理なく始める。',
      '始める前に、\n状態を確かめる。',
      '数字を見たら、\nまず無理をしない。'
    ];
  } else if (/仕事終わり|疲れている|疲れた日|疲労/.test(text)) {
    candidates = [
      '疲れた日は、\n軽く始めて決める。',
      '疲労がある日は、\n強度を選び直す。',
      '行くかより、\n今日はどう動くか。'
    ];
  } else if (/初心者.*ボクシング|ボクシング.*初心者/.test(text)) {
    candidates = [
      '初心者だからこそ、\nパーソナル。',
      '最初は、\n基本を楽しむ。',
      '構えから、\n自分のペースで。'
    ];
  } else if (/酸素|OXY|oxygen/i.test(text)) {
    candidates = [
      '鍛えたあとに、\n休む時間を。',
      '頑張ったあとまで、\nコンディショニング。',
      '動いたあとは、\n回復へ切り替える。'
    ];
  } else if (/体験|初回/.test(text)) {
    candidates = [
      '体験で見るのは、\n設備だけじゃない。',
      '最初の一回で、\n相性を確かめる。',
      '続ける前に、\n使い方を見る。'
    ];
  } else if (/頻度|週.*回/.test(text)) {
    candidates = [
      '続けられる頻度を、\n最初に決める。',
      '回数より、\n続け方を決める。',
      '無理のないペースが、\n長く続く。'
    ];
  } else if (/追い込|限界|強度/.test(text)) {
    candidates = [
      '追い込むだけが、\n正解ではない。',
      '止めどきも、\nトレーニング。',
      '限界より、\nフォームを見る。'
    ];
  } else if (/筋肉量.*増えない|体重.*変わらない|筋トレ.*無駄|体組成.*数字/.test(text)) {
    candidates = [
      '体重計に出ない、\n進歩がある。',
      '数字だけでは、\n変化は測れない。',
      '変化は、\n体重以外にも出る。'
    ];
  }

  const titleClauses = title
    .split(/[｜|？?。！!]/)
    .map((x) => clean(x))
    .filter(Boolean);
  candidates.push(...titleClauses.map(wrapTitleClause));
  return unique(candidates);
}

export function buildImageHeadlineShort(article) {
  return buildImageHeadlineCandidates(article)[0] || '';
}

export function selectUniqueImageHeadlineShort(article, recentHeadlines = [], { window = 12 } = {}) {
  const recent = recentHeadlines.map(cleanMultiline).filter(Boolean).slice(0, Math.max(0, Number(window) || 0));
  const candidates = buildImageHeadlineCandidates(article)
    .filter((candidate) => validateImageHeadlineShort(candidate).ok);

  const selected = candidates.find((candidate) => !imageHeadlineIsRecentRepeat(candidate, recent)) || null;
  return {
    copy: selected,
    candidates,
    recentHeadlines: recent,
    blockedCandidates: candidates.filter((candidate) => imageHeadlineIsRecentRepeat(candidate, recent))
  };
}

export function imageCopyIsArticleTitle(article, imageCopy) {
  return clean(article?.title).replace(/[\s\n]/g, '') === clean(imageCopy).replace(/[\s\n]/g, '');
}
