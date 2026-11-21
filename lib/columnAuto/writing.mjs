// 執筆（書く役）と品質チェック（別のチェック役）。チェック役は書く役の考えを見ない。
import { MODELS, REVIEW, LANES } from './config.mjs';
import { claudeJson } from './claude.mjs';
import { lintArticle } from './content.mjs';

export const VOICE_RULES = `
# 文体の基準（店長の評価から。最優先）
- 論文っぽくしない。読みたくなる文章。結論を先に、短い段落で、具体的な場面を添える。
- AIっぽさを出さない。人間味のある言葉で。「〜とされています」「〜と言われています」の連続、研究結果の列挙、箇条書きの多用、「いかがでしたか」「〜しましょう！」の連発、定型の三段構成は避ける。
- 主役は代表トレーナー（店長）の考えと現場の見方。出典の紹介を主役にしない。出典は安全に関わる所と、事実の根拠が必要な所に絞る。
- 店長の発言として書いてよいのは「店長の考え（公開済みの本人の言葉）」にある内容だけ。それ以外の店長の発言・店でのエピソード・お客様の声を作らない。一般的な例を書くときは「たとえば〜という人なら」のように、作った例だと分かる書き方にする。
- 絵文字は見出しに入れない。本文の文末に、ところどころ少しだけ（全体で2〜4個）。使ってよい例: 🏋️ 🥊 🌿 💡 ☕ 📝 🙂。使わない: 😅 😂 🤣 😆 ✨ 🎉 🔥 👍 💦 など、軽い・おじさんっぽい・広告っぽいもの。
- 店名「THE REV.」はタイトルに入れない。本文には1〜3回程度。結びは、そのテーマに対する THE REV. の見方・指導の考え方に自然につなぐ（予約の案内だけで終わらない）。
- 薬機法・景品表示法: 「治る」「改善する」「効果がある」「疲労が取れる」「睡眠の質が上がる」などの言い切りの効果表現は使わない。ただし守りすぎて魅力まで削らない。酸素ルームやDENBAを置いた理由（休むための場所をつくる、動く時間と休む時間の両方を大切にする）や、使い方・過ごし方・選び方は、生き生きと書いてよい。体感には個人差があること、診断・治療ではないことは、くどくならない形で一度触れる。
- 数字・研究・制度など、確かめられない事実は書かない。分からない数字は書かない（推測で埋めない）。
- 文字数: 本文 1,800〜2,400字（空白を除く）。見出しは ## と ### のみ。
`.trim();

const ARTICLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'slug', 'description', 'keywords', 'image_headline_short', 'body_markdown', 'gbp_body', 'story_frame_text', 'link_sticker_text', 'ai_created_examples', 'sources'],
  properties: {
    title: { type: 'string' }, slug: { type: 'string' }, description: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    image_headline_short: { type: 'string' }, body_markdown: { type: 'string' }, gbp_body: { type: 'string' },
    story_frame_text: { type: 'string' }, link_sticker_text: { type: 'string' },
    ai_created_examples: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } }
  }
};

