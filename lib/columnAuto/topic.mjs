// テーマの自動選定。
// 1) 配分（店長方針の重み × 実績で学習した倍率）と直近の偏りから「分野」を決める（決定的・説明可能）
// 2) その分野で、Search Console の検索語と既存記事を見て Claude が候補を5つ出す
// 3) 重複・店長しか知らない事実が要る候補を除いて1つ選ぶ。選ばなかった理由も残す
import { LANES, MODELS } from './config.mjs';
import { claudeJson } from './claude.mjs';
import { addDays } from './content.mjs';

const LEARN_RATE = 0.3, MULT_MIN = 0.8, MULT_MAX = 1.25;

export function normalizeUrl(u) {
  try { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/?$/, '/')}`; } catch { return String(u || ''); }
}
export function slugFromUrl(u) { const m = normalizeUrl(u).match(/\/blog\/([a-z0-9-]+)\/$/); return m ? m[1] : null; }

// 記事別の実績（28日）を分野ごとに集計し、学習済みの倍率を少しずつ更新する（PDCA）
export function updateLaneMultipliers({ articles, pageRows, today, previous = {} }) {
  const bySlug = new Map();
  for (const r of pageRows || []) {
    const slug = slugFromUrl(r.keys?.[0]);
    if (!slug) continue;
    const cur = bySlug.get(slug) || { impressions: 0, clicks: 0 };
    cur.impressions += Number(r.impressions || 0); cur.clicks += Number(r.clicks || 0);
    bySlug.set(slug, cur);
  }
  const mature = articles.filter((a) => a.published && a.published <= addDays(today, -28));
  const lanes = {};
  for (const a of mature) {
    const m = bySlug.get(a.slug) || { impressions: 0, clicks: 0 };
    lanes[a.lane] ||= { n: 0, impressions: 0, clicks: 0 };
    lanes[a.lane].n += 1; lanes[a.lane].impressions += m.impressions; lanes[a.lane].clicks += m.clicks;
  }
  // 評価値 = 1記事あたり表示回数 + クリック×20（クリックを重く見る）
  const scoreOf = (l) => (l.impressions + l.clicks * 20) / Math.max(1, l.n);
  const scored = Object.entries(lanes).filter(([, l]) => l.n >= 1);
  const mean = scored.length ? scored.reduce((s, [, l]) => s + scoreOf(l), 0) / scored.length : 0;
  const next = {};
  for (const lane of Object.keys(LANES)) {
    const prev = Number(previous[lane] || 1);
    const l = lanes[lane];
    if (!l || mean <= 0) { next[lane] = prev; continue; }
    const target = Math.min(MULT_MAX, Math.max(MULT_MIN, scoreOf(l) / mean));
    next[lane] = Math.round((prev * (1 - LEARN_RATE) + target * LEARN_RATE) * 1000) / 1000;
  }
  return { multipliers: next, evidence: Object.fromEntries(Object.entries(lanes).map(([k, l]) => [k, { mature_articles: l.n, impressions_28d: l.impressions, clicks_28d: l.clicks }])), mature_count: mature.length, has_data: (pageRows || []).length > 0 };
}

// 分野の決定（決定的）
export function chooseLane({ articles, multipliers = {}, window = 20 }) {
  const recent = articles.slice(0, window);
  const recent10 = articles.slice(0, 10);
  const totalW = Object.entries(LANES).reduce((s, [lane, l]) => s + l.weight * Number(multipliers[lane] || 1), 0);
  const rows = Object.entries(LANES).map(([lane, cfg]) => {
    const mult = Number(multipliers[lane] || 1);
    const share = (cfg.weight * mult) / totalW;
    const actual = recent.filter((a) => a.lane === lane).length;
    const expected = share * recent.length;
    const in10 = recent10.filter((a) => a.lane === lane).length;
    const minShort = Math.max(0, cfg.min_per_10 - in10);
    const score = (expected - actual) + minShort * 1.5 + share * 2;
    return { lane, label: cfg.label, weight: cfg.weight, multiplier: mult, target_share: Math.round(share * 1000) / 10, recent_count: actual, expected: Math.round(expected * 10) / 10, last10_count: in10, min_per_10: cfg.min_per_10, score: Math.round(score * 100) / 100 };
  });
  // 同じ分野が直近2本続いていたら3本目は避ける
  const last2 = articles.slice(0, 2).map((a) => a.lane);
  const blocked = last2.length === 2 && last2[0] === last2[1] ? last2[0] : null;
  const ranked = rows.filter((r) => r.lane !== blocked).sort((a, b) => b.score - a.score);
  return { lane: ranked[0].lane, ranking: rows.sort((a, b) => b.score - a.score), blocked_consecutive: blocked, window: recent.length };
}

// 検索語のうち「表示はあるのに、それに答える記事が弱い」ものを優先して渡す
export function searchOpportunities(queryPageRows, limit = 60) {
  const byQuery = new Map();
  for (const r of queryPageRows || []) {
    const [query, page] = r.keys || [];
    const q = byQuery.get(query) || { query, impressions: 0, clicks: 0, best_position: 999, pages: new Set() };
    q.impressions += Number(r.impressions || 0); q.clicks += Number(r.clicks || 0);
    q.best_position = Math.min(q.best_position, Number(r.position || 999));
    if (page) q.pages.add(slugFromUrl(page) || normalizeUrl(page));
    byQuery.set(query, q);
  }
  return [...byQuery.values()]
    .map((q) => ({ ...q, pages: [...q.pages].slice(0, 3), best_position: Math.round(q.best_position * 10) / 10 }))
    .sort((a, b) => (b.impressions * (b.best_position > 8 ? 1.5 : 1)) - (a.impressions * (a.best_position > 8 ? 1.5 : 1)))
    .slice(0, limit);
}

const CANDIDATE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title_idea', 'primary_query', 'reader_question', 'new_answer', 'nearest_existing_slug', 'search_evidence', 'needs_owner_fact', 'owner_question', 'owner_question_options', 'reason'],
        properties: {
          title_idea: { type: 'string' }, primary_query: { type: 'string' }, reader_question: { type: 'string' },
          new_answer: { type: 'string' }, nearest_existing_slug: { type: 'string' }, search_evidence: { type: 'string' },
          needs_owner_fact: { type: 'boolean' }, owner_question: { type: 'string' },
          owner_question_options: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' }
        }
      }
    }
  }
};

export async function generateCandidates({ lane, articles, drafts, opportunities, shopFacts, meter, forcedTopic = '' }) {
  const cfg = LANES[lane];
  const existing = [...articles.map((a) => `- [${a.lane}] ${a.slug}｜${a.title}${a.headings.length ? `（見出し: ${a.headings.slice(0, 6).join(' / ')}）` : ''}`),
    ...drafts.filter((d) => d.publish_status === 'NOT_PUBLISHED').map((d) => `- [未公開の下書き] ${d.slug}｜${d.title}`)].join('\n');
  const opp = opportunities.length
    ? opportunities.map((o) => `- 「${o.query}」表示${o.impressions} / クリック${o.clicks} / 最高順位${o.best_position} / 表示されている記事: ${o.pages.join(', ') || 'なし'}`).join('\n')
    : '（Search Console の検索語データは取得できませんでした。根拠は「実測なし（仮説）」と書くこと）';
  const system = [
    'あなたは奈良・新大宮のパーソナルジム THE REV. CONDITIONING LAB. のコラム編集者です。',
    '今日のコラムの候補を5つ出します。読者は30〜50代の、仕事を頑張る人。店名を知らない人が検索で出会う記事を増やしたい。',
    '条件:',
    '- 既存記事・未公開下書きと同じ問いに答える候補は出さない（別の言い方でも、すでに見出しや本文で答えていれば重複）。',
    '- 検索語データは渡された数字だけを根拠に使う。数字を作らない。データが無い候補は search_evidence に「実測なし（仮説）」と書く。',
    '- 店の事実は「店舗の確認済み事実」の範囲だけ。そこに無い店の事実（設備の型番、店でのエピソード、お客様の声）が無いと書けない候補は needs_owner_fact=true とし、owner_question に店長への質問を1つ、owner_question_options に選べる答えを2〜4個入れる。不要なら needs_owner_fact=false、owner_question は空、options は空配列。',
    '- 酸素ルーム・DENBAは効果の言い切りが必要な候補にしない（使い方・選び方・考え方・比較は可）。',
    '- title_idea は32〜40字の日本語。店名は入れない。読者の疑問がそのまま伝わる題。',
    '- nearest_existing_slug は一番近い既存記事の slug（無ければ空）。',
    '出力は JSON のみ。'
  ].join('\n');
  const user = [
    `今日の分野: ${cfg.label}（カテゴリ: ${cfg.category}）`,
    forcedTopic ? `店長の指定テーマ: ${forcedTopic}（これを最優先で候補1にする）` : '',
    '', '## 検索語データ（直近28日・Search Console）', opp,
    '', '## 既存記事と未公開下書き', existing,
    '', '## 店舗の確認済み事実', shopFacts
  ].join('\n');
  const { data } = await claudeJson({ model: MODELS.topic, system, content: user, schema: CANDIDATE_SCHEMA, effort: 'medium', maxTokens: 16000, meter, purpose: 'topic-candidates', maxJpy: 40 });
  return data.candidates || [];
}

// 題名の文字の重なりで、機械的にも重複を弾く（2文字単位の Jaccard）
function bigrams(s) { const t = String(s).replace(/[\s、。？?！!｜|・「」]/g, ''); const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; }
export function titleSimilarity(a, b) {
  const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function pickCandidate(candidates, { articles, drafts }) {
  const titles = [...articles.map((a) => a.title), ...drafts.map((d) => d.title)];
  const rejected = [];
  for (const c of candidates) {
    const sim = Math.max(0, ...titles.map((t) => titleSimilarity(c.title_idea, t)));
    if (sim >= 0.45) { rejected.push({ title: c.title_idea, reason: `既存記事と題名が近い（類似度${sim.toFixed(2)}）` }); continue; }
    if (c.needs_owner_fact) { rejected.push({ title: c.title_idea, reason: `店長しか知らない事実が必要: ${c.owner_question}`, owner_question: c.owner_question, owner_question_options: c.owner_question_options }); continue; }
    return { chosen: c, rejected: [...rejected, ...candidates.filter((x) => x !== c && !rejected.some((r) => r.title === x.title_idea)).map((x) => ({ title: x.title_idea, reason: '今回は上位の候補を採用（次回以降の候補）' }))] };
  }
  return { chosen: null, rejected };
}
