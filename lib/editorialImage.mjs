// THE REV. Editorial AI -> Blog image automation (Phase 10 v2)
//
// Goals:
// - Reuse the established first-five column thumbnail design language.
// - Generate article-specific, text-bearing editorial cards before Preview.
// - Keep exact article text inside the artwork as much as possible by editing a
//   real master reference instead of free-form generation.
// - Commit image-only assets with [skip ci]; public deployment happens only
//   after human Publish approval.
// - Never silently fall back to a plain photo when a designed thumbnail fails.

const GITHUB_API = 'https://api.github.com';
const OPENAI_IMAGE_EDITS_API = 'https://api.openai.com/v1/images/edits';
const IMAGE_TIMEOUT_MS = 180000;

export const IMAGE_RENDER_VERSION = 'rev-column-master-v2';

export class EditorialImageError extends Error {
  constructor(code, message, { status = 502, detail = null } = {}) {
    super(message);
    this.name = 'EditorialImageError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function imagePathsForSlug(slug) {
  const safe = String(slug || '').trim().toLowerCase();
  return {
    thumbnailRepoPath: `assets/images/blog/thumb-${safe}.jpg`,
    ogRepoPath: `assets/images/blog/og/og-${safe}.jpg`,
    thumbnailPublicPath: `/assets/images/blog/thumb-${safe}.jpg`,
    ogPublicPath: `/assets/images/blog/og/og-${safe}.jpg`
  };
}

function articleText(article) {
  return [article?.title, article?.description, article?.bodyMarkdown, article?.primaryQuery]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

/**
 * Select authentic THE REV. photography for the article subject.
 * The image model receives this as the content/reference photo, never as a
 * licence to invent a documentary-looking facility scene.
 */
export function selectBrandImageSource(article) {
  const category = String(article?.category || 'training');
  const text = articleText(article);

  if (category === 'boxing') return 'assets/images/photo-boxing.jpg';

  if (category === 'recovery') {
    if (/denba|電場|デンバ/.test(text)) return 'assets/images/photo-solution-denba.jpg';
    if (/酸素|oxygen|オキシ/.test(text)) return 'assets/images/photo-oxyroom.jpg';
    return 'assets/images/photo-solution-oxyroom.jpg';
  }

  if (category === 'training') {
    if (/フォーム|姿勢|動作|指導|初心者|パーソナル|カウンセリング/.test(text)) {
      return 'assets/images/trainer-coaching.jpg';
    }
    return 'assets/images/photo-evolgear.jpg';
  }

  if (/姿勢|フォーム|動作|可動|肩|腰|膝/.test(text)) return 'assets/images/trainer-coaching.jpg';
  if (/疲れ|疲労|休|眠|仕事終わり|コンディション|回復/.test(text)) return 'assets/images/photo-evolgear.jpg';
  return 'assets/images/trainer-coaching.jpg';
}

/**
 * The first five columns are the brand reference. Pick the closest master so
 * every future article inherits the same editorial grammar.
 */
export function selectColumnMaster(article) {
  const category = String(article?.category || 'training');
  const text = articleText(article);

  if (category === 'boxing') return 'assets/images/blog/columns/column-04-boxing-master.jpg';
  if (category === 'recovery') return 'assets/images/blog/columns/column-05-recovery-master.jpg';
  if (category === 'training') {
    if (/体験|初回|選び方|チェック/.test(text)) return 'assets/images/blog/columns/column-03-trial-master.jpg';
    if (/追い込|限界|強度|疲労|疲れ|仕事終わり/.test(text)) return 'assets/images/blog/columns/column-02-push-master.jpg';
    return 'assets/images/blog/columns/column-01-frequency-master.jpg';
  }
  return 'assets/images/blog/columns/column-02-push-master.jpg';
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildEditorialDesignText(article) {
  const full = cleanTitle(article?.title);
  const qIndex = full.indexOf('？');
  let headline = qIndex >= 0 ? full.slice(0, qIndex + 1) : full;
  let subcopy = qIndex >= 0 ? full.slice(qIndex + 1).replace(/^[、。\s]+/, '') : '';

  if (headline.length > 42) headline = headline.slice(0, 41) + '…';
  if (!subcopy && cleanTitle(article?.description)) {
    subcopy = cleanTitle(article.description).slice(0, 28);
  }
  if (subcopy.length > 30) subcopy = subcopy.slice(0, 29) + '…';

  const category = String(article?.category || 'body-knowledge').toUpperCase().replace('-', ' ');
  return {
    label: `${category} / COLUMN`,
    headline,
    subcopy
  };
}

/**
 * Compatibility export retained for Phase 9 tests/callers. It now describes
 * the final text-bearing brand card rather than a text-free illustration.
 */
export function buildEditorialIllustrationPrompt(article) {
  return buildEditorialDesignPrompt(article);
}

/**
 * Compatibility export retained. Phase 10 v2 is deliberately fail-closed:
 * designed artwork requires the image API instead of silently accepting a
 * plain-photo fallback.
 */
export function shouldGenerateIllustration(article, env = process.env) {
  return Boolean(String(env.OPENAI_API_KEY || '').trim());
}

export function buildEditorialDesignPrompt(article) {
  const copy = buildEditorialDesignText(article);
  const title = cleanTitle(article?.title);
  const description = cleanTitle(article?.description);
  return [
    'Create ONE finished editorial thumbnail for THE REV. CONDITIONING LAB. using the supplied images.',
    'Image 1 is the visual/layout master from the existing THE REV. column series. Match its typography scale, whitespace, restrained premium mood, editorial balance and overall design grammar.',
    'Image 2 is authentic THE REV. photography for this article. Use it as the photographic content while keeping the master-image design language.',
    'This must look like the next card in the same existing column series, not like a new campaign and not like a generic fitness advertisement.',
    'Do not invent a different gym interior, equipment, logo or person. Keep the visual identity restrained, quiet, white/neutral and premium.',
    'CRITICAL TEXT RULE: the Japanese copy below must appear as readable display text. Do not paraphrase it, translate it, add extra words or replace kanji/kana.',
    `Small label: 「${copy.label}」`,
    `Main headline: 「${copy.headline}」`,
    copy.subcopy ? `Small supporting line: 「${copy.subcopy}」` : 'Do not add a supporting line.',
    `Full article title for context only: 「${title}」`,
    description ? `Article context: 「${description}」` : '',
    'Keep all important text and faces/subjects inside the central safe area so the artwork still works when social platforms crop from 3:2 toward roughly 1.91:1.',
    'No additional readable copy, no fake badges, no loud gradients, no red/yellow clickbait styling.',
    'Output a polished landscape editorial card.'
  ].filter(Boolean).join('\n');
}

function githubConfig(env) {
  const token = String(env.GITHUB_TOKEN || '').trim();
  const repo = String(env.GITHUB_REPO || '').trim();
  const branch = String(env.GITHUB_BRANCH || 'main').trim();
  if (!token || !repo) {
    throw new EditorialImageError(
      'image_github_not_configured',
      '記事画像の自動配置に必要なGitHub環境変数が不足しています（GITHUB_TOKEN / GITHUB_REPO）。',
      { status: 503 }
    );
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new EditorialImageError('image_github_not_configured', 'GITHUB_REPO の形式が不正です。', { status: 503 });
  }
  return { token, repo, branch };
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return controller.signal;
}

async function githubJson(cfg, path, { method = 'GET', body = null, allow404 = false } = {}) {
  let res;
  try {
    res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'therev-editorial-images',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: timeoutSignal(20000)
    });
  } catch (e) {
    throw new EditorialImageError('image_github_unreachable', 'GitHubへ接続できず、記事画像を保存できませんでした。', { detail: e?.name || null });
  }

  if (allow404 && res.status === 404) return null;
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    throw new EditorialImageError(
      'image_github_error',
      `GitHubへの記事画像保存に失敗しました（HTTP ${res.status}）。`,
      { status: 502, detail: data?.message || null }
    );
  }
  return data;
}

