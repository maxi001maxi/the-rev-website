// コラム朝の自動実行（column-auto v1）の決定的な部分のテスト。API は呼ばない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isBusinessDay, jstDate, mondayOf, lintArticle, storyUrl, laneOf, publishedArticles } from '../lib/columnAuto/content.mjs';
import { chooseLane, updateLaneMultipliers, titleSimilarity, pickCandidate, searchOpportunities } from '../lib/columnAuto/topic.mjs';
import { createCostMeter, usageCostUsd, ledgerCost, BudgetExceededError } from '../lib/columnAuto/cost.mjs';
import { reviewVerdict } from '../lib/columnAuto/writing.mjs';
import { storyHtml } from '../lib/columnAuto/story.mjs';

test('営業日: 火水木土日のみ（月金は定休）', () => {
  assert.equal(isBusinessDay('2026-11-22'), true);  // 日
  assert.equal(isBusinessDay('2026-11-23'), false); // 月
  assert.equal(isBusinessDay('2026-11-24'), true);  // 火
  assert.equal(isBusinessDay('2026-11-27'), false); // 金
  assert.equal(isBusinessDay('2026-11-28'), true);  // 土
});

test('JSTの日付: UTC 20:30 は翌日の朝5:30', () => {
  assert.equal(jstDate(new Date('2026-11-21T20:30:00Z')), '2026-11-22');
  assert.equal(mondayOf('2026-11-22'), '2026-11-16');
});

test('cron は JST 05:30 / 07:30 の火水木土日に当たる', () => {
  const yml = fs.readFileSync('.github/workflows/column-morning.yml', 'utf8');
  assert.match(yml, /cron: '30 20 \* \* 1,2,3,5,6'/);
  assert.match(yml, /cron: '30 22 \* \* 1,2,3,5,6'/);
  assert.doesNotMatch(yml, /api\/admin\/publish/);
  const hy = fs.readFileSync('.github/workflows/auto-editorial-hybrid-images.yml', 'utf8');
  assert.match(hy, /workflow_call:/);
  assert.doesNotMatch(hy, /^\s+- cron:/m);
  assert.match(hy, /ANTHROPIC_API_KEY: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/);
});

test('秘密情報をコードに書いていない', () => {
  for (const f of ['lib/columnAuto/config.mjs', 'lib/columnAuto/services.mjs', 'lib/columnAuto/claude.mjs', 'scripts/column-auto/run.mjs', '.github/workflows/column-morning.yml']) {
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /sk-ant-|sk-proj-|eyJhbGciOi|-----BEGIN PRIVATE KEY/, f);
  }
});