export async function writeArticle({ topic, lane, shopFacts, exemplars, internalLinks, recentGbp, feedback = null, previous = null, meter }) {
  const system = [
    'あなたは奈良・新大宮のパーソナルジム THE REV. CONDITIONING LAB. のコラムを書く編集者です。代表トレーナー（店長）が書いたと読める、人の温度がある記事を書きます。',
    VOICE_RULES,
    `# 出力する項目
- title: 32〜40字。読者の疑問が伝わる題。店名を入れない。絵文字なし。
- slug: 英小文字とハイフン。内容が分かる英語（例: workout-after-meal-timing）。
- description: 80〜120字。検索結果で読みたくなる説明。
- keywords: 主な検索語を3つ。
- image_headline_short: サムネイル画像に載せる短い見出し。2〜3行、改行は \\n、1行18字以内・合計34字以内。助詞（の・を・が・に・で等）で行を終えない。「解説します」「徹底」など説明・宣伝っぽい語は使わない。
- body_markdown: 本文（Markdown）。冒頭は見出しなしの導入。最後は THE REV. の考え方につなぐ結び。内部リンクを1〜2本、自然な文脈で入れてよい（渡した一覧の URL だけ）。
- gbp_body: Googleビジネスプロフィール投稿文。250〜500字、実際の改行を入れる。記事の約束を、読者の具体的な疑問や選択に置き換えて書く。意味のある絵文字を1〜2個。最後の行は [BLOG_URL] だけ（1回）。「奈良・新大宮で〜の方へ」「大切なのは」で始めない。煽らない。直近の投稿と同じ構成にしない。
- story_frame_text: Instagramストーリーの下の白い枠に店長が入れる短い文言（20〜40字）。読者が「読みたい」と思う一言。
- link_sticker_text: リンクスタンプの文言（8〜20字。例: 記事を読む／続きはコラムで）。
- ai_created_examples: 本文のうち、AIが作った例え・場面・言い回しで、店長が確認したほうがよいもの（なければ空配列）。
- sources: 事実の確認に使った出典URL（店の事実だけなら空配列）。
出力は JSON のみ。`
  ].join('\n\n');
  const parts = [
    `# 今日のテーマ\n分野: ${LANES[lane].label}\n題の案: ${topic.title_idea}\n主な検索語: ${topic.primary_query}\n読者の疑問: ${topic.reader_question}\nこの記事で初めて答えること: ${topic.new_answer}\n近い既存記事: ${topic.nearest_existing_slug || 'なし'}（同じ答えを繰り返さない）`,
    `# 店舗の確認済み事実（店の事実と店長の発言はこの範囲だけ）\n${shopFacts}`,
    `# 内部リンクに使ってよい既存記事\n${internalLinks}`,
    `# 店長が合格を出した最近の記事（文体の手本。内容はまねない）\n${exemplars}`,
    `# 直近のGoogleビジネス投稿（構成を重ねない）\n${recentGbp || '（取得なし）'}`
  ];
  if (feedback) parts.push(`# 前の原稿へのチェック役の指摘（全部直す。直した上で、良かった所は残す）\n${feedback}\n\n# 前の原稿\n${JSON.stringify(previous).slice(0, 12000)}`);
  const { data, model } = await claudeJson({ model: MODELS.writer, system, content: parts.join('\n\n'), schema: ARTICLE_SCHEMA, effort: 'high', maxTokens: 64000, meter, purpose: feedback ? 'article-rewrite' : 'article-write', maxJpy: 80 });
  data.body_markdown = String(data.body_markdown || '').replace(/\r\n/g, '\n').trim() + '\n';
  data.image_headline_short = String(data.image_headline_short || '').replace(/\\n/g, '\n').trim();
  data.gbp_body = String(data.gbp_body || '').replace(/\\n/g, '\n').trim();
  return { article: data, model };
}

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['scores', 'compliance_pass', 'facts_pass', 'invented_owner_statements', 'must_fix', 'good_points', 'confidence', 'summary'],
  properties: {
    scores: {
      type: 'object', additionalProperties: false,
      required: ['want_to_read', 'human_voice', 'title', 'clarity', 'usefulness', 'compliance_balance', 'gbp', 'story_copy'],
      properties: {
        want_to_read: { type: 'integer' }, human_voice: { type: 'integer' }, title: { type: 'integer' }, clarity: { type: 'integer' },
        usefulness: { type: 'integer' }, compliance_balance: { type: 'integer' }, gbp: { type: 'integer' }, story_copy: { type: 'integer' }
      }
    },
    compliance_pass: { type: 'boolean' }, facts_pass: { type: 'boolean' },
    invented_owner_statements: { type: 'array', items: { type: 'string' } },
    must_fix: { type: 'array', items: { type: 'string' } }, good_points: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' }, summary: { type: 'string' }
  }
};

