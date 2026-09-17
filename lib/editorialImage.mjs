// THE REV. Editorial AI -> Blog image automation (Phase 10)
//
// Goals:
// - Decide an image strategy from article theme/category.
// - Prefer authentic THE REV. photography for service-led articles.
// - Optionally generate a clearly editorial illustration for conceptual articles.
// - Always prepare article-specific Thumbnail / OGP files before Preview.
// - Commit image-only assets with [skip ci] so an unapproved article is not deployed.

const GITHUB_API = 'https://api.github.com';
const OPENAI_IMAGES_API = 'https://api.openai.com/v1/images/generations';
const IMAGE_TIMEOUT_MS = 150000;

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
 * Deterministically select an authentic THE REV. asset when real photography is
 * more appropriate than a generated illustration, or when image AI is unavailable.
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

  // BODY KNOWLEDGE: never fabricate a documentary-looking photo of the facility.
  if (/姿勢|フォーム|動作|可動|肩|腰|膝/.test(text)) return 'assets/images/trainer-coaching.jpg';
  if (/疲れ|疲労|休|眠|仕事終わり|コンディション|回復/.test(text)) return 'assets/images/photo-evolgear.jpg';
  return 'assets/images/trainer-coaching.jpg';
}

export function buildEditorialIllustrationPrompt(article) {
  const title = String(article?.title || '').trim();
  const description = String(article?.description || '').trim();
  const body = String(article?.bodyMarkdown || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  const category = String(article?.category || 'body-knowledge');

  const categoryDirection = {
    training: 'controlled training effort, technique, equipment and sustainable progression',
    boxing: 'boxing practice, rhythm, controlled movement and learning',
    recovery: 'recovery, calm breathing, rest and decompression after training',
    'body-knowledge': 'body awareness, fatigue management, movement quality and choosing the right effort for the day'
  }[category] || 'body awareness and sustainable training';

  return [
    'Create one refined editorial illustration for a column on the THE REV. CONDITIONING LAB. website.',
    'It must clearly look like an editorial illustration, NOT a photograph and NOT a depiction of the actual THE REV. facility.',
    'No readable text, no logos, no brand marks, no medical labels, no before-and-after transformation.',
    'Visual direction: quiet premium editorial, Japanese boutique wellness and training magazine, restrained charcoal, warm off-white and natural wood tones, soft contrast, sophisticated negative space.',
    `Article category: ${category}. Visual theme: ${categoryDirection}.`,
    `Article title: ${title}.`,
    description ? `Article summary: ${description}.` : '',
    body ? `Context: ${body}.` : '',
    'Use simple symbolic objects or non-identifiable human silhouettes. Avoid dramatic sweat, bodybuilding clichés, hospital imagery, injury imagery and exaggerated fitness advertising.',
    'Wide landscape composition with generous safe margins. It must crop well for a 3:2 blog card and a 1.91:1 social OGP.',
    'The result should feel calm, observant, useful, credible and consistent with a premium editorial website.'
  ].filter(Boolean).join('\n');
}

export function shouldGenerateIllustration(article, env = process.env) {
  if (!String(env.OPENAI_API_KEY || '').trim()) return false;
  const mode = String(env.EDITORIAL_IMAGE_AI_MODE || 'conceptual_only').trim().toLowerCase();
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return String(article?.category || '') === 'body-knowledge';
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

async function generateIllustrationBase64(article, env) {
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new EditorialImageError('image_ai_not_configured', 'OPENAI_API_KEY が設定されていません。', { status: 503 });
  }

  // GPT Image 2 supports arbitrary sizes within documented constraints. 1536x800
  // is approximately 1.92:1, so one generated source crops cleanly for both OGP
  // and the site's 3:2 article cards.
  const payload = {
    model: String(env.EDITORIAL_IMAGE_MODEL || 'gpt-image-2').trim(),
    prompt: buildEditorialIllustrationPrompt(article),
    n: 1,
    size: '1536x800',
    quality: String(env.EDITORIAL_IMAGE_QUALITY || 'medium').trim(),
    output_format: 'jpeg',
    output_compression: 88,
    background: 'opaque'
  };

  let res;
  try {
    res = await fetch(OPENAI_IMAGES_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal(IMAGE_TIMEOUT_MS)
    });
  } catch (e) {
    throw new EditorialImageError('image_ai_unreachable', '記事用イラストの生成APIへ接続できませんでした。', { detail: e?.name || null });
  }

  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || !data?.data?.[0]?.b64_json) {
    throw new EditorialImageError(
      'image_ai_failed',
      `記事用イラストの生成に失敗しました（HTTP ${res.status}）。`,
      { detail: data?.error?.code || data?.error?.message || null }
    );
  }
  return String(data.data[0].b64_json).replace(/\s+/g, '');
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
 * Ensure article-specific Thumbnail and OGP files exist in GitHub.
 * Existing article-specific files are reused, making repeated sync idempotent.
 */
export async function ensureEditorialImages(article, { env = process.env } = {}) {
  const cfg = githubConfig(env);
  const paths = imagePathsForSlug(article?.slug);

  const [thumbExisting, ogExisting] = await Promise.all([
    githubFile(cfg, paths.thumbnailRepoPath),
    githubFile(cfg, paths.ogRepoPath)
  ]);

  if (thumbExisting && ogExisting) {
    return {
      status: 'READY',
      strategy: 'reuse-existing',
      sourcePath: null,
      generated: false,
      commitSha: null,
      thumbnail: paths.thumbnailPublicPath,
      ogImage: paths.ogPublicPath
    };
  }

  let base64 = null;
  let strategy = 'brand-photo';
  let sourcePath = selectBrandImageSource(article);

  // If one article-specific asset already exists, use it to complete the pair.
  if (thumbExisting || ogExisting) {
    const existing = thumbExisting || ogExisting;
    base64 = fileBase64(existing, existing.path || 'existing article image');
    strategy = 'complete-existing-pair';
    sourcePath = existing.path || null;
  }

  if (!base64 && shouldGenerateIllustration(article, env)) {
    try {
      base64 = await generateIllustrationBase64(article, env);
      strategy = 'generated-illustration';
      sourcePath = null;
    } catch (e) {
      // Image AI is enhancement, not a single point of failure. Fall back to an
      // authentic THE REV. image and keep the Preview pipeline moving.
      strategy = 'brand-photo-fallback';
    }
  }

  if (!base64) {
    try {
      base64 = await sourceImageBase64(cfg, sourcePath);
    } catch (e) {
      if (sourcePath !== 'assets/images/photo-evolgear.jpg') {
        sourcePath = 'assets/images/photo-evolgear.jpg';
        base64 = await sourceImageBase64(cfg, sourcePath);
        strategy = 'brand-photo-fallback';
      } else {
        throw e;
      }
    }
  }

  const files = [];
  if (!thumbExisting) files.push({ path: paths.thumbnailRepoPath, base64 });
  if (!ogExisting) files.push({ path: paths.ogRepoPath, base64 });

  const commitSha = await commitBase64Files(
    cfg,
    files,
    `Editorial image preview: ${article.slug} [skip ci]`
  );

  return {
    status: 'READY',
    strategy,
    sourcePath,
    generated: strategy === 'generated-illustration',
    commitSha,
    thumbnail: paths.thumbnailPublicPath,
    ogImage: paths.ogPublicPath
  };
}
