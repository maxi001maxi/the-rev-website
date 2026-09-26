// THE REV. Editorial Console — Phase D: Markdown Serializer
//
// Supabaseの admin_article_drafts 1行（Working Draft）を、GitHubの
// content/blog/{slug}.md へ書き込むMarkdown文字列へ変換する唯一の場所。
// 変換ロジックをAPIファイルへ散在させないため、ここへ集約している。
//
// 重要な前提：
//   - 出力するFront Matterは scripts/build-blog.mjs がそのまま読める形式であること
//     （必須項目・categoryの値・statusの値・keywordsの型）。
//   - GitHubへ出力するMarkdownの status は常に "published"。
//     Supabase側の status は Phase Dでも 'draft' 固定であり（DBのCHECK制約）、
//     この関数はSupabase側の値を一切変更しない。
//   - category_label は category から自動算出する（Draftに保存された値は使わない）。

export const SITE_URL = 'https://therev-lab.com';
export const CONTENT_DIR = 'content/blog';

export const CATEGORY_LABELS = {
  training: 'TRAINING',
  boxing: 'BOXING',
  recovery: 'RECOVERY',
  'body-knowledge': 'BODY KNOWLEDGE'
};

export const CTA_TYPES = ['personal-training', 'boxing', 'recovery', 'general'];

// scripts/build-blog.mjs の REQUIRED_FIELDS + Phase 10公開品質ゲート。
// Phase 10以降は Thumbnail / OGP も公開必須とし、画像なし記事を本番へ出さない。
const REQUIRED_DRAFT_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'slug', label: 'Slug' },
  { key: 'description', label: 'Description' },
  { key: 'published', label: 'Published date' },
  { key: 'updated', label: 'Updated date' },
  { key: 'category', label: 'Category' },
  { key: 'author', label: 'Author' },
  { key: 'thumbnail', label: 'Thumbnail' },
  { key: 'og_image', label: 'OGP image' }
];

export function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug);
}

function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// Supabaseのdate列は 'YYYY-MM-DD' 文字列で返るが、環境によっては
// ISO日時（'YYYY-MM-DDT00:00:00...'）で返る可能性もあるため日付部分だけ取り出す。
function toDateString(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

export function categoryLabelFor(category) {
  return CATEGORY_LABELS[category] || '';
}

export function contentPathFor(slug) {
  return `${CONTENT_DIR}/${slug}.md`;
}

export function publicUrlPathFor(slug) {
  return `/blog/${slug}/`;
}

export function canonicalFor(slug) {
  return `${SITE_URL}${publicUrlPathFor(slug)}`;
}

/**
 * THE REV.公式記事としてのブランド整合をPublish直前に検証する。
 *
 * Editorの点数だけに依存せず、THE REV.の既存ブランド資産を不用意に
 * 下位化していないか、地域比較記事が「他店でも言える一般論」だけで
 * 終わっていないかをfail-closedで確認する。
 */
export function validateBrandAlignmentForPublish(draft) {
  if (!draft) return ['Brand QC: 記事が見つかりません。'];

  const title = String(draft.title || '').trim();
  const description = String(draft.description || '').trim();
  const body = String(draft.body_markdown || '');
  const keywords = Array.isArray(draft.keywords) ? draft.keywords.join(' ') : String(draft.keywords || '');
  const all = [title, description, keywords, body].join('\n');
  const errors = [];

  const isLocalGymSelection =
    /新大宮/.test(all) &&
    /(ジム|パーソナルジム)/.test(all) &&
    /(選び|選ぶ|比較)/.test(all);

  if (!isLocalGymSelection) return errors;

  // THE REV.は設備を重要なブランド資産として扱う。
  // 「設備か通いやすさか」の二択にして設備を一律に下位化する表現は公開しない。
  if (
    /設備より/.test(title) ||
    /設備(?:は|を)?[^。\n]{0,16}(?:二の次|重要ではない|大事ではない)/.test(all)
  ) {
    errors.push(
      'Brand QC: THE REV.の設備価値を一律に下位化する表現があります。設備と通いやすさを対立させず、目的・使い方・継続性を両立する構成へ修正してください。'
    );
  }

  const bodyCount = body.replace(/\s/g, '').length;
  if (bodyCount < 1600) {
    errors.push(
      `Brand QC: 新大宮のジム比較記事として本文が薄すぎます（${bodyCount}字）。最低1600字を目安に、比較判断とTHE REV.固有の意味まで説明してください。`
    );
  }

  const assetTerms = ['EVOLGEAR', '完全予約制', 'シャワー', '更衣', '酸素ルーム', 'DENBA'];
  const usedAssets = assetTerms.filter((term) => all.includes(term));
  if (usedAssets.length < 2) {
    errors.push(
      'Brand QC: 地域比較記事なのにTHE REV.固有の設備・利用環境が十分に使われていません。確認済みのブランド資産を、列挙ではなく読者の判断材料として接続してください。'
    );
  }

  const hasEquipmentMeaning =
    /設備[^。\n]{0,80}(?:目的|使い方|どう使|なぜ|意味)/.test(body) ||
    /(?:目的|使い方|どう使|なぜ|意味)[^。\n]{0,80}設備/.test(body);
  if (!hasEquipmentMeaning) {
    errors.push(
      'Brand QC: 設備の「存在」だけでなく、なぜ置くのか・どう使うのか・誰の何に役立つ環境なのかまで意味づけしてください。'
    );
  }

  if (!/THE REV\.? CONDITIONING LAB\.|THE REV\./.test(body)) {
    errors.push(
      'Brand QC: THE REV.公式記事としての固有接続がありません。一般論だけで終わらず、確認済みの店舗事実と思想へ接続してください。'
    );
  }

  return errors;
}

/**
 * 公開（GitHubへの書き込み）に必要な項目が揃っているかを検証する。
 * @returns {string[]} 人が読めるエラーメッセージの配列（空なら合格）
 */
export function validateDraftForPublish(draft) {
  const errors = [];
  if (!draft) return ['記事が見つかりません。'];

  for (const field of REQUIRED_DRAFT_FIELDS) {
    const raw = draft[field.key];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === null || value === undefined || value === '') {
      errors.push(`${field.label} が未入力です。`);
    }
  }

  if (draft.slug && !isValidSlug(draft.slug)) {
    errors.push('Slug は半角英数字とハイフン（a-z 0-9 -）のみ使用できます。');
  }
  if (draft.category && !CATEGORY_LABELS[draft.category]) {
    errors.push(`Category "${draft.category}" は不正です（training / boxing / recovery / body-knowledge）。`);
  }
  if (draft.cta_type && !CTA_TYPES.includes(draft.cta_type)) {
    errors.push(`CTA Type "${draft.cta_type}" は不正です。`);
  }
  if (draft.published && !isValidDate(toDateString(draft.published))) {
    errors.push('Published date の形式が不正です（YYYY-MM-DD）。');
  }
  if (draft.updated && !isValidDate(toDateString(draft.updated))) {
    errors.push('Updated date の形式が不正です（YYYY-MM-DD）。');
  }
  if (typeof draft.body_markdown !== 'string' || !draft.body_markdown.trim()) {
    errors.push('本文（Markdown）が空です。');
  } else {
    const body = String(draft.body_markdown);
    // 生成・Bridge側の防御をすり抜けた既存Draftも、壊れたままPublishしない。
    if (!body.includes('\n') && /\\n\\n/.test(body)) {
      errors.push('本文Markdownの改行が文字列 "\\n" のままです。実改行へ正規化してから公開してください。');
    }
  }

  errors.push(...validateBrandAlignmentForPublish(draft));
  return errors;
}

