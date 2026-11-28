// 日付（JST）・公開済み記事の一覧・文体の機械チェック。
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { BUSINESS_WEEKDAYS, readClosedDates, LANES, UTM } from './config.mjs';
import { validateDraftForPublish, validateEditorialClosingForPublish, canonicalFor } from '../blogMarkdown.mjs';
import { evaluateEditorialLength } from '../editorialReadiness.mjs';
import { validateImageHeadlineShort } from '../editorialImageCopy.mjs';

// ---------- 日付 ----------
export function jstDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
export function weekdayOf(dateStr) { return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); }
export function isBusinessDay(dateStr) {
  return BUSINESS_WEEKDAYS.includes(weekdayOf(dateStr)) && !readClosedDates().includes(dateStr);
}
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function mondayOf(dateStr) { const wd = weekdayOf(dateStr); return addDays(dateStr, wd === 0 ? -6 : 1 - wd); }
const WD_JA = ['日', '月', '火', '水', '木', '金', '土'];
export function jaDateLabel(dateStr) { const [, m, d] = dateStr.split('-').map(Number); return `${m}/${d}(${WD_JA[weekdayOf(dateStr)]})`; }

// ---------- 公開済み記事 ----------
export function laneOf({ category, title = '', keywords = [] }) {
  const t = `${title} ${(keywords || []).join(' ')}`;
  if (/DENBA|デンバ/i.test(t)) return 'denba';
  if (/酸素/.test(t)) return 'oxygen';
  if (category === 'boxing' || /ボクシング/.test(t) && category !== 'training') return 'boxing';
  if (category === 'recovery') return /DENBA/i.test(t) ? 'denba' : 'oxygen';
  if (category === 'health') return 'seo_health';
  if (category === 'gym-guide') return 'gym_guide';
  return 'training';
}

export function publishedArticles(dir = 'content/blog') {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const { data, content } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const keywords = Array.isArray(data.keywords) ? data.keywords : [];
    return {
      slug: data.slug || f.replace(/\.md$/, ''), title: String(data.title || ''), description: String(data.description || ''),
      category: data.category, keywords, published: String(data.published || ''), status: data.status,
      lane: laneOf({ category: data.category, title: data.title, keywords }), body: content,
      headings: (content.match(/^##+\s.+$/gm) || []).map((h) => h.replace(/^#+\s*/, ''))
    };
  }).filter((a) => a.status !== 'draft').sort((a, b) => b.published.localeCompare(a.published));
}

// ---------- 文体・表記の機械チェック（品質チェック役の前に必ず通す） ----------
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const BANNED_EMOJI = ['😅', '😂', '🤣', '😆', '😁', '😜', '🥺', '😭', '💦', '‼', '⁉', '🙇', '🎉', '✨', '😊', '😃', '😄', '👍', '🔥'];
const CLAIM_PATTERNS = [
  /治(る|ります|せます|療します)/, /改善(します|できます|されます)/, /効果があります/, /効きます/, /必ず(痩せ|良くな|改善|治)/,
  /確実に(痩せ|改善|回復)/, /(疲労|疲れ)が(取れ|とれ)ます/, /回復を早めます/, /(睡眠|眠り)の質が(上が|良くな|改善)/,
  /血行が(良くな|改善)/, /免疫(力)?(が|を)(上|高)/, /デトックス/, /アンチエイジング/, /No\.?1|ナンバーワン|日本一|最高の効果/
];

