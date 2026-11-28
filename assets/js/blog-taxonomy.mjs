// THE REV. COLUMN — Category Taxonomy v1.0（唯一の正本）
// Node.js / browser ES module の双方から安全にimportできる副作用なしのpure module。
// カテゴリー配列・ラベルmapを他ファイルへ再定義しないこと。1記事 = 必ず1 Primary Category。
// 新カテゴリー追加手順は BLOG_README.md を参照。

export const BLOG_CATEGORIES = Object.freeze([
  Object.freeze({
    slug: 'training',
    labelJa: 'トレーニング',
    labelEn: 'TRAINING',
    description: '筋トレの種目・フォーム・負荷・頻度など、トレーニングを続けるための考え方をまとめています。',
    definition: '筋トレの種目、フォーム、負荷、頻度、筋肉、トレーニングそのもの。',
    order: 1
  }),
  Object.freeze({
    slug: 'health',
    labelJa: '身体・健康',
    labelEn: 'HEALTH',
    description: '健康診断・血圧・疲労や体調など、安心して運動を始めるための身体と健康の知識をまとめています。',
    definition: '健康診断、血圧、疲労、体調、安全性、身体状態。',
    order: 2
  }),
  Object.freeze({
    slug: 'gym-guide',
    labelJa: 'ジム選び・続け方',
    labelEn: 'GYM GUIDE',
    description: 'ジム選び・体験・通い方・継続の工夫など、自分に合う運動環境を考えるための記事をまとめています。',
    definition: 'ジム選び、体験、通う頻度、継続、時間、THE REV.利用判断、新大宮。',
    order: 3
  }),
  Object.freeze({
    slug: 'recovery',
    labelJa: 'リカバリー・休養',
    labelEn: 'RECOVERY',
    description: '酸素ルーム・DENBA・休養・コンディショニングなど、身体を整えるための考え方をまとめています。',
    definition: '酸素ルーム、DENBA、休養、コンディショニング。',
    order: 4
  }),
  Object.freeze({
    slug: 'boxing',
    labelJa: 'ボクシング',
    labelEn: 'BOXING',
    description: '初心者向けの基本・ミット・強度の考え方など、運動としてのボクシングについてまとめています。',
    definition: '初心者向けボクシング、技術、ミット、強度、運動としてのボクシング。',
    order: 5
  })
]);

export const BLOG_CATEGORY_SLUGS = Object.freeze(BLOG_CATEGORIES.map(c => c.slug));

// 廃止済み。新規入力では拒否する（既存データ移行の参照用にのみ保持）。
export const DEPRECATED_CATEGORY_SLUGS = Object.freeze(['body-knowledge']);

const BY_SLUG = new Map(BLOG_CATEGORIES.map(c => [c.slug, c]));

export function getBlogCategory(slug) {
  return BY_SLUG.get(String(slug ?? '').trim()) || null;
}

export function isBlogCategory(slug) {
  return BY_SLUG.has(String(slug ?? '').trim());
}

export function categoryLabelFor(slug) {
  const c = getBlogCategory(slug);
  return c ? c.labelEn : '';
}

export function categoryJapaneseLabelFor(slug) {
  const c = getBlogCategory(slug);
  return c ? c.labelJa : '';
}

export function categoryDescriptionFor(slug) {
  const c = getBlogCategory(slug);
  return c ? c.description : '';
}

export function categoryUrlPath(slug) {
  return `/blog/category/${slug}/`;
}

export function categoryValidationMessage() {
  return `categoryは ${BLOG_CATEGORY_SLUGS.join(' / ')} のいずれかを指定してください（body-knowledgeは廃止）`;
}
