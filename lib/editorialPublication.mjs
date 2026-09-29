// THE REV. Editorial publish-state helpers.
//
// Human approval writes the article to GitHub first. Production deployment can
// complete later, so publication is intentionally split into:
// NOT_PUBLISHED -> PUBLISH_COMMITTED -> PUBLISHED.

import { SITE_URL, contentPathFor } from './blogMarkdown.mjs';

export const PUBLISH_STATUS = Object.freeze({
  NOT_PUBLISHED: 'NOT_PUBLISHED',
  PUBLISH_COMMITTED: 'PUBLISH_COMMITTED',
  PUBLISHED: 'PUBLISHED'
});

export const ACTIVE_QUEUE_STATUSES = Object.freeze([
  'NEW',
  'KNOWLEDGE_CHECK',
  'INTERVIEW_WAITING',
  'INTERVIEW_COMPLETE',
  'DRAFTING',
  'QC',
  'IMAGE_PREPARING',
  'REVIEW_READY',
  'ERROR'
]);

export const TERMINAL_QUEUE_STATUSES = Object.freeze([
  'PUBLISHED',
  'SKIPPED'
]);

export function publishedUrlForSlug(slug) {
  const clean = String(slug || '').trim();
  return clean ? `${SITE_URL}/blog/${clean}/` : null;
}

export function targetPathForDraft(draft) {
  if (String(draft?.source_path || '').trim()) return String(draft.source_path).trim();
  const slug = String(draft?.slug || '').trim();
  return slug ? contentPathFor(slug) : null;
}

export function isPublishedMarkdown(content) {
  const text = String(content || '');
  if (!text.startsWith('---')) return false;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return false;
  const frontMatter = text.slice(0, end);
  return /^status:\s*(?:"published"|'published'|published)\s*$/mi.test(frontMatter);
}

export function publicationFieldsFromGitHubWrite({ draft, written, publicUrl = null, now = new Date() }) {
  const committedAt = now instanceof Date ? now.toISOString() : String(now);
  return {
    source_path: written?.path || targetPathForDraft(draft),
    source_sha: written?.contentSha || null,
    publish_status: PUBLISH_STATUS.PUBLISH_COMMITTED,
    publish_commit_sha: written?.commitSha || null,
    published_content_sha: written?.contentSha || null,
    published_url: publicUrl || publishedUrlForSlug(draft?.slug),
    publish_committed_at: committedAt,
    published_at: null,
    publish_verified_at: null
  };
}

export function isTerminalQueueStatus(status) {
  return TERMINAL_QUEUE_STATUSES.includes(String(status || '').trim().toUpperCase());
}

export function isActiveQueueStatus(status) {
  return ACTIVE_QUEUE_STATUSES.includes(String(status || '').trim().toUpperCase());
}
