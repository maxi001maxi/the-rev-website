// Shared by the renderer, operator, READY and Publish. Historical assets remain
// unchanged; every newly checked set must supply actual 320/400px evidence.
export const THUMBNAIL_TYPOGRAPHY_REVISION = 'thumbnail-typography-v1';
export const THUMBNAIL_TYPOGRAPHY_CUTOVER = '2026-10-01T03:39:13.000Z';
export const TYPOGRAPHY_VISUAL_CHECKS = Object.freeze([
  'immediately_readable', 'title_is_primary', 'whitespace_has_purpose',
  'natural_line_breaks', 'fade_contains_text', 'contrast_sufficient',
  'text_not_buried', 'article_recognizable'
]);

export function typographyAcceptanceRequired(qa = {}) {
  return Boolean(qa.thumbnail_typography_revision) ||
    Date.parse(qa.checked_at || '') >= Date.parse(THUMBNAIL_TYPOGRAPHY_CUTOVER);
}

export function typographyAcceptancePass(qa = {}) {
  const a = qa.thumbnail_typography_acceptance;
  if (qa.thumbnail_typography_revision !== THUMBNAIL_TYPOGRAPHY_REVISION ||
      !a || a.pass !== true || a.deterministic?.pass !== true) return false;
  return ['thumbnail', 'og', 'gbp'].every((variant) => {
    const m = a.deterministic.variants?.[variant];
    const v = a.visual?.[variant];
    return m?.pass === true && m.text_preserved === true && Array.isArray(m.lines) &&
      m.line_count === m.lines.length && m.font_size_at_320 >= 16 &&
      m.line_count >= 1 && m.line_count <= 4 &&
      (m.block_area_ratio >= 0.065 || (m.line_count === 1 && m.lines?.join('').length <= 10 && m.font_size >= 64)) && m.safe_area_pass === true &&
      m.line_balance >= 0.4 && m.width_occupancy >= 0.72 &&
      m.fade_contains_text === true && m.contrast_floor >= 7 &&
      /^[a-f0-9]{64}$/.test(m.asset_sha256 || '') &&
      [320, 400].every((w) => /^[a-f0-9]{64}$/.test(m.previews?.[w]?.sha256 || '')) &&
      v?.pass === true && TYPOGRAPHY_VISUAL_CHECKS.every((key) => v[key] === true);
  });
}

