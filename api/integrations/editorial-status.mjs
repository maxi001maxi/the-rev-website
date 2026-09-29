// GET /api/integrations/editorial-status?content_id={id}
// Server-to-server status probe for THE REV. Editorial AI.
// It never publishes. It only checks whether Phase 10 image assets are ready,
// updates the Supabase draft image readiness fields, and returns Review URLs.

import { createClient } from '@supabase/supabase-js';
import {
  BRIDGE_SOURCE,
  bridgeConfig,
  extractBearerSecret,
  originFromRequest,
  safeSecretEqual
} from '../../lib/editorialBridge.mjs';
import { checkEditorialImageReady } from '../../lib/editorialImage.mjs';
import { ensureAutomatedHybridImageJob } from '../../lib/editorialAutomatedHybridImage.mjs';
import { getFile } from '../../lib/githubContent.mjs';
import {
  PUBLISH_STATUS,
  isPublishedMarkdown,
  publishedUrlForSlug,
  targetPathForDraft
} from '../../lib/editorialPublication.mjs';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed', message: 'GETのみサポートしています。' });
  }

  const cfg = bridgeConfig();
  if (!cfg.configured) {
    return res.status(503).json({
      error: 'bridge_not_configured',
      message: `Editorial Bridgeの環境変数が不足しています: ${cfg.missing.join(', ')}`
    });
  }

  const suppliedSecret = extractBearerSecret(req);
  if (!safeSecretEqual(suppliedSecret, process.env.EDITORIAL_BRIDGE_SECRET)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Editorial Bridgeの認証に失敗しました。' });
  }

  const contentId = String(req.query?.content_id || '').trim();
  if (!contentId) {
    return res.status(400).json({ error: 'bad_request', message: 'content_id は必須です。' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const found = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('editorial_source', BRIDGE_SOURCE)
    .eq('editorial_content_id', contentId)
    .maybeSingle();

  if (found.error) {
    return res.status(500).json({ error: 'db_error', message: 'Draftの確認に失敗しました。' });
  }
  if (!found.data) {
    return res.status(404).json({ error: 'not_found', message: '対象Draftが見つかりません。' });
  }

  let article = found.data;
  let readiness = null;

  try {
    // Self-heal legacy PREPARING drafts created before the unattended Hybrid
    // operator existed. A planned path string alone is not a GitHub Job.
    if (
      String(article.image_status || '').toUpperCase() === 'PREPARING' &&
      String(article.image_strategy || '') === 'reference-v2-gpt-image-hybrid-drive-source' &&
      (
        !String(article.image_asset_version || '').trim() ||
        !String(article.thumbnail || '').trim() ||
        !String(article.og_image || '').trim()
      )
    ) {
      const planned = await ensureAutomatedHybridImageJob(article);
      if (planned?.status !== 'EXISTS') {
        const plannedUpdate = await supabase
          .from('admin_article_drafts')
          .update({
            thumbnail: planned.thumbnail || article.thumbnail || null,
            og_image: planned.ogImage || article.og_image || null,
            gbp_image: planned.gbpImage || article.gbp_image || null,
            gbp_image_status: planned.gbpImage ? 'PREPARING' : (article.gbp_image_status || null),
            gbp_image_asset_version: planned.gbpImageAssetVersion || article.gbp_image_asset_version || null,
            gbp_image_checked_at: new Date().toISOString(),
            gbp_image_last_error: null,
            image_status: 'PREPARING',
            image_asset_ready: false,
            image_render_version: planned.renderVersion || article.image_render_version,
            image_strategy: planned.strategy || article.image_strategy,
            image_source_path: planned.sourcePath || article.image_source_path,
            image_checked_at: new Date().toISOString(),
            image_style_template: planned.styleTemplate || article.image_style_template,
            image_headline_short: planned.imageHeadlineShort || article.image_headline_short,
            image_category_label: planned.categoryLabel || article.image_category_label,
            image_series_label: planned.seriesLabel || article.image_series_label,
            image_asset_version: planned.assetVersion || article.image_asset_version,
            image_job_path: planned.jobPath || article.image_job_path,
            image_qa_report_path: planned.qaReportPath || article.image_qa_report_path,
            image_generation_model: planned.generationModel || article.image_generation_model,
            image_qa_model: planned.qaModel || article.image_qa_model,
            image_last_error: null
          })
          .eq('id', article.id)
          .select('*')
          .single();

        if (plannedUpdate.error) {
          throw new Error('Automated Hybrid image planのDraft反映に失敗しました。');
        }
        article = plannedUpdate.data;
      }
    }

    readiness = await checkEditorialImageReady(article);

    if (readiness.ready) {
      const updated = await supabase
        .from('admin_article_drafts')
        .update({
          image_status: 'READY',
          image_asset_ready: true,
          image_checked_at: new Date().toISOString(),
          image_qa: readiness.qa,
          gbp_image_status: article.gbp_image_asset_version ? 'READY' : (article.gbp_image_status || null),
          gbp_image_checked_at: article.gbp_image_asset_version ? new Date().toISOString() : article.gbp_image_checked_at,
          gbp_image_qa: article.gbp_image_asset_version ? {
            pass: readiness.qa?.gbp_aspect_ratio_pass === true && readiness.qa?.gbp_safe_area_pass === true && readiness.qa?.gbp_copy_legible === true,
            aspect_ratio_pass: readiness.qa?.gbp_aspect_ratio_pass === true,
            safe_area_pass: readiness.qa?.gbp_safe_area_pass === true,
            copy_legible: readiness.qa?.gbp_copy_legible === true,
            width: readiness.qa?.gbp_image_width ?? 1200,
            height: readiness.qa?.gbp_image_height ?? 900,
            ratio: readiness.qa?.gbp_image_aspect_ratio || '4:3'
          } : article.gbp_image_qa,
          gbp_image_attempts: article.gbp_image_asset_version ? (article.gbp_image_attempts ?? article.image_attempts ?? 1) : article.gbp_image_attempts,
          gbp_image_last_error: null,
          image_brand_qa_score: Math.min(
            Number(readiness.qa?.series_consistency ?? 0),
            Number(readiness.qa?.article_visual_relevance ?? readiness.qa?.series_consistency ?? 0)
          ) || null,
          image_last_error: null
        })
        .eq('id', article.id)
        .select('*')
        .single();

      if (updated.error) {
        return res.status(500).json({ error: 'db_error', message: '画像READY状態の保存に失敗しました。' });
      }
      article = updated.data;
    } else {
      const updated = await supabase
        .from('admin_article_drafts')
        .update({
          image_status: 'PREPARING',
          image_asset_ready: false,
          image_checked_at: new Date().toISOString(),
          image_last_error: null,
          gbp_image_status: article.gbp_image_asset_version ? 'PREPARING' : article.gbp_image_status,
          gbp_image_checked_at: article.gbp_image_asset_version ? new Date().toISOString() : article.gbp_image_checked_at,
          gbp_image_last_error: null
        })
        .eq('id', article.id)
        .select('*')
        .single();

      if (!updated.error && updated.data) article = updated.data;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown image status error';
    await supabase
      .from('admin_article_drafts')
      .update({
        image_status: 'ERROR',
        image_asset_ready: false,
        image_checked_at: new Date().toISOString(),
        image_last_error: String(message).slice(0, 1000),
        gbp_image_status: article.gbp_image_asset_version ? 'ERROR' : article.gbp_image_status,
        gbp_image_checked_at: article.gbp_image_asset_version ? new Date().toISOString() : article.gbp_image_checked_at,
        gbp_image_last_error: article.gbp_image_asset_version ? String(message).slice(0, 1000) : article.gbp_image_last_error
      })
      .eq('id', article.id);

    return res.status(502).json({
      error: 'image_status_failed',
      message: '画像準備状況の確認に失敗しました。'
    });
  }

  const publication = await reconcilePublication({ supabase, article });
  if (publication.article) article = publication.article;

  const origin = originFromRequest(req);
  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).json({
    ok: true,
    content_id: contentId,
    article: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      image_status: article.image_status || null,
      image_asset_ready: article.image_asset_ready === true,
      image_brand_qa_score: article.image_brand_qa_score ?? null,
      image_asset_version: article.image_asset_version || null,
      image_updated_at: article.image_checked_at || article.editorial_synced_at || null,
      image_render_version: article.image_render_version || null,
      image_strategy: article.image_strategy || null,
      image_style_template: article.image_style_template || null,
      image_headline_short: article.image_headline_short || null,
      image_qa: article.image_qa || null,
      thumbnail: article.thumbnail || null,
      og_image: article.og_image || null,
      gbp_image: article.gbp_image || null,
      gbp_image_status: article.gbp_image_status || null,
      gbp_image_asset_version: article.gbp_image_asset_version || null,
      gbp_image_checked_at: article.gbp_image_checked_at || null,
      gbp_image_qa: article.gbp_image_qa || null,
      publish_status: article.publish_status || PUBLISH_STATUS.NOT_PUBLISHED,
      publish_commit_sha: article.publish_commit_sha || null,
      published_content_sha: article.published_content_sha || null,
      published_url: article.published_url || null,
      publish_committed_at: article.publish_committed_at || null,
      published_at: article.published_at || null,
      publish_verified_at: article.publish_verified_at || null
    },
    publication,
    readiness: {
      ready: readiness?.ready === true,
      reason: readiness?.reason || null
    },
    review_url: origin
      ? `${origin}/admin/articles/review/?id=${encodeURIComponent(article.id)}`
      : null,
    editor_url: origin
      ? `${origin}/admin/articles/editor/?id=${encodeURIComponent(article.id)}`
      : null,
    publish_requires_human_approval: true
  });
}


async function reconcilePublication({ supabase, article }) {
  const path = targetPathForDraft(article);
  const publicUrl = article.published_url || publishedUrlForSlug(article.slug);
  const currentState = article.publish_status || PUBLISH_STATUS.NOT_PUBLISHED;

  if (!path || !publicUrl) {
    return { state: currentState, published: false, github: { exists: false, published: false }, live: { ok: false, status: null }, article };
  }

  let file;
  try {
    file = await getFile(path);
  } catch {
    return {
      state: currentState,
      published: currentState === PUBLISH_STATUS.PUBLISHED,
      github: { exists: null, published: null },
      live: { ok: false, status: null },
      verify_error: 'github_unavailable',
      article
    };
  }

  const githubPublished = file.exists === true && isPublishedMarkdown(file.content);
  if (!githubPublished) {
    return {
      state: currentState,
      published: currentState === PUBLISH_STATUS.PUBLISHED,
      github: { exists: file.exists === true, published: false, sha: file.sha || null },
      live: { ok: false, status: null },
      article
    };
  }

  const live = await verifyLiveArticle(publicUrl);
  const nextState = live.ok ? PUBLISH_STATUS.PUBLISHED : PUBLISH_STATUS.PUBLISH_COMMITTED;
  const now = new Date().toISOString();
  const patch = {
    source_path: file.path || path,
    source_sha: file.sha || article.source_sha || null,
    publish_status: nextState,
    published_content_sha: file.sha || article.published_content_sha || null,
    published_url: publicUrl,
    publish_committed_at: article.publish_committed_at || now,
    publish_verified_at: now,
    ...(live.ok ? { published_at: article.published_at || now } : {})
  };

  const updated = await supabase
    .from('admin_article_drafts')
    .update(patch)
    .eq('id', article.id)
    .select('*')
    .single();

  const nextArticle = !updated.error && updated.data ? updated.data : article;
  return {
    state: nextState,
    published: nextState === PUBLISH_STATUS.PUBLISHED,
    queue_status_recommendation: nextState === PUBLISH_STATUS.PUBLISHED ? 'PUBLISHED' : null,
    github: { exists: true, published: true, sha: file.sha || null },
    live,
    article: nextArticle,
    repair_error: updated.error ? 'db_update_failed' : null
  };
}

async function verifyLiveArticle(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  timer.unref?.();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'User-Agent': 'therev-editorial-publish-reconciler'
      },
      signal: controller.signal
    });
    try { await response.body?.cancel(); } catch { /* no-op */ }
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: null };
  } finally {
    clearTimeout(timer);
  }
}