test('自動公開しない: 下書き保存のみで、公開APIや published 系の更新をしない', () => {
  const s = fs.readFileSync('scripts/column-auto/run.mjs', 'utf8');
  assert.doesNotMatch(s, /api\/admin\/publish|publish_status:\s*'PUBLISHED'|source_path:\s*['"`]content/);
  assert.match(s, /publish_status !== 'NOT_PUBLISHED'/);
});

test('分野の判定: 実績の倍率と偏りを反映し、同じ分野の3連続を避ける', () => {
  const mk = (lane, i) => ({ slug: `a${i}`, lane, published: `2026-11-${String(20 - i).padStart(2, '0')}`, title: '', headings: [] });
  const articles = ['training', 'training', 'oxygen', 'training', 'gym_guide', 'training', 'seo_health', 'training', 'training', 'gym_guide'].map(mk);
  const r = chooseLane({ articles });
  assert.equal(r.blocked_consecutive, 'training');
  assert.notEqual(r.lane, 'training');
  assert.ok(['denba', 'boxing', 'seo_health', 'oxygen'].includes(r.lane), r.lane);
  // 酸素・DENBA・ボクシングは10本に1本以上
  const denbaRow = r.ranking.find((x) => x.lane === 'denba');
  assert.equal(denbaRow.last10_count, 0);
});

test('PDCA: 倍率は 0.8〜1.25 の範囲で少しずつ動く', () => {
  const articles = [
    { slug: 'x1', lane: 'training', published: '2026-09-01' },
    { slug: 'x2', lane: 'oxygen', published: '2026-09-01' }
  ];
  const pageRows = [
    { keys: ['https://therev-lab.com/blog/x1/'], impressions: 1000, clicks: 30 },
    { keys: ['https://therev-lab.com/blog/x2/'], impressions: 10, clicks: 0 }
  ];
  const r = updateLaneMultipliers({ articles, pageRows, today: '2026-11-21', previous: {} });
  assert.ok(r.multipliers.training > 1 && r.multipliers.training <= 1.25);
  assert.ok(r.multipliers.oxygen < 1 && r.multipliers.oxygen >= 0.8);
  assert.equal(r.multipliers.denba, 1);
});

test('重複の機械判定と、店長しか知らない事実が要る候補の除外', () => {
  assert.ok(titleSimilarity('食後の筋トレは何分あける？', '食後の筋トレは何分あけるべき？') > 0.6);
  const res = pickCandidate([
    { title_idea: '食後の筋トレは何分あけるべき？', needs_owner_fact: false },
    { title_idea: '酸素ルームの新しい機種で変わったこと', needs_owner_fact: true, owner_question: '新機種は？', owner_question_options: ['A', 'B'] },
    { title_idea: 'ベンチプレスで肩が痛い人の手幅の決め方', needs_owner_fact: false }
  ], { articles: [{ title: '食後の筋トレは何分あける？' }], drafts: [] });
  assert.equal(res.chosen.title_idea, 'ベンチプレスで肩が痛い人の手幅の決め方');
  assert.equal(res.rejected.length, 2);
});

test('検索機会の集計', () => {
  const o = searchOpportunities([{ keys: ['筋トレ 食後', 'https://therev-lab.com/blog/a/'], impressions: 50, clicks: 1, position: 12 }]);
  assert.equal(o[0].query, '筋トレ 食後');
  assert.deepEqual(o[0].pages, ['a']);
});

const goodBody = () => [
  '食べてすぐ動くと、なんとなく体が重い。そんな経験は多くの人にあると思います。',
  '', '## まず結論から', '', ('食事のあとにどれくらい時間をあけるかは、食べた量と内容、その日の体調で変わります。'.repeat(22)),
  '', '## 判断の目安', '', ('軽い食事なら短め、しっかり食べたなら長めに。迷ったら、動きはじめの数分で体の感じを確かめます。'.repeat(10)) + 'ゆっくり整えていきましょう🏋️',
  '', '## THE REV.での見方', '', ('THE REV. では、その日の状態を見て、負荷や順番を調整することを大切にしています。決めたメニューをこなすことより、体の反応を確認しながら進めます。'.repeat(3))
].join('\n');
const goodArticle = () => ({
  title: '食後の筋トレは何分あける？体が重くならない目安', slug: 'workout-after-meal-gap', body_markdown: goodBody(),
  gbp_body: ('食後すぐのトレーニングで体が重くなる方へ。'.repeat(14)) + '\n[BLOG_URL]',
  story_frame_text: '食後の筋トレ、何分あける？', link_sticker_text: '記事を読む', image_headline_short: '食後の筋トレ、\n何分あける？'
});

test('文体の機械チェック: 合格例', () => {
  const r = lintArticle(goodArticle());
  assert.deepEqual(r.errors, []);
});

test('文体の機械チェック: 店名入りタイトル・見出しの絵文字・おじさん絵文字・言い切り表現を落とす', () => {
  const a = goodArticle();
  a.title = 'THE REV.が教える食後の筋トレ';
  a.body_markdown = a.body_markdown.replace('## まず結論から', '## まず結論から💡') + '\n疲労が取れます😅';
  const r = lintArticle(a);
  const text = r.errors.join('\n');
  assert.match(text, /タイトルに店名/);
  assert.match(text, /見出しに絵文字/);
  assert.match(text, /😅/);
  assert.match(text, /言い切り/);
});

test('品質チェックの合否と、迷うもの（境目）の判定', () => {
  const base = { compliance_pass: true, facts_pass: true, invented_owner_statements: [], confidence: 0.9 };
  const s = (n) => ({ want_to_read: n, human_voice: n, title: n, clarity: n, usefulness: n, compliance_balance: n, gbp: n, story_copy: n });
  assert.deepEqual(reviewVerdict({ ...base, scores: s(9) }), { pass: true, borderline: false, average: 9 });
  assert.equal(reviewVerdict({ ...base, scores: s(7) }).borderline, true);
  assert.equal(reviewVerdict({ ...base, scores: s(9), facts_pass: false }).pass, false);
  assert.equal(reviewVerdict({ ...base, scores: s(9), confidence: 0.5 }).borderline, true);
});

test('費用: Claude と OpenAI の usage を円にし、上限を超える前に止める', () => {
  const usd = usageCostUsd('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 });
  assert.equal(usd, 3);
  const oa = usageCostUsd('gpt-5.6', { input_tokens: 1_000_000, output_tokens: 0, input_tokens_details: { cached_tokens: 500_000 } });
  assert.equal(oa, 2.2);
  const m = createCostMeter({ capJpy: 100 });
  m.record({ api: 'anthropic', model: 'claude-opus-5-5', purpose: 'x', usage: { input_tokens: 100_000, output_tokens: 10_000 } });
  assert.ok(m.total() > 90 && m.total() < 95);
  assert.throws(() => m.assertRoom(20, 'next'), BudgetExceededError);
  const rows = ledgerCost({ calls: [{ kind: 'generation', status: 'COMPLETED', model: 'gpt-5.6', usage: { input_tokens: 1000, output_tokens: 100 } },
    { kind: 'qc', provider: 'anthropic', status: 'COMPLETED', model: 'claude-sonnet-5-5', usage: { input_tokens: 20000, output_tokens: 2000 } }] });
  assert.equal(rows[1].api, 'anthropic');
  assert.ok(rows[0].usd > 0.05); // 画像出力の概算を含む
});

test('ストーリー: UTMつきURL、見出しだけ、下の白い枠は空', () => {
  const u = new URL(storyUrl('workout-after-meal-gap', '2026-11-22'));
  assert.equal(u.searchParams.get('utm_source'), 'instagram');
  assert.equal(u.searchParams.get('utm_medium'), 'story');
  assert.equal(u.pathname, '/blog/workout-after-meal-gap/');
  const html = storyHtml({ headline: '食後の筋トレ、\n何分あける？', sceneDataUrl: 'data:image/png;base64,AA' });
  assert.match(html, /<div class="box"><\/div>/);
  assert.equal((html.match(/<p>/g) || []).length, 2);
});

test('分野の分類と、公開済み記事の読み込み', () => {
  assert.equal(laneOf({ category: 'recovery', title: 'DENBA Healthとは' }), 'denba');
  assert.equal(laneOf({ category: 'recovery', title: '酸素ルームの使い方' }), 'oxygen');
  assert.equal(laneOf({ category: 'health', title: '肩こり' }), 'seo_health');
  const list = publishedArticles();
  assert.ok(list.length > 10);
  assert.ok(list[0].published >= list.at(-1).published);
});