// Runs inside Chromium after document.fonts.ready. Word segmentation and actual
// glyph widths are used instead of character-count shrinking. Text is preserved.
export function fitThumbnailHeadline({ text, width, height, gbp = false, override = {} }) {
  const headline = document.querySelector('.headline');
  const style = getComputedStyle(headline);
  const flat = text.replace(/\r?\n/g, '').trim();
  const minSize = gbp ? 64 : 60;
  const maxSize = Math.min(gbp ? 96 : 90, Number(override.headline_size) || 96);
  const maxWidth = Math.min(520, Math.max(400, Number(override.max_width) || (gbp ? 420 : 520)));
  const left = Math.min(76, Math.max(48, Number(override.left) || 54));
  const lineHeight = 1.16;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const segments = [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(flat)];
  const boundaries = new Set([0, flat.length]);
  for (const s of segments) boundaries.add(s.index + s.segment.length);
  const preferred = new Set();
  let offset = 0;
  for (const line of text.split(/\r?\n/)) { offset += line.length; preferred.add(offset); }
  const closing = /^[、。！？!?）】」』ーぁぃぅぇぉゃゅょっ]/;
  const particle = /^(?:は|が|を|に|へ|と|で|も|や|の|だけ|まで|から|より|こそ)[、。！？!?]?$/;
  const verbTail = /^(?:る|い|いて|て|た|ない|なかっ|れる|られる|せる|か|ます|まし|です|でし)[、。！？!?]?$/;
  const weakEnd = /(?:って|とは|の)$/;
  for (const phrase of ['行く前後', '疲れた日']) {
    let at = flat.indexOf(phrase);
    while (at >= 0) {
      for (let pos = at + 1; pos < at + phrase.length; pos++) boundaries.delete(pos);
      at = flat.indexOf(phrase, at + phrase.length);
    }
  }
  const points = [...boundaries].sort((a, b) => a - b);
  // Complete adverbial phrases can stand together; never split before their に.
  const adverbEnding = /(?:静か|穏やか|丁寧|自然|軽やか)に$/;
  let best = null;
  for (let size = maxSize; size >= minSize; size--) {
    ctx.font = `700 ${size}px ${style.fontFamily}`;
    const measure = (s) => ctx.measureText(s).width + Math.max(0, s.length - 1) * size * 0.01;
    // Bounded search: existing copy is at most 34 characters / four lines.
    function visit(start, lines, widths, cost) {
      if (start === flat.length) {
        if (lines.length < 1 || lines.length > 4 || (lines.length === 1 && flat.length > 10)) return;
        const longest = Math.max(...widths), shortest = Math.min(...widths);
        const balance = shortest / longest;
        if (balance < 0.4 || longest / maxWidth < 0.72) return;
        const blockHeight = lines.length * size * lineHeight;
        if (blockHeight > height * 0.65 || (lines.length > 1 && longest * blockHeight / (width * height) < 0.065)) return;
        const score = size * 2 - cost - Math.max(0, lines.length - 2) * 30 - (1 - balance) * 24;
        if (!best || score > best.score) best = { lines, widths, size, score, balance, blockHeight, longest };
        return;
      }
      if (lines.length === 4) return;
      for (const end of points) {
        if (end <= start) continue;
        const line = flat.slice(start, end);
        if (line.replace(/[、。！？!?\s]/g, '').length < 2 || closing.test(line) || particle.test(line)) continue;
        const measured = measure(line);
        if (measured > maxWidth) break;
        if (end < flat.length && (closing.test(flat.slice(end)) || (weakEnd.test(line) && !adverbEnding.test(line)) ||
            particle.test(segments.find((s) => s.index === end)?.segment || '') ||
            verbTail.test(segments.find((s) => s.index === end)?.segment || ''))) continue;
        const boundaryCost = end === flat.length || preferred.has(end) || /[、。！？!?]$/.test(line) || adverbEnding.test(line) ? 0 : 25;
        visit(end, [...lines, line], [...widths, measured], cost + boundaryCost);
      }
    }
    visit(0, [], [], 0);
  }
  if (!best && gbp && maxWidth < 520 && !override.max_width) {
    return fitThumbnailHeadline({ text, width, height, gbp, override: { ...override, max_width: 520 } });
  }
  if (!best) throw new Error('Thumbnail Typography FAIL: no natural layout at readable size.');
  headline.replaceChildren(...best.lines.map((text) => {
    const span = document.createElement('span');
    span.className = 'headline-line'; span.textContent = text; return span;
  }));
  const top = gbp ? 132 : Math.round((height - best.blockHeight) * 0.48);
  Object.assign(headline.style, {
    fontSize: `${best.size}px`, fontWeight: '700', lineHeight: String(lineHeight),
    left: `${left}px`, top: `${top}px`, maxWidth: `${maxWidth}px`
  });
  const label = document.querySelector('.label');
  const hairline = document.querySelector('.hairline');
  Object.assign(label.style, { left: `${left}px`, top: `${top - 67}px` });
  Object.assign(hairline.style, { left: `${left}px`, top: `${top - 28}px` });
  // Near-opaque paper under every glyph; fade starts AFTER the measured text.
  const textRight = left + best.longest;
  const fadeStart = Math.ceil(textRight + 22);
  document.querySelector('.paper').style.background =
    `linear-gradient(90deg,#f7f4ec 0px,#f5f1e8 ${left}px,rgba(245,241,232,.96) ${fadeStart}px,rgba(245,241,232,.52) ${fadeStart + (gbp ? 30 : 55)}px,transparent ${fadeStart + (gbp ? 60 : 150)}px)`;
  if (gbp) {
    document.querySelector('.paper').style.maskImage = `linear-gradient(180deg,#000 0px,#000 ${top + best.blockHeight + 18}px,transparent ${top + best.blockHeight + 140}px)`;
  }
  const rect = headline.getBoundingClientRect();
  const lineRects = [...headline.children].map((span) => {
    const range = document.createRange(); range.selectNodeContents(span);
    const r = range.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
  });
  const safe = lineRects.every((r) => r.left >= 40 && r.right <= width - 40 && r.top >= 40 && r.bottom <= height - 40 && r.right <= fadeStart - 12);
  const metrics = {
    pass: safe, lines: best.lines, text_preserved: best.lines.join('') === flat,
    font_size: best.size, font_size_at_320: best.size * 320 / width,
    line_count: best.lines.length, line_height: lineHeight, line_balance: best.balance,
    width_occupancy: best.longest / maxWidth,
    block_area_ratio: best.longest * rect.height / (width * height),
    safe_area_pass: safe, fade_contains_text: safe, fade_start: fadeStart,
    // #2a2925 on 96% ivory over even a black photo has contrast above 11:1.
    contrast_floor: 11, line_rects: lineRects
  };
  if (!metrics.pass || !metrics.text_preserved) throw new Error('Thumbnail Typography FAIL: unsafe bounds.');
  return metrics;
}
