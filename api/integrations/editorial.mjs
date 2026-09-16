// POST /api/integrations/editorial
//
// Server-to-server bridge from THE REV. Editorial AI (Google Apps Script)
// into the Editorial Console Working Draft table.
//
// Safety model:
//   - Shared bearer secret (EDITORIAL_BRIDGE_SECRET)
//   - Service-role key is used only inside this Vercel Function
//   - Target owner is fixed to ADMIN_PUBLISHER_USER_ID
//   - Only READY + Fact PASS + Topic Gate PUBLISH payloads are accepted
//   - This endpoint NEVER publishes to GitHub. Human approval remains required.
import { createClient } from '@supabase/supabase-js';
import { normalizeArticleInput } from '../../lib/supabaseAdmin.mjs';
import {
  BRIDGE_SOURCE,
  bridgeConfig,
  computeEditorialSyncHash,
  extractBearerSecret,
  normalizeBridgeMetadata,
  originFromRequest,
  safeSecretEqual,
  validateBridgeEnvelope
} from '../../lib/editorialBridge.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, 'method_not_allowed', 'POSTのみサポートしています。');
  }

  const cfg = bridgeConfig();
  if (!cfg.configured) {
    return send(res, 503, 'bridge_not_configured', `Editorial Bridgeの環境変数が不足しています: ${cfg.missing.join(', ')}`);
  }

  const suppliedSecret = extractBearerSecret(req);
  if (!safeSecretEqual(suppliedSecret, process.env.EDITORIAL_BRIDGE_SECRET)) {
    return send(res, 401, 'unauthorized', 'Editorial Bridgeの認証に失敗しました。');
  }

  const body = req.body || {};
  const envelope = validateBridgeEnvelope(body);
  if (envelope.errors.length) {
    return send(res, 422, 'editorial_gate_failed', envelope.errors.join(' '));
  }

  const { value: articleValue, errors: articleErrors } = normalizeArticleInput({
    title: body.title,
    slug: body.slug,
    description: body.description,
    category: body.category,
    cta_type: body.cta_type,
    body_markdown: body.body_markdown,
    author: body.author,
    author_role: body.author_role,
    thumbnail: body.thumbnail,
    og_image: body.og_image,
    published: body.published,
    updated: body.updated,
    featured: body.featured,
    noindex: body.noindex,
    keywords: body.keywords
  });
  if (articleErrors) {
    return send(res, 422, 'validation_error', articleErrors.join(' '));
  }
  if (!String(articleValue.body_markdown || '').trim()) {
    return send(res, 422, 'validation_error', 'body_markdown は必須です。');
  }

  const metadata = normalizeBridgeMetadata(body);
  const syncHash = computeEditorialSyncHash(articleValue, metadata);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const existing = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('editorial_source', BRIDGE_SOURCE)
    .eq('editorial_content_id', envelope.value.contentId)
    .maybeSingle();
  if (existing.error) return send(res, 500, 'db_error', '既存Draftの確認に失敗しました。');

  let article = existing.data || null;
  let action = 'unchanged';

  if (!article) {
    // Never take over an unrelated manually-created draft that happens to use
    // the same slug. A human must resolve that conflict in the Console.
    const slugConflict = await supabase
      .from('admin_article_drafts')
      .select('id, editorial_source, editorial_content_id')
      .eq('slug', articleValue.slug)
      .maybeSingle();
    if (slugConflict.error) return send(res, 500, 'db_error', 'slug重複確認に失敗しました。');
    if (slugConflict.data) {
      return send(res, 409, 'slug_conflict', `slug "${articleValue.slug}" は既存Draftで使用されています。`);
    }

    const inserted = await supabase
      .from('admin_article_drafts')
      .insert({
        ...articleValue,
        user_id: process.env.ADMIN_PUBLISHER_USER_ID,
        editorial_source: BRIDGE_SOURCE,
        editorial_content_id: envelope.value.contentId,
        editorial_week_start: envelope.value.weekStart,
        editorial_sync_hash: syncHash,
        editorial_synced_at: new Date().toISOString()
      })
      .select()
      .single();
    if (inserted.error) {
      if (inserted.error.code === '23505') return send(res, 409, 'slug_conflict', `slug "${articleValue.slug}" はすでに使用されています。`);
      return send(res, 500, 'db_error', 'Editorial Console Draftの作成に失敗しました。');
    }
    article = inserted.data;
    action = 'created';
  } else if (article.editorial_sync_hash !== syncHash) {
    // Published drafts may still be updated as Working Drafts; publishing the
    // new revision still requires the normal Review -> Preflight -> Publish flow.
    // Slug remains locked after first publish.
    if (article.source_path && article.slug !== articleValue.slug) {
      return send(res, 409, 'slug_locked', `公開済みDraftのslugは変更できません（現在: ${article.slug}）。`);
    }

    const updated = await supabase
      .from('admin_article_drafts')
      .update({
        ...articleValue,
        editorial_week_start: envelope.value.weekStart,
        editorial_sync_hash: syncHash,
        editorial_synced_at: new Date().toISOString()
      })
      .eq('id', article.id)
      .select()
      .single();
    if (updated.error) {
      if (updated.error.code === '23505') return send(res, 409, 'slug_conflict', `slug "${articleValue.slug}" はすでに使用されています。`);
      return send(res, 500, 'db_error', 'Editorial Console Draftの更新に失敗しました。');
    }
    article = updated.data;
    action = 'updated';
  }

  const origin = originFromRequest(req);
  return res.status(action === 'created' ? 201 : 200).json({
    ok: true,
    action,
    article: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      source_path: article.source_path || null,
      editorial_content_id: article.editorial_content_id,
      editorial_synced_at: article.editorial_synced_at
    },
    review_url: origin ? `${origin}/admin/articles/review/?id=${encodeURIComponent(article.id)}` : null,
    editor_url: origin ? `${origin}/admin/articles/editor/?id=${encodeURIComponent(article.id)}` : null,
    publish_requires_human_approval: true
  });
}

function send(res, status, error, message) {
  return res.status(status).json({ error, message });
}