function encodeContentPath(filePath) {
  return String(filePath).split('/').map(encodeURIComponent).join('/');
}

async function githubFile(cfg, filePath) {
  const data = await githubJson(
    cfg,
    `/repos/${cfg.repo}/contents/${encodeContentPath(filePath)}?ref=${encodeURIComponent(cfg.branch)}`,
    { allow404: true }
  );
  if (!data) return null;
  if (Array.isArray(data) || data.type !== 'file') {
    throw new EditorialImageError('image_source_invalid', `画像ソース ${filePath} がファイルではありません。`);
  }
  return data;
}

function fileBase64(file, filePath) {
  if (!file?.content) {
    throw new EditorialImageError('image_source_missing', `画像ソース ${filePath} の内容を取得できません。`);
  }
  return String(file.content).replace(/\s+/g, '');
}

async function sourceImageBase64(cfg, filePath) {
  return fileBase64(await githubFile(cfg, filePath), filePath);
}

function base64DataUrl(base64, mime = 'image/jpeg') {
  return `data:${mime};base64,${String(base64 || '').replace(/\s+/g, '')}`;
}

async function generateDesignedImageBase64(article, cfg, env) {
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new EditorialImageError(
      'image_ai_not_configured',
      '文字入りTHE REV.サムネイルの生成に必要な OPENAI_API_KEY が設定されていません。',
      { status: 503 }
    );
  }

  const masterPath = selectColumnMaster(article);
  const sourcePath = selectBrandImageSource(article);
  const [masterBase64, sourceBase64] = await Promise.all([
    sourceImageBase64(cfg, masterPath),
    sourceImageBase64(cfg, sourcePath)
  ]);

  const form = new FormData();
  form.append('model', String(env.EDITORIAL_IMAGE_MODEL || 'gpt-image-1.5').trim());
  form.append('prompt', buildEditorialDesignPrompt(article));
  form.append('images', JSON.stringify([
    { image_url: base64DataUrl(masterBase64) },
    { image_url: base64DataUrl(sourceBase64) }
  ]));
  form.append('input_fidelity', 'high');
  form.append('n', '1');
  form.append('size', '1536x1024');
  form.append('quality', String(env.EDITORIAL_IMAGE_QUALITY || 'medium').trim());
  form.append('output_format', 'jpeg');
  form.append('output_compression', '90');
  form.append('background', 'opaque');

  let res;
  try {
    res = await fetch(OPENAI_IMAGE_EDITS_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: timeoutSignal(IMAGE_TIMEOUT_MS)
    });
  } catch (e) {
    throw new EditorialImageError('image_ai_unreachable', '文字入り記事サムネイルの生成APIへ接続できませんでした。', { detail: e?.name || null });
  }

  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || !data?.data?.[0]?.b64_json) {
    throw new EditorialImageError(
      'image_design_failed',
      `文字入り記事サムネイルの生成に失敗しました（HTTP ${res.status}）。Preview公開を停止しました。`,
      { status: 502, detail: data?.error?.code || data?.error?.message || null }
    );
  }

  return {
    base64: String(data.data[0].b64_json).replace(/\s+/g, ''),
    masterPath,
    sourcePath
  };
}

