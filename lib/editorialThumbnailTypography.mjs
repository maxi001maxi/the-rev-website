// Shared by the renderer, operator, READY and Publish. Historical assets remain
// unchanged; every newly checked set must supply actual 320/400px evidence.
export const THUMBNAIL_TYPOGRAPHY_REVISION = 'thumbnail-golden-typography-v1';
export const THUMBNAIL_TYPOGRAPHY_CUTOVER = '2026-10-01T06:59:53.000Z';
export const GOLDEN_REFERENCE_REVISION = 'approved-typography-20261001-v1';
export const GOLDEN_REFERENCE_ASSETS = Object.freeze([
  { variant: 'wide', path: 'editorial/typography-golden-reference/reference-16x9.png', sha256: 'ad6b5724177e691b6c56a7379b18550615937a4d4c8259f9bb786f73c5690f3e' },
  { variant: 'gbp', path: 'editorial/typography-golden-reference/reference-gbp-4x3.png', sha256: '9d60770cbeb79eb12ac9e2ecfa937ca001c5ba23916de51f4196ba8d04648640' },
  { variant: 'list', path: 'editorial/typography-golden-reference/reference-list-view.png', sha256: 'c1c48d0190179b18a0b1668605672a46d6805ea50bf216734693f5c535525cb7' }
]);
// Typography rules only. Scene generation, image sizing and object-position are
// deliberately outside this contract. OGP uses the wide grammar at its own height.
export const GOLDEN_LAYOUT_RULES = Object.freeze({
  wide: Object.freeze({ id: 'golden-wide-v1', left: 64, maxWidth: 520,
    supportMax: 78, supportMin: 60, focusMax: 136, closingRatio: 1.18,
    lineGap: 12, top: null, labelSize: 15, fadeTail: 166, fadeVerticalTail: null }),
  gbp: Object.freeze({ id: 'golden-gbp-v1', left: 60, maxWidth: 440,
    supportMax: 68, supportMin: 60, focusMax: 112, closingRatio: 1.12,
    lineGap: 10, top: 200, labelSize: 14, fadeTail: 108, fadeVerticalTail: 150 })
});
export const ART_DIRECTION_CHECKS = Object.freeze([
  'not_size_only', 'photo_text_hierarchy_natural', 'whitespace_meaningful',
  'no_white_board', 'keyword_hierarchy_present', 'format_layout_independent',
  'not_generic_template', 'premium_rev_preserved', 'inviting_at_list_size',
  'thumbnail_functional', 'golden_grammar_matches'
]);
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
      !a || a.pass !== true || a.deterministic?.pass !== true || a.art_direction?.pass !== true ||
      a.golden_reference?.revision !== GOLDEN_REFERENCE_REVISION ||
      !GOLDEN_REFERENCE_ASSETS.every((ref) => a.golden_reference.assets?.some((r) =>
        r.path === ref.path && r.sha256 === ref.sha256))) return false;
  return ['thumbnail', 'og', 'gbp'].every((variant) => {
    const m = a.deterministic.variants?.[variant];
    const v = a.visual?.[variant];
    const art = a.art_direction.variants?.[variant];
    return m?.pass === true && m.text_preserved === true && Array.isArray(m.lines) &&
      m.line_count === m.lines.length && m.font_size_at_320 >= 16 &&
      m.line_count >= 1 && m.line_count <= 4 &&
      (m.block_area_ratio >= 0.065 || (m.line_count === 1 && m.lines?.join('').length <= 10 && m.font_size >= 60)) && m.safe_area_pass === true &&
      m.line_balance >= 0.4 && m.width_occupancy >= 0.65 &&
      m.layout_rule === GOLDEN_LAYOUT_RULES[variant === 'gbp' ? 'gbp' : 'wide'].id &&
      m.hierarchy_pass === true && m.focus_scale >= (m.hierarchy_kind === 'inline' && m.line_count === 1 ? 1.2 : 1.3) &&
      m.fade_contains_text === true && m.contrast_floor >= 4.5 &&
      /^[a-f0-9]{64}$/.test(m.asset_sha256 || '') &&
      [320, 400].every((w) => /^[a-f0-9]{64}$/.test(m.previews?.[w]?.sha256 || '')) &&
      v?.pass === true && TYPOGRAPHY_VISUAL_CHECKS.every((key) => v[key] === true) &&
      art?.pass === true && ART_DIRECTION_CHECKS.every((key) => art[key] === true);
  });
}