// YAMLのダブルクォート文字列は JSON の文字列エスケープと互換（\" \\ \n \t \uXXXX）。
// JSON.stringify をそのまま使うことで、記号・改行・日本語を安全に出力できる。
function yamlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function yamlLine(key, value) {
  return `${key}: ${yamlString(value)}`;
}

function yamlBool(key, value) {
  return `${key}: ${value ? 'true' : 'false'}`;
}

function yamlKeywords(keywords) {
  const list = Array.isArray(keywords) ? keywords.map((k) => String(k).trim()).filter(Boolean) : [];
  if (!list.length) return 'keywords: []';
  return ['keywords:', ...list.map((k) => `  - ${yamlString(k)}`)].join('\n');
}

// 本文の改行コードを LF へ揃え、末尾に必ず改行を1つ付ける。
function normalizeBody(md) {
  const body = String(md ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  return body ? `${body}\n` : '';
}

/**
 * Draft（Supabaseの1行）→ content/blog/{slug}.md の中身。
 * GitHub出力時のみ status: "published" とする。
 */
export function buildBlogMarkdown(draft) {
  const slug = String(draft.slug || '').trim();
  const category = draft.category || '';
  const lines = [
    '---',
    yamlLine('title', draft.title || ''),
    yamlLine('slug', slug),
    yamlLine('description', draft.description || ''),
    yamlLine('published', toDateString(draft.published)),
    yamlLine('updated', toDateString(draft.updated)),
    yamlLine('category', category),
    // category_label は Draft の保存値ではなく category から自動算出する
    yamlLine('category_label', categoryLabelFor(category)),
    yamlLine('author', draft.author || 'THE REV. CONDITIONING LAB.'),
    yamlLine('author_role', draft.author_role || ''),
    yamlLine('thumbnail', draft.thumbnail || ''),
    yamlLine('og_image', draft.og_image || ''),
    // Content Reference lineage: future image selection can detect exact source-photo reuse.
    yamlLine('content_reference', draft.image_source_path || ''),
    yamlLine('image_asset_version', draft.image_asset_version || ''),
    yamlLine('image_render_version', draft.image_render_version || ''),
    // Source of Truth（GitHub）側は公開記事として出力する
    yamlLine('status', 'published'),
    yamlBool('featured', draft.featured),
    yamlLine('cta_type', draft.cta_type || 'general'),
    yamlKeywords(draft.keywords),
    yamlLine('canonical', draft.canonical || canonicalFor(slug)),
    yamlBool('noindex', draft.noindex),
    '---',
    ''
  ];
  return `${lines.join('\n')}\n${normalizeBody(draft.body_markdown)}`;
}

export function commitMessageFor(draft, mode) {
  const title = String(draft.title || draft.slug || 'article').replace(/\s+/g, ' ').trim();
  return mode === 'create' ? `Publish blog: ${title}` : `Update blog: ${title}`;
}
