// Admin API（/api/admin/**）共有ヘルパー。
// service role / secret keyは使用しない。SUPABASE_URL / SUPABASE_PUBLISHABLE_KEYのみで、
// リクエストのAuthorizationヘッダ（Supabase Authのaccess token）をそのままSupabaseへ
// 引き継いだクライアントを作る。以降のDB操作はすべて「そのユーザーとして」実行されるため、
// 認可の実体はSupabase側のRow Level Security（auth.uid() = user_id）が担う。
// このAPI層は「未認証を弾く」「入力を検証する」「statusを常にdraftへ強制する」役割。
import { createClient } from '@supabase/supabase-js';

export const CATEGORIES = ['training', 'boxing', 'recovery', 'body-knowledge'];
export const CTA_TYPES = ['personal-training', 'boxing', 'recovery', 'general'];
const CATEGORY_LABELS = {
  training: 'TRAINING',
  boxing: 'BOXING',
  recovery: 'RECOVERY',
  'body-knowledge': 'BODY KNOWLEDGE'
};

export async function getAuthedContext(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    return { error: 'not_configured', status: 503 };
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { error: 'unauthorized', status: 401 };
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { error: 'unauthorized', status: 401 };
  }

  return { supabase, user: data.user };
}

export function sendError(res, status, code, message) {
  res.status(status).json({ error: code, message });
}

// slug: 半角英数とハイフンのみ。空は不可。
export function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug);
}

// OpenAI / Apps Script等の境界で、Markdown改行が二重escapeされ
// "\\n\\n" という2文字列のまま届く事故を防ぐ。
// 実改行が1つでも存在する本文や、単発の "\\n"（コード例等）は触らない。
export function normalizeMarkdownInput(value) {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n');
  if (normalized.includes('\n')) return normalized;
  if (!/\\n\\n/.test(normalized)) return normalized;
  return normalized
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n');
}

// クライアントからの入力を「保存してよい形」へ正規化する。
// status はここでは絶対に受け取らず、常に 'draft' を返す
// （Admin UI/APIのどちらからもpublishedにできないようにするため）。
export function normalizeArticleInput(body) {
  const errors = [];
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const category = typeof body?.category === 'string' ? body.category : null;
  const ctaType = typeof body?.cta_type === 'string' && body.cta_type ? body.cta_type : null;
  const bodyMarkdown = normalizeMarkdownInput(
    typeof body?.body_markdown === 'string' ? body.body_markdown : ''
  );
  const author = typeof body?.author === 'string' && body.author.trim() ? body.author.trim() : 'THE REV. CONDITIONING LAB.';
  const authorRole = typeof body?.author_role === 'string' ? body.author_role.trim() : '';
  const thumbnail = typeof body?.thumbnail === 'string' ? body.thumbnail.trim() : '';
  const ogImage = typeof body?.og_image === 'string' ? body.og_image.trim() : '';
  const published = typeof body?.published === 'string' && body.published ? body.published : null;
  const updated = typeof body?.updated === 'string' && body.updated ? body.updated : null;
  const featured = Boolean(body?.featured);
  const noindex = Boolean(body?.noindex);
  const keywords = Array.isArray(body?.keywords)
    ? body.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];

  if (!title) errors.push('title は必須です。');
  if (!slug) errors.push('slug は必須です。');
  else if (!isValidSlug(slug)) errors.push('slug は半角英数字とハイフン（a-z 0-9 -）のみ使用できます。');
  if (!description) errors.push('description は必須です。');
  if (!category || !CATEGORIES.includes(category)) errors.push('category が不正です。');
  if (ctaType && !CTA_TYPES.includes(ctaType)) errors.push('cta_type が不正です。');

  if (errors.length) return { errors };

  return {
    value: {
      title,
      slug,
      description,
      category,
      category_label: CATEGORY_LABELS[category] || null,
      author,
      author_role: authorRole || null,
      thumbnail: thumbnail || null,
      og_image: ogImage || null,
      published,
      updated,
      featured,
      noindex,
      cta_type: ctaType,
      keywords,
      body_markdown: bodyMarkdown,
      status: 'draft'
    }
  };
}
