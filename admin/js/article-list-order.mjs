// Publication checks can update old records. Keep the work list stable.
export function articleListState(article) {
  const status = String(article.publish_status || '').trim();
  if (status === 'PUBLISHED' && article.publish_verified_at) return 'PUBLISHED';
  if (status === 'PUBLISH_COMMITTED') return 'PUBLISHING';
  return 'DRAFT';
}

export function sortArticleList(articles = []) {
  const rank = { DRAFT: 0, PUBLISHING: 1, PUBLISHED: 2 };
  const created = (a) => Date.parse(a.created_at || '') || 0;
  return [...articles].sort((a, b) =>
    rank[articleListState(a)] - rank[articleListState(b)] ||
    created(b) - created(a) || String(a.id || '').localeCompare(String(b.id || '')));
}