async function commitBase64Files(cfg, files, message) {
  if (!files.length) return null;

  const ref = await githubJson(cfg, `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
  const headSha = ref?.object?.sha;
  if (!headSha) throw new EditorialImageError('image_github_error', 'GitHub branch HEADを取得できませんでした。');

  const commit = await githubJson(cfg, `/repos/${cfg.repo}/git/commits/${headSha}`);
  const baseTreeSha = commit?.tree?.sha;
  if (!baseTreeSha) throw new EditorialImageError('image_github_error', 'GitHub base treeを取得できませんでした。');

  const tree = [];
  for (const file of files) {
    const blob = await githubJson(cfg, `/repos/${cfg.repo}/git/blobs`, {
      method: 'POST',
      body: { content: file.base64, encoding: 'base64' }
    });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await githubJson(cfg, `/repos/${cfg.repo}/git/trees`, {
    method: 'POST',
    body: { base_tree: baseTreeSha, tree }
  });
  const newCommit = await githubJson(cfg, `/repos/${cfg.repo}/git/commits`, {
    method: 'POST',
    body: { message, tree: newTree.sha, parents: [headSha] }
  });

  await githubJson(cfg, `/repos/${cfg.repo}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
    method: 'PATCH',
    body: { sha: newCommit.sha, force: false }
  });
  return newCommit.sha;
}

/**
 * Ensure final, text-bearing article artwork exists in GitHub.
 *
 * force=true is used when the Draft was produced by an older render version.
 * In Phase 10 v2 a failed image design is a hard stop; we never silently ship a
 * plain photo because that recreates the exact visual inconsistency this phase
 * exists to remove.
 */
export async function ensureEditorialImages(article, { env = process.env, force = false } = {}) {
  const cfg = githubConfig(env);
  const paths = imagePathsForSlug(article?.slug);

  const [thumbExisting, ogExisting] = await Promise.all([
    githubFile(cfg, paths.thumbnailRepoPath),
    githubFile(cfg, paths.ogRepoPath)
  ]);

  if (!force && thumbExisting && ogExisting) {
    return {
      status: 'READY',
      strategy: 'reuse-existing-designed',
      renderVersion: IMAGE_RENDER_VERSION,
      assetReady: true,
      sourcePath: null,
      masterPath: null,
      generated: false,
      commitSha: null,
      thumbnail: paths.thumbnailPublicPath,
      ogImage: paths.ogPublicPath
    };
  }

  const designed = await generateDesignedImageBase64(article, cfg, env);
  const files = [
    { path: paths.thumbnailRepoPath, base64: designed.base64 },
    { path: paths.ogRepoPath, base64: designed.base64 }
  ];

  const commitSha = await commitBase64Files(
    cfg,
    files,
    `Editorial designed images: ${article.slug} [skip ci]`
  );

  return {
    status: 'READY',
    strategy: 'editorial-master-edit',
    renderVersion: IMAGE_RENDER_VERSION,
    assetReady: true,
    sourcePath: designed.sourcePath,
    masterPath: designed.masterPath,
    generated: true,
    commitSha,
    thumbnail: paths.thumbnailPublicPath,
    ogImage: paths.ogPublicPath
  };
}
