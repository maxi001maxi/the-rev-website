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
import { ensureEditorialImages, EditorialImageError, IMAGE_RENDER_VERSION } from '../../lib/editorialImage.mjs';
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

  // Normalize text/article fields first. Image paths may still be empty and are
  // filled automatically before the final sync hash is calculated.
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

  // Published drafts keep their original slug. Reject before preparing image
  // assets so a bad slug edit cannot leave orphan files in GitHub.
  if (article?.source_path && article.slug !== normalized.value.slug) {
    return send(res, 409, 'slug_locked', `公開済みDraftのslugは変更できません（現在: ${article.slug}）。`);
  }

  // Never take over an unrelated manually-created draft with the same slug.
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

  // Phase 10 v2: Editorial AI drafts must use the current designed-image
  // render version. Existing paths alone are not enough because an older plain
  // photo may still be sitting at the same URL.
  let thumbnail = normalized.value.thumbnail || article?.thumbnail || null;
  let ogImage = normalized.value.og_image || article?.og_image || null;
  if (thumbnail && !ogImage) ogImage = thumbnail;
  if (ogImage && !thumbnail) thumbnail = ogImage;

  const imageNeedsRefresh =
    !thumbnail ||
    !ogImage ||
    article?.image_render_version !== IMAGE_RENDER_VERSION ||
    article?.image_asset_ready !== true;

  let imageInfo = null;
  if (imageNeedsRefresh) {
    try {
      imageInfo = await ensureEditorialImages({
        title: normalized.value.title,
        slug: normalized.value.slug,
        description: normalized.value.description,
        category: normalized.value.category,
        bodyMarkdown: normalized.value.body_markdown,
        primaryQuery: body.primary_query
      }, { force: Boolean(article) });

      thumbnail = imageInfo.thumbnail;
      ogImage = imageInfo.ogImage;
    } catch (e) {
      if (article?.id) {
        await supabase
          .from('admin_article_drafts')
          .update({
            image_status: 'ERROR',
            image_asset_ready: false,
            image_last_error: e instanceof Error ? String(e.message).slice(0, 1000) : 'unknown image error',
            image_checked_at: new Date().toISOString()
          })
          .eq('id', article.id);
      }
      if (e instanceof EditorialImageError) {
        return send(res, e.status || 502, e.code || 'image_automation_failed', e.message);
      }
      return send(res, 502, 'image_automation_failed', '文字入り記事画像の自動準備中に予期しないエラーが発生しました。Preview公開を停止しました。');
    }
  } else {
    imageInfo = {
      status: article.image_status || 'READY',
      strategy: article.image_strategy || 'existing-designed',
      renderVersion: article.image_render_version,
      assetReady: true,
      sourcePath: article.image_source_path || null,
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
  const imageState = {
    image_status: 'READY',
    image_render_version: imageInfo.renderVersion || IMAGE_RENDER_VERSION,
    image_strategy: imageInfo.strategy || null,
    image_source_path: imageInfo.sourcePath || null,
    image_asset_ready: imageInfo.assetReady === true,
    image_checked_at: new Date().toISOString(),
    image_last_error: null
  };
  const metadata = normalizeBridgeMetadata(body);
  // Do not hash timestamps. The render version/strategy is stable and is enough
  // to force one update when the image design system changes.
  const syncHash = computeEditorialSyncHash({
    ...articleValue,
    image_render_version: imageState.image_render_version,
    image_strategy: imageState.image_strategy
  }, metadata);
  let action = 'unchanged';

  if (!article) {
    const inserted = await supabase
      .from('admin_article_drafts')
      .insert({
        ...articleValue,
        ...imageState,
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
        ...imageState,
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
      editorial_synced_at: article.editorial_synced_at,
      image_status: article.image_status || null,
      image_render_version: article.image_render_version || null,
      image_asset_ready: article.image_asset_ready === true,
      image_strategy: article.image_strategy || null
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
