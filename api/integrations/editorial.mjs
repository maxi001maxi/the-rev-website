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
//   - Missing article images are prepared automatically before Preview
//   - This endpoint NEVER publishes the article to GitHub. Human approval remains required.
import { createClient } from '@supabase/supabase-js';
import { normalizeArticleInput } from '../../lib/supabaseAdmin.mjs';
import { ensureEditorialImages, EditorialImageError } from '../../lib/editorialImage.mjs';
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

  // First normalize the article itself. Image paths may still be empty here and
  // will be filled automatically before the final sync hash is calculated.
  const normalized = normalizeArticleInput({
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
  if (normalized.errors) {
    return send(res, 422, 'validation_error', normalized.errors.join(' '));
  }
  if (!String(normalized.value.body_markdown || '').trim()) {
    return send(res, 422, 'validation_error', 'body_markdown は必須です。');
  }

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

  // Published drafts keep their original slug. Check before creating any image
  // assets so a rejected slug change cannot leave orphan files in GitHub.
  if (article?.source_path && article.slug !== normalized.value.slug) {
    return send(res, 409, 'slug_locked', `公開済みDraftのslugは変更できません（現在: ${article.slug}）。`);
  }

  // Never take over an unrelated manually-created draft that happens to use
  // the same slug. Check this before generating/copying article images.
  if (!article) {
    const slugConflict = await supabase
      .from('admin_article_drafts')
      .select('id, editorial_source, editorial_content_id')
      .eq('slug', normalized.value.slug)
      .maybeSingle();
    if (slugConflict.error) return send(res, 500, 'db_error', 'slug重複確認に失敗しました。');
    if (slugConflict.data) {
      return send(res, 409, 'slug_conflict', `slug "${normalized.value.slug}" は既存Draftで使用されています。`);
    }
  }

  // Priority: explicitly supplied path -> existing draft path -> automatic image.
  // If only one image path exists, reuse it for both roles rather than creating
  // an unnecessary second visual.
  let thumbnail = normalized.value.thumbnail || article?.thumbnail || null;
  let ogImage = normalized.value.og_image || article?.og_image || null;
  if (thumbnail && !ogImage) ogImage = thumbnail;
  if (ogImage && !thumbnail) thumbnail = ogImage;

  let imageInfo = null;
  if (!thumbnail || !ogImage) {
    try {
      imageInfo = await ensureEditorialImages({
        title: normalized.value.title,
        slug: normalized.value.slug,
        description: normalized.value.description,
        category: normalized.value.category,
        bodyMarkdown: normalized.value.body_markdown,
        primaryQuery: body.primary_query
      });
      thumbnail = thumbnail || imageInfo.thumbnail;
      ogImage = ogImage || imageInfo.ogImage;
    } catch (e) {
      if (e instanceof EditorialImageError) {
        return send(res, e.status || 502, e.code || 'image_automation_failed', e.message);
      }
      return send(res, 502, 'image_automation_failed', '記事画像の自動準備中に予期しないエラーが発生しました。');
    }
  } else {
    imageInfo = {
      strategy: 'existing-draft',
      sourcePath: null,
      generated: false,
      commitSha: null,
      thumbnail,
      ogImage
    };
  }

  const articleValue = {
    ...normalized.value,
    thumbnail,
    og_image: ogImage
  };
  const metadata = normalizeBridgeMetadata(body);
  const syncHash = computeEditorialSyncHash(articleValue, metadata);
  let action = 'unchanged';

  if (!article) {
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
      thumbnail: article.thumbnail || null,
      og_image: article.og_image || null,
      editorial_content_id: article.editorial_content_id,
      editorial_synced_at: article.editorial_synced_at
    },
    image: imageInfo,
    review_url: origin ? `${origin}/admin/articles/review/?id=${encodeURIComponent(article.id)}` : null,
    editor_url: origin ? `${origin}/admin/articles/editor/?id=${encodeURIComponent(article.id)}` : null,
    publish_requires_human_approval: true
  });
}

function send(res, status, error, message) {
  return res.status(status).json({ error, message });
}