export function lintArticle(a) {
  const errors = [], warnings = [];
  const title = String(a.title || ''), body = String(a.body_markdown || '');
  if (/THE\s*REV/i.test(title)) errors.push('タイトルに店名「THE REV.」が入っています（店名はタイトルに入れない）');
  if (title.length > 45) errors.push(`タイトルが長すぎます（${title.length}字。目安32〜40字）`);
  if (EMOJI_RE.test(title)) errors.push('タイトルに絵文字があります');
  EMOJI_RE.lastIndex = 0;
  const headings = body.match(/^#{1,6}\s.+$/gm) || [];
  if (headings.some((h) => { EMOJI_RE.lastIndex = 0; return EMOJI_RE.test(h); })) errors.push('見出しに絵文字があります（見出しには入れない）');
  if (/^#\s/m.test(body)) errors.push('本文に H1（# ）があります。見出しは ## から');
  const emojis = body.replace(/^#{1,6}\s.+$/gm, '').match(EMOJI_RE) || [];
  const banned = emojis.filter((e) => BANNED_EMOJI.includes(e));
  if (banned.length) errors.push(`使わない絵文字があります: ${[...new Set(banned)].join(' ')}`);
  if (emojis.length > 4) errors.push(`絵文字が多すぎます（${emojis.length}個。本文の文末に2〜4個まで）`);
  if (emojis.length === 0) warnings.push('絵文字が0個です（文末にところどころ少しだけ、が方針）');
  const revCount = (body.match(/THE REV\./g) || []).length;
  if (revCount === 0) errors.push('本文に店名がありません（結びで THE REV. の考え方に自然につなぐ）');
  if (revCount > 4) errors.push(`本文の店名が多すぎます（${revCount}回。たまに入れる程度）`);
  const toSareteimasu = (body.match(/とされています|と言われています|と報告されています/g) || []).length;
  if (toSareteimasu > 2) errors.push(`「〜とされています」系が${toSareteimasu}回（論文調になる。2回まで）`);
  for (const re of CLAIM_PATTERNS) if (re.test(body) || re.test(title)) errors.push(`言い切りの効果表現の疑い: ${re}`);
  const longParas = body.split(/\n{2,}/).filter((p) => !/^#|^[-*]|^\|/.test(p.trim()) && p.replace(/\s/g, '').length > 220).length;
  if (longParas > 1) warnings.push(`長すぎる段落が${longParas}個（短い段落で）`);
  if (/\\n/.test(body)) errors.push('本文に文字としての \\n が入っています');
  const len = evaluateEditorialLength('STANDARD', body);
  if (!len.pass) errors.push(`本文が短すぎます（${len.count}字。${len.min}字以上）`);
  if (len.count > 3200) errors.push(`本文が長すぎます（${len.count}字。2,400字前後まで）`);
  errors.push(...validateEditorialClosingForPublish({ editorial_source: 'the-rev-editorial-ai', body_markdown: body }));
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(a.slug || ''))) errors.push('slug が英小文字・数字・ハイフンになっていません');
  if (!String(a.gbp_body || '').includes('[BLOG_URL]') || (String(a.gbp_body).match(/\[BLOG_URL\]/g) || []).length !== 1) errors.push('GBP投稿文の末尾に [BLOG_URL] を1回だけ入れてください');
  const gbpLen = String(a.gbp_body || '').replace(/\[BLOG_URL\]/, '').replace(/\s/g, '').length;
  if (gbpLen < 200 || gbpLen > 520) errors.push(`GBP投稿文の長さが範囲外（${gbpLen}字。250〜500字）`);
  if (String(a.story_frame_text || '').length > 40) errors.push('ストーリー枠の文言が長すぎます（40字以内）');
  if (String(a.link_sticker_text || '').length > 20) errors.push('リンクスタンプの文言が長すぎます（20字以内）');
  const hl = validateImageHeadlineShort(a.image_headline_short || '');
  if (!hl.ok) errors.push(`画像用の短い見出しが規約外: ${hl.errors.join(', ')}（2〜3行・1行18字以内・合計34字以内。改行は \\n で、助詞で行を終えない）`);
  return { pass: errors.length === 0, errors, warnings, length: len.count, emoji_count: emojis.length, rev_count: revCount };
}

export function storyUrl(slug, dateStr) {
  const u = new URL(canonicalFor(slug));
  u.searchParams.set('utm_source', UTM.source);
  u.searchParams.set('utm_medium', UTM.medium);
  u.searchParams.set('utm_campaign', UTM.campaign);
  u.searchParams.set('utm_content', `${dateStr.replace(/-/g, '')}_${slug}`.slice(0, 80));
  return u.toString();
}

export { validateDraftForPublish, canonicalFor, LANES };
