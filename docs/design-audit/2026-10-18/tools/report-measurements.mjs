// Builds MEASUREMENTS.md from screenshots/{main,bounds}/metrics-*.jsonl
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const load = mode => {
  const f = path.join(ROOT, 'screenshots', mode, `metrics-${mode}.jsonl`);
  if (!fs.existsSync(f)) return [];
  const best = new Map();
  for (const line of fs.readFileSync(f, 'utf8').trim().split('\n')) {
    const r = JSON.parse(line); const k = r.page + '@' + r.width;
    const ok = x => x && !x.error && x.top && x.top.vw === x.width;
    if (!best.has(k) || ok(r) || (!ok(best.get(k)) && !r.error)) best.set(k, r);
  }
  return [...best.values()];
};
const rgb = s => { const m = String(s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return ((x + 0.05) / (y + 0.05)).toFixed(2); };
const PAPER = { r: 251, g: 250, b: 247, a: 1 };
const bgOf = (st, body) => { const h = rgb(st.header?.style?.['background-color']); const base = rgb(body?.['background-color']) || PAPER; return h && h.a > 0 ? blend(h, base.a ? base : PAPER) : base; };
const links = st => (st?.links || []).filter(l => !/予約/.test(l.t));
const cta = st => (st?.links || []).find(l => /予約/.test(l.t));
const ctaCR = st => { const c = cta(st); if (!c) return '—'; const bg = rgb(c['background-color']); const hb = bgOf(st, st.bodyFont); const eff = bg && bg.a > 0 ? blend(bg, hb) : hb; return contrast(rgb(c.color), eff); };
const linkCR = st => { const l = links(st)[0]; if (!l) return '—'; return contrast(rgb(l.color), bgOf(st, st.bodyFont)); };

let md = `# 実ブラウザ計測値（2026-10-18, 本番 https://therev-lab.com/）\n\n`;
md += `headless Chrome（DevTools Protocol）で計測。GTM/GA4等はブロック済み。コントラスト比はヘッダー背景（透明の場合はページ地色）に対する概算。ページ地が写真の場合（TOPのスクロール前）は実際の写真上の値と異なる。\n\n`;
for (const mode of ['main', 'bounds']) {
  const rows = load(mode).sort((a, b) => b.width - a.width || a.page.localeCompare(b.page));
  if (!rows.length) continue;
  md += `## ${mode === 'main' ? '主要幅' : 'ブレークポイント前後'}（${rows.length}件）\n\n`;
  md += `| ページ | 幅 | 系統 | ヘッダー高 | ロゴ 幅@x | ナビ色(前) | ナビ比(前) | 予約ボタン 文字/地(前) | 予約比(前) | 予約ボタン 文字/地(後) | 予約比(後) | トグル | 線色 | 横はみ出し | 備考 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows) {
    const t = r.top || {}, s = r.scrolled || {};
    const c0 = cta(t), c1 = cta(s), l0 = links(t)[0];
    const tg = t.toggle; const bar = tg?.bars?.[0]?.bg || '';
    md += `| ${r.page} | ${r.width} | ${t.header?.kind || '—'} | ${t.header?.rect?.h ?? '—'} | ${(t.logo || []).map(l => `${l.rect.w}@${l.rect.x}`).join(' ') || '—'} | ${l0 ? l0.color : '—'} | ${linkCR(t)} | ${c0 ? `${c0.color} / ${c0['background-color']}` : '—'} | ${ctaCR(t)} | ${c1 ? `${c1.color} / ${c1['background-color']}` : '—'} | ${ctaCR(s)} | ${tg ? `${tg.rect.w}×${tg.rect.h} "${String(tg.label).replace(/\s+/g, " ")}"` : '—'} | ${bar} | ${t.hOverflow ? '**あり**' : 'なし'} | ${r.error ? 'ERR ' + r.error.slice(0, 40) : ''} |\n`;
  }
  md += `\n`;
  const dr = rows.filter(r => r.drawer?.open);
  if (dr.length) {
    md += `### ハンバーガーメニュー（${mode}）\n\n| ページ | 幅 | 背景 | 閉じる(x,y,w,h) | 項目 文字/太さ/行高 | 予約ボタン 地/角丸/高さ | Tab16回で外へ出たか | Esc後 フォーカス | Esc後 scrollY(600で開いた) |\n|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of dr) {
      const d = r.drawer; const l = d.links?.[0]; const b = d.cta?.find(x => /予約/.test(x.t));
      const out = (r.drawerTab || []).some(x => x.startsWith('OUT'));
      md += `| ${r.page} | ${r.width} | ${d.bg} | ${d.close ? `${d.close.x},${d.close.y},${d.close.w},${d.close.h} "${d.close.label.replace(/\s+/g, " ")}"` : '—'} | ${l ? `${l.fs}/${l.fw}/${l.h}px` : '—'} | ${b ? `${b.bg}/${b.radius}/${b.h}px` : '—'} | ${out ? '**出た**' : '出ない'} | ${r.afterEsc?.focused ?? '—'} | ${r.afterEsc?.scrollY ?? '—'} |\n`;
    }
    md += `\n`;
  }
}
// errors
for (const mode of ['main', 'bounds']) {
  const f = path.join(ROOT, 'screenshots', mode, `metrics-${mode}.json`);
  if (fs.existsSync(f)) { const e = JSON.parse(fs.readFileSync(f, 'utf8')).errors || []; md += `### コンソール/例外/通信失敗（${mode}）: ${e.length}件\n\n${e.slice(0, 30).map(x => `- ${x.page} ${x.type}: ${x.text}`).join('\n')}\n\n`; }
}
fs.writeFileSync(path.join(ROOT, 'MEASUREMENTS.md'), md);
console.log('written', md.length);