async function reviewOnce({ model, article, shopFacts, meter, purpose }) {
  const system = [
    'あなたは THE REV. CONDITIONING LAB. のコラムの品質チェック役です。書いた人とは別人で、店長の代わりに合否を出します。甘くしない。ただし重箱の隅ではなく、読者と店にとって大事な点を見る。',
    VOICE_RULES,
    `# 採点（各0〜10の整数）
- want_to_read: 最初の3行で続きを読みたくなるか。論文っぽさ・説明書っぽさがないか
- human_voice: AIっぽい定型（研究の列挙、とされています連続、箇条書き過多、型どおりの構成）がなく、人の温度があるか
- title: 検索する読者の疑問がそのまま伝わるか。店名が入っていないか。長すぎないか
- clarity: 結論が先で、段落が短く、具体例があるか
- usefulness: 読者が今日から判断・行動できる中身があるか。既存記事の焼き直しでないか
- compliance_balance: 言い切りの効果表現がなく、それでいて魅力（導入理由・使い方）を削りすぎていないか
- gbp: GBP投稿文が自然で、絵文字が適切、末尾が [BLOG_URL] 1回か
- story_copy: ストーリー枠の文言とリンクスタンプの文言が短く、読みたくなるか
# 合否に直結する判定
- compliance_pass: 薬機法・景品表示法上の問題（効果の言い切り、最上級表現、根拠のない比較）が無ければ true
- facts_pass: 「店舗の確認済み事実」に無い店の事実・数字・店長の発言・お客様の声を作っていなければ true。一般論の数字は、出典なしの断定があれば false
- invented_owner_statements: 店長が言ったように書かれているが、公開済みの本人の言葉に無いもの
- must_fix: 合格に必要な修正（具体的に、どこをどう直すか）。合格なら空でもよい
- confidence: 自分の判定にどれだけ自信があるか（0〜1）
出力は JSON のみ。`
  ].join('\n\n');
  const content = `# 店舗の確認済み事実\n${shopFacts}\n\n# 審査する原稿\n${JSON.stringify({ title: article.title, description: article.description, image_headline_short: article.image_headline_short, body_markdown: article.body_markdown, gbp_body: article.gbp_body, story_frame_text: article.story_frame_text, link_sticker_text: article.link_sticker_text }, null, 1)}`;
  const { data, model: used } = await claudeJson({ model, system, content, schema: REVIEW_SCHEMA, effort: 'medium', maxTokens: 16000, meter, purpose, maxJpy: 40 });
  return { ...data, model: used };
}

export function reviewVerdict(r) {
  const s = Object.values(r.scores || {}).map(Number);
  const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  const pass = r.compliance_pass === true && r.facts_pass === true && (r.invented_owner_statements || []).length === 0 &&
    s.every((x) => x >= REVIEW.passMin) && avg >= REVIEW.passAverage;
  // 迷うもの: 合否の境目（7点がある・平均が境目付近）か、本人の自信が低い
  const borderline = (s.some((x) => x === REVIEW.passMin) || Math.abs(avg - REVIEW.passAverage) <= 0.4 || Number(r.confidence) < 0.7);
  return { pass, borderline, average: Math.round(avg * 100) / 100 };
}

export async function reviewArticle({ article, shopFacts, meter }) {
  const lint = lintArticle(article);
  if (!lint.pass) return { pass: false, stage: 'lint', lint, feedback: lint.errors.map((e) => `- ${e}`).join('\n') };
  const primary = await reviewOnce({ model: MODELS.reviewer, article, shopFacts, meter, purpose: 'article-review' });
  let verdict = reviewVerdict(primary), final = primary, escalation = null;
  if (verdict.borderline) {
    escalation = await reviewOnce({ model: MODELS.reviewerEscalation, article, shopFacts, meter, purpose: 'article-review-escalation' });
    final = escalation; verdict = reviewVerdict(escalation);
  }
  const feedback = [...(final.must_fix || []), ...(final.invented_owner_statements || []).map((x) => `店長の発言として作られている: ${x}（削るか一般論に）`)].map((x) => `- ${x}`).join('\n');
  return { pass: verdict.pass, stage: escalation ? 'escalated' : 'primary', lint, primary, escalation, average: verdict.average, feedback: feedback || '- 平均点が基準に届きません。読みたくなる導入と人の温度を強めてください。' };
}
