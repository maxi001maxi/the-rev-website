// THE REV. Editorial AI -> Blog image automation (Phase 9.1)
//
// Policy:
// - Prefer real, existing THE REV. assets when a service photo is appropriate.
// - For conceptual BODY KNOWLEDGE topics, optionally generate an editorial illustration
//   when OPENAI_API_KEY is configured. It must be clearly illustrative, not a fake photo
//   of the actual facility.
// - If AI generation is unavailable or fails, fall back to an authentic brand photo.
// - Final article-specific files are created before Preview:
//     /assets/images/blog/thumb-{slug}.jpg
//     /assets/images/blog/og/og-{slug}.jpg
// - The image-only commit contains [skip ci] so it does not deploy an unapproved article.

const GITHUB_API = 'https://api.github.com';
const OPENAI_IMAGES_API = 'https://api.openai.com/v1/images/generations';
const TIMEOUT_MS = 60000;

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

function haystack(article) {
  return [article?.title, article?.description, article?.bodyMarkdown, article?.primaryQuery]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

/**
 * Select an authentic, already-owned THE REV. source photo.
 * The mapping is deterministic so the same article always receives the same source.
 */
export function selectBrandImageSource(article) {
  const category = String(article?.category || 'training');
  const text = haystack(article);

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

  // BODY KNOWLEDGE: keep the image truthful. Use a real training/coaching asset rather
  // than fabricating a documentary-looking scene that never happened at THE REV.
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
    training: 'training decisions, controlled effort, technique, equipment and progression',
    boxing: 'boxing practice, rhythm, hand wraps or gloves, controlled movement and learning',
    recovery: 'recovery, calm breathing, rest, hydration and decompression after training',
    'body-knowledge': 'body awareness, fatigue management, movement quality and choosing the right effort for the day'
  }[category] || 'body awareness and sustainable training';

  return [
    'Create a refined editorial illustration for THE REV. CONDITIONING LAB. website column.',
    'This must clearly look like an editorial illustration, NOT a photograph and NOT a depiction of the actual THE REV. facility.',
    'No readable text, no logos, no brand marks, no medical diagram labels, no before/after body transformation.',
    'Visual direction: quiet premium editorial, Japanese boutique wellness and training magazine, restrained charcoal, warm off-white and natural wood tones, soft contrast, sophisticated negative space.',
    `Article category: ${category}. Visual theme: ${categoryDirection}.`,
    `Article title: ${title}.`,
    description ? `Article summary: ${description}.` : '',
    body ? `Context: ${body}.` : '',
    'Use simple symbolic objects or human silhouettes without identifiable faces. Avoid dramatic sweat, bodybuilding clichés, hospital imagery, injury imagery or exaggerated fitness advertising.',
    'Wide landscape composition, subject kept near the center with generous safe margins so it can be cropped to both 3:2 article cards and approximately 1.91:1 social OGP.',
    'The image should feel calm, observant, useful and credible.'
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

function timeoutSignal(ms = TIMEOUT_MS) {
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
      { status: res.status === 401 || res.status === 403 ? 502 : 502, detail: data?.message || null }
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

async function sourceImageBase64(cfg, filePath) {
  const file = await githubFile(cfg, filePath);
  if (!file?.content) {
    throw new EditorialImageError('image_source_missing', `画像ソース ${filePath} がGitHubに見つかりません。`);
  }
  return String(file.content).replace(/\s+/g, '');
}

async function generateIllustrationBase64(article, env) {
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new EditorialImageError('image_ai_not_configured', 'OPENAI_API_KEY が設定されていません。', { status: 503 });

  const payload = {
    model: String(env.EDITORIAL_IMAGE_MODEL || 'gpt-image-2.5-flare').trim(),
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
      signal: timeoutSignal()
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
      { detail: data?.error?.message || null }
    );
  }
  return String(data.data[0].b64_json).replace(/\s+/g, '');
}

async function commitBase64Files(cfg, files, message) {
  if (!files.length) return null;

  const refPath = `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`;
  const ref = await githubJson(cfg, refPath);
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

  // force:false equivalent: GitHub rejects non-fast-forward updates.
  await githubJson(cfg, `/repos/${cfg.repo}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
    method: 'PATCH',
    body: { sha: newCommit.sha, force: false }
  });
  return newCommit.sha;
}

/**
 * Ensure article-specific Thumbnail and OGP files exist in GitHub.
 * Returns public paths ready to store in Supabase.
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

  if (shouldGenerateIllustration(article, env)) {
    try {
      base64 = await generateIllustrationBase64(article, env);
      strategy = 'generated-illustration';
      sourcePath = null;
    } catch {
      // Reliability over novelty: if AI image generation fails, fall back to a real
      // THE REV. photo instead of blocking the editorial pipeline.
      base64 = null;
      strategy = 'brand-photo-fallback';
    }
  }

  if (!base64) {
    try {
      base64 = await sourceImageBase64(cfg, sourcePath);
    } catch (e) {
      // Final safe fallback to a known real facility asset.
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
    `Editorial image preview: ${article.slug} [editorial-image-preview] [skip ci]`
  );

  return {
    strategy,
    sourcePath,
    generated: strategy === 'generated-illustration',
    commitSha,
    thumbnail: paths.thumbnailPublicPath,
    ogImage: paths.ogPublicPath
  };
}
