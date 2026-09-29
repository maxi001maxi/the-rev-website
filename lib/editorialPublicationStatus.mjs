// THE REV. Editorial publication reconciliation.
//
// A GitHub Contents write is only the first half of publication. PUBLISHED is
// durable only after the exact publish commit's Deploy to Xserver workflow
// completed successfully and the target production URL responds.

import { getFile, getWorkflowRunForCommit } from './githubContent.mjs';
import {
  PUBLISH_STATUS,
  isPublishedMarkdown,
  publishedUrlForSlug,
  targetPathForDraft
} from './editorialPublication.mjs';

export function deploymentSucceededForCommit(deployment, commitSha) {
  const sha = String(commitSha || '').trim();
  if (!sha || !deployment?.found) return false;
  return (
    String(deployment.headSha || deployment.commitSha || '') === sha
    && deployment.status === 'completed'
    && deployment.conclusion === 'success'
  );
}

export function publicationCanPromote({ deployment, commitSha, live }) {
  return deploymentSucceededForCommit(deployment, commitSha) && live?.ok === true;
}

export async function reconcilePublication({
  supabase,
  article,
  getFileFn = getFile,
  getWorkflowRunForCommitFn = getWorkflowRunForCommit,
  verifyLiveArticleFn = verifyLiveArticle
}) {
  const path = targetPathForDraft(article);
  const publicUrl = article?.published_url || publishedUrlForSlug(article?.slug);
  const currentState = article?.publish_status || PUBLISH_STATUS.NOT_PUBLISHED;
  const commitSha = String(article?.publish_commit_sha || '').trim();

  if (!path || !publicUrl) {
    return {
      state: currentState,
      published: currentState === PUBLISH_STATUS.PUBLISHED,
      github: { exists: false, published: false },
      deployment: { found: false, commitSha: commitSha || null, status: null, conclusion: null },
      live: { ok: false, status: null },
      article
    };
  }

  let file;
  try {
    file = await getFileFn(path);
  } catch {
    return {
      state: currentState,
      published: currentState === PUBLISH_STATUS.PUBLISHED,
      github: { exists: null, published: null },
      deployment: { found: null, commitSha: commitSha || null, status: null, conclusion: null },
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
      deployment: { found: false, commitSha: commitSha || null, status: null, conclusion: null },
      live: { ok: false, status: null },
      article
    };
  }

  // Legacy records created before publish_commit_sha existed cannot be tied to
  // an exact workflow run. Preserve the previous live-URL repair behavior only
  // for those records so old articles are not stranded forever.
  if (!commitSha) {
    const live = await verifyLiveArticleFn(publicUrl);
    if (!live.ok) {
      return {
        state: currentState,
        published: currentState === PUBLISH_STATUS.PUBLISHED,
        github: { exists: true, published: true, sha: file.sha || null },
        deployment: {
          found: null,
          commitSha: null,
          status: 'legacy_no_commit_sha',
          conclusion: null
        },
        live,
        article
      };
    }

    const now = new Date().toISOString();
    const patch = {
      source_path: file.path || path,
      source_sha: file.sha || article.source_sha || null,
      publish_status: PUBLISH_STATUS.PUBLISHED,
      published_content_sha: file.sha || article.published_content_sha || null,
      published_url: publicUrl,
      publish_committed_at: article.publish_committed_at || now,
      published_at: article.published_at || now,
      publish_verified_at: now
    };
    const updated = await updateArticlePublication(supabase, article.id, patch);
    return {
      state: PUBLISH_STATUS.PUBLISHED,
      published: true,
      queue_status_recommendation: 'PUBLISHED',
      github: { exists: true, published: true, sha: file.sha || null },
      deployment: {
        found: null,
        commitSha: null,
        status: 'legacy_no_commit_sha',
        conclusion: null
      },
      live,
      article: updated.article || article,
      repair_error: updated.error ? 'db_update_failed' : null
    };
  }

  let deployment;
  try {
    deployment = await getWorkflowRunForCommitFn(commitSha);
  } catch {
    return {
      state: currentState,
      published: currentState === PUBLISH_STATUS.PUBLISHED,
      github: { exists: true, published: true, sha: file.sha || null },
      deployment: { found: null, commitSha, status: null, conclusion: null },
      live: { ok: false, status: null },
      verify_error: 'github_actions_unavailable',
      article
    };
  }

  if (!deployment?.found) {
    return {
      state: currentState,
      published: currentState === PUBLISH_STATUS.PUBLISHED,
      github: { exists: true, published: true, sha: file.sha || null },
      deployment: {
        found: false,
        commitSha,
        status: null,
        conclusion: null
      },
      live: { ok: false, status: null },
      article
    };
  }

  if (!deploymentSucceededForCommit(deployment, commitSha)) {
    return {
      state: currentState,
      published: currentState === PUBLISH_STATUS.PUBLISHED,
      github: { exists: true, published: true, sha: file.sha || null },
      deployment,
      live: { ok: false, status: null },
      article
    };
  }

  const live = await verifyLiveArticleFn(publicUrl);
  if (!publicationCanPromote({ deployment, commitSha, live })) {
    return {
      state: currentState,
      published: currentState === PUBLISH_STATUS.PUBLISHED,
      github: { exists: true, published: true, sha: file.sha || null },
      deployment,
      live,
      article
    };
  }

  const now = new Date().toISOString();
  const patch = {
    source_path: file.path || path,
    source_sha: file.sha || article.source_sha || null,
    publish_status: PUBLISH_STATUS.PUBLISHED,
    published_content_sha: file.sha || article.published_content_sha || null,
    published_url: publicUrl,
    publish_committed_at: article.publish_committed_at || now,
    published_at: article.published_at || now,
    publish_verified_at: now
  };
  const updated = await updateArticlePublication(supabase, article.id, patch);

  return {
    state: PUBLISH_STATUS.PUBLISHED,
    published: true,
    queue_status_recommendation: 'PUBLISHED',
    github: { exists: true, published: true, sha: file.sha || null },
    deployment,
    live,
    article: updated.article || article,
    repair_error: updated.error ? 'db_update_failed' : null
  };
}

async function updateArticlePublication(supabase, articleId, patch) {
  const updated = await supabase
    .from('admin_article_drafts')
    .update(patch)
    .eq('id', articleId)
    .select('*')
    .single();

  return {
    article: !updated.error && updated.data ? updated.data : null,
    error: updated.error || null
  };
}

export async function verifyLiveArticle(url) {
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