// Runs inside Chromium after document.fonts.ready. Word segmentation and actual
// glyph widths are used instead of character-count shrinking. Text is preserved.
export function fitThumbnailHeadline({ text, width, height, gbp = false, override = {}, rule }) {
  const headline = document.querySelector('.headline');
  const style = getComputedStyle(headline);
  const flat = text.replace(/\r?\n/g, '').trim();
  if (!rule?.id) throw new Error('Thumbnail Typography FAIL: missing format-specific golden rule.');
  const minSize = rule.supportMin;
  const maxSize = Math.min(rule.supportMax, Number(override.headline_size) || rule.supportMax);
  const maxWidth = Math.min(rule.maxWidth, Math.max(400, Number(override.max_width) || rule.maxWidth));
  const left = Math.min(76, Math.max(48, Number(override.left) || rule.left));
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
    const measure = (s, fontSize, weight = 500) => {
      ctx.font = `${weight} ${fontSize}px ${style.fontFamily}`;
      return ctx.measureText(s).width + Math.max(0, s.length - 1) * fontSize * 0.01;
    };
    // Bounded search: existing copy is at most 34 characters / four lines.
    function visit(start, lines, widths, cost) {
      if (start === flat.length) {
        if (lines.length < 1 || lines.length > 4 || (lines.length === 1 && flat.length > 10)) return;
        // Prefer a complete adverbial center phrase; otherwise emphasize the
        // shortest meaningful line. Copy is never generated or rewritten here.
        const adverb = lines.findIndex((line) => adverbEnding.test(line));
        const explicit = lines.findIndex((line) => line === override.emphasis_text);
        const focus = explicit >= 0 ? explicit : adverb >= 0 ? adverb :
          lines.reduce((at, line, i) => line.replace(/[、。！？!?]/g, '').length <
            lines[at].replace(/[、。！？!?]/g, '').length ? i : at, 0);
        const sizes = lines.map((line, i) => i === focus
          ? Math.min(rule.focusMax * size / rule.supportMax, maxWidth / (line.length * 1.01))
          : size * (i === lines.length - 1 && lines.length >= 3 ? rule.closingRatio : 1));
        // A short one-line title such as DENBAって何？ still needs hierarchy:
        // emphasize its existing word, with the remaining text inline at the
        // support size. Do not manufacture a second line or alter the copy.
        let inlineFocus = null;
        if (lines.length === 1) {
          const word = segments.find((s) => s.isWordLike && s.segment.length >= 2);
          if (!word || word.segment.length === flat.length) return;
          const restWidth = measure(flat.slice(0, word.index) + flat.slice(word.index + word.segment.length), size);
          let focusSize = rule.focusMax * size / rule.supportMax;
          while (focusSize >= size * 1.2 && measure(word.segment, focusSize, 700) + restWidth > maxWidth) focusSize--;
          if (focusSize < size * 1.2) return;
          sizes[0] = focusSize;
          inlineFocus = { text: word.segment, index: word.index, size: focusSize, restWidth };
        }
        if (sizes[focus] / size < (inlineFocus ? 1.2 : 1.3)) return;
        const actualWidths = inlineFocus ? [measure(inlineFocus.text, inlineFocus.size, 700) + inlineFocus.restWidth]
          : lines.map((line, i) => measure(line, sizes[i], i === focus ? 700 : 500));
        if (actualWidths.some((w) => w > maxWidth)) return;
        const longest = Math.max(...actualWidths), shortest = Math.min(...actualWidths);
        const balance = shortest / longest;
        if (balance < 0.4 || longest / maxWidth < 0.65) return;
        const blockHeight = sizes.reduce((sum, n) => sum + n * 1.12, 0) + (lines.length - 1) * rule.lineGap;
        if (blockHeight > height * 0.65 || (lines.length > 1 && longest * blockHeight / (width * height) < 0.065)) return;
        const score = size * 2 - cost - Math.max(0, lines.length - 3) * 30 - (1 - balance) * 24;
        if (!best || score > best.score) best = { lines, sizes, focus, inlineFocus, widths: actualWidths, size, score, balance, blockHeight, longest };
        return;
      }
      if (lines.length === 4) return;
      for (const end of points) {
        if (end <= start) continue;
        const line = flat.slice(start, end);
        if (line.replace(/[、。！？!?\s]/g, '').length < 2 || closing.test(line) || particle.test(line)) continue;
        const measured = measure(line, size);
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
  // GBP may expand its own compact field slightly for an indivisible long
  // Japanese phrase. It still cannot inherit the wide 520px field or its fade.
  if (!best && gbp && rule.maxWidth === 440 && !override.max_width) {
    return fitThumbnailHeadline({ text, width, height, gbp, override,
      rule: { ...rule, maxWidth: flat.length <= 10 && /^[A-Z0-9]{2,}/.test(flat) ? 512 : 500 } });
  }
  if (!best) throw new Error('Thumbnail Typography FAIL: no natural layout at readable size.');
  headline.replaceChildren(...best.lines.map((text, i) => {
    const span = document.createElement('span');
    span.className = `headline-line${i === best.focus ? ' headline-focus' : ''}`;
    span.textContent = text;
    Object.assign(span.style, { fontSize: `${best.sizes[i]}px`, fontWeight: i === best.focus ? '700' : '500',
      color: i === best.focus ? '#76521e' : '#2a2925', lineHeight: '1.12',
      marginBottom: i < best.lines.length - 1 ? `${rule.lineGap}px` : '0' });
    if (best.inlineFocus) {
      const focus = document.createElement('span'); focus.textContent = best.inlineFocus.text;
      Object.assign(focus.style, { fontSize: `${best.inlineFocus.size}px`, fontWeight: '700', color: '#76521e' });
      span.replaceChildren(document.createTextNode(text.slice(0, best.inlineFocus.index)), focus,
        document.createTextNode(text.slice(best.inlineFocus.index + best.inlineFocus.text.length)));
      Object.assign(span.style, { fontSize: `${best.size}px`, fontWeight: '500', color: '#2a2925' });
    }
    return span;
  }));
  const top = rule.top ?? Math.round((height - best.blockHeight) * 0.50);
  Object.assign(headline.style, {
    fontSize: `${best.size}px`, fontWeight: '500', lineHeight: '1.12', letterSpacing: '.01em',
    left: `${left}px`, top: `${top}px`, maxWidth: `${maxWidth}px`, width: `${maxWidth}px`,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start'
  });
  const label = document.querySelector('.label');
  const hairline = document.querySelector('.hairline');
  Object.assign(label.style, { left: `${left}px`, top: `${top - 70}px`, fontSize: `${rule.labelSize}px`,
    letterSpacing: '.22em', color: '#726b5f' });
  Object.assign(hairline.style, { left: `${left}px`, top: `${top - 42}px`, width: '114px', opacity: '.24' });
  const mark = document.querySelector('.journal-mark');
  if (mark) mark.style.display = 'none';
  // Near-opaque paper under every glyph; fade starts AFTER the measured text.
  const textRight = left + best.longest;
  const fadeStart = Math.ceil(textRight + 22);
  document.querySelector('.paper').style.background =
    `linear-gradient(90deg,#f7f4ec 0px,rgba(247,244,236,.98) ${Math.min(350, fadeStart - 110)}px,rgba(247,244,236,.94) ${fadeStart}px,rgba(247,244,236,.48) ${fadeStart + rule.fadeTail * .48}px,transparent ${fadeStart + rule.fadeTail}px)`;
  if (rule.fadeVerticalTail) {
    document.querySelector('.paper').style.maskImage = `linear-gradient(180deg,#000 0px,#000 ${top + best.blockHeight + 22}px,transparent ${top + best.blockHeight + rule.fadeVerticalTail}px)`;
  }
  const rect = headline.getBoundingClientRect();
  const lineRects = [...headline.children].map((span) => {
    const range = document.createRange(); range.selectNodeContents(span);
    const r = range.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
  });
  const safe = lineRects.every((r) => r.left >= 40 && r.right <= width - 40 && r.top >= 40 && r.bottom <= height - 40 && r.right <= fadeStart - 12);
  // Conservative contrast: 94% ivory over black, for both ink colors. The final
  // image contrast and photo conflicts are independently checked by Visual QC.
  const luminance = (rgb) => rgb.reduce((sum, n, i) => {
    const c = n / 255, linear = c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    return sum + linear * [.2126, .7152, .0722][i];
  }, 0);
  const background = luminance([247, 244, 236].map((n) => n * .94));
  const contrast = (rgb) => (background + .05) / (luminance(rgb) + .05);
  const contrastFloor = Math.min(contrast([118, 82, 30]), contrast([42, 41, 37]));
  const metrics = {
    pass: safe, lines: best.lines, text_preserved: best.lines.join('') === flat,
    font_size: best.size, font_size_at_320: best.size * 320 / width,
    line_count: best.lines.length, line_height: 1.12, line_balance: best.balance,
    layout_rule: rule.id, line_font_sizes: best.sizes, focus_line: best.focus,
    focus_text: best.inlineFocus?.text || best.lines[best.focus], focus_scale: best.sizes[best.focus] / best.size,
    hierarchy_kind: best.inlineFocus ? 'inline' : 'lines',
    hierarchy_pass: best.sizes[best.focus] / best.size >= (best.inlineFocus ? 1.2 : 1.3),
    label_subordinate: rule.labelSize / best.size <= .25, bottom_mark_removed: true,
    width_occupancy: best.longest / maxWidth,
    block_area_ratio: best.longest * rect.height / (width * height),
    safe_area_pass: safe, fade_contains_text: safe, fade_start: fadeStart,
    fade_end: fadeStart + rule.fadeTail, fade_vertical_tail: rule.fadeVerticalTail,
    contrast_floor: contrastFloor, line_rects: lineRects
  };
  if (!metrics.pass || !metrics.text_preserved) throw new Error('Thumbnail Typography FAIL: unsafe bounds.');
  return metrics;
}
