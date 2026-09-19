// THE REV. Editorial Console — Phase D: Publish Preflight（共通）
//
// /api/admin/publish-preview と /api/admin/publish の両方から同じ関数を呼び、
// 「Review画面でOKだったからPublishでは省略する」という状態を作らない。
// Publishボタン押下後も、必ずサーバー側でこのPreflightを再実行してから書き込む。

import {
  buildBlogMarkdown,
  canonicalFor,
  contentPathFor,
  publicUrlPathFor,
  validateDraftForPublish,
  isValidSlug
} from './blogMarkdown.mjs';
import { GithubError, checkConnection, getFile, publicGithubConfig } from './githubContent.mjs';
import { IMAGE_RENDER_VERSION, IMAGE_STYLE_TEMPLATE } from './editorialImage.mjs';

export const CHECK_OK = 'ok';
export const CHECK_ERROR = 'error';
export const CHECK_SKIP = 'skip';

/**
 * Publish権限（GitHubへの書き込み権限）。
 * Productionでは public.admin_members を正本として判定する。
 * supabase が渡されない単体テスト等では、旧 ADMIN_PUBLISHER_USER_ID を
 * fail-closed fallback として使う。
 */
export async function checkPublisher(user, supabase = null) {
  if (!user?.id) {
    return {
      allowed: false,
      reason: 'not_publisher',
      message: 'このアカウントには記事を公開する権限がありません。'
    };
  }

  if (supabase) {
    const { data, error } = await supabase
      .from('admin_members')
      .select('can_publish,active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return {
        allowed: false,
        reason: 'publisher_check_failed',
        message: '公開権限の確認に失敗しました。'
      };
    }

    if (!data?.active || !data?.can_publish) {
      return {
        allowed: false,
        reason: 'not_publisher',
        message: 'このアカウントには記事を公開する権限がありません。'
      };
    }

    return { allowed: true, reason: null, message: null };
  }

  const configured = (process.env.ADMIN_PUBLISHER_USER_ID || '').trim();
  if (!configured) {
    return {
      allowed: false,
      reason: 'publisher_not_configured',
      message: '公開者設定がないため、公開操作は許可されません。'
    };
  }
  if (user.id !== configured) {
    return {
      allowed: false,
      reason: 'not_publisher',
      message: 'このアカウントには記事を公開する権限がありません。'
    };
  }
  return { allowed: true, reason: null, message: null };
}

function check(id, label, status, message) {
  return { id, label, status, message: message || null };
}

async function publicAssetMatches(publicPath, expectedSize) {
  const path = String(publicPath || '').trim();
  if (!path.startsWith('/assets/') || !Number.isFinite(Number(expectedSize)) || Number(expectedSize) <= 0) {
    return { ok: false, status: null, size: null };
  }
  const base = String(process.env.PRODUCTION_URL || 'https://therev-lab.com').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  timer.unref?.();
  try {
    const res = await fetch(`${base}${path}?rev_asset_check=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });
    if (!res.ok) return { ok: false, status: res.status, size: null };
    const headerSize = Number(res.headers.get('content-length') || 0);
    if (headerSize > 0) {
      try { await res.body?.cancel(); } catch { /* no-op */ }
      return { ok: headerSize === Number(expectedSize), status: res.status, size: headerSize };
    }
    const bodySize = (await res.arrayBuffer()).byteLength;
    return { ok: bodySize === Number(expectedSize), status: res.status, size: bodySize };
  } catch {
    return { ok: false, status: null, size: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publish前の検査をまとめて実行する。
 * GitHubへの書き込みは一切行わない（読み取りのみ）。
 */
export async function runPreflight({ supabase, user, articleId }) {
  const checks = [];
  const githubConfig = publicGithubConfig();
  let blocker = null;

  // --- 1. 認証（ここへ来ている時点で認証済み） ---
  checks.push(check('auth', '認証', CHECK_OK, `ログイン中：${user?.email || user?.id || '不明'}`));

  // --- 2. Publisher権限 ---
  const publisher = await checkPublisher(user, supabase);
  if (publisher.allowed) {
    checks.push(check('publisher', 'Publisher権限', CHECK_OK, '公開権限があります。'));
  } else {
    checks.push(check('publisher', 'Publisher権限', CHECK_ERROR, publisher.message));
    blocker = blocker || { code: publisher.reason, status: 403, message: publisher.message };
  }

  // --- 3. Draft存在 ---
  const { data: draft, error: dbError } = await supabase
    .from('admin_article_drafts')
    .select('*')
    .eq('id', articleId)
    .maybeSingle();

  if (dbError) {
    checks.push(check('draft', 'Draft存在', CHECK_ERROR, '下書きの取得に失敗しました。'));
    return {
      ok: false, mode: null, checks, draft: null, markdown: null,
      targetPath: null, publicUrl: null, canonical: null, github: githubConfig,
      blocker: { code: 'db_error', status: 500, message: '下書きの取得に失敗しました。' }
    };
  }
  if (!draft) {
    checks.push(check('draft', 'Draft存在', CHECK_ERROR, '対象の下書きが見つかりません。'));
    return {
      ok: false, mode: null, checks, draft: null, markdown: null,
      targetPath: null, publicUrl: null, canonical: null, github: githubConfig,
      blocker: { code: 'not_found', status: 404, message: '対象の下書きが見つかりません。' }
    };
  }
  checks.push(check('draft', 'Draft存在', CHECK_OK, '下書きを読み込みました。'));

  const mode = draft.source_path ? 'update' : 'create';

  // --- 4. 必須項目 / 5. slug形式 ---
  const validationErrors = validateDraftForPublish(draft);
  const slugErrors = validationErrors.filter((m) => m.startsWith('Slug '));
  const fieldErrors = validationErrors.filter((m) => !m.startsWith('Slug '));

  if (fieldErrors.length) {
    checks.push(check('required', '必須項目', CHECK_ERROR, fieldErrors.join(' ')));
    blocker = blocker || { code: 'validation_error', status: 422, message: fieldErrors.join(' ') };
  } else {
    checks.push(check('required', '必須項目', CHECK_OK, '必要な項目はすべて入力されています。'));
  }

  if (slugErrors.length || !isValidSlug(draft.slug || '')) {
    const msg = slugErrors[0] || 'Slug は半角英数字とハイフン（a-z 0-9 -）のみ使用できます。';
    checks.push(check('slug_format', 'Slug形式', CHECK_ERROR, msg));
    blocker = blocker || { code: 'validation_error', status: 422, message: msg };
  } else {
    checks.push(check('slug_format', 'Slug形式', CHECK_OK, `/blog/${draft.slug}/ として公開されます。`));
  }

  // --- Phase 10 v2: Editorial AI-managed articles require final designed images.
  // A path string alone is insufficient because an older plain-photo asset can
  // exist at the same filename.
  const editorialManaged = draft.editorial_source === 'the-rev-editorial-ai';
  if (editorialManaged) {
    const versionedThumb = typeof draft.thumbnail === 'string' && draft.image_asset_version && draft.thumbnail.includes(`-${draft.image_asset_version}.jpg`);
    const versionedOg = typeof draft.og_image === 'string' && draft.image_asset_version && draft.og_image.includes(`-${draft.image_asset_version}.jpg`);
    const imageReady =
      draft.image_status === 'READY' &&
      draft.image_asset_ready === true &&
      draft.image_render_version === IMAGE_RENDER_VERSION &&
      draft.image_style_template === IMAGE_STYLE_TEMPLATE &&
      Boolean(String(draft.image_headline_short || '').trim()) &&
      Boolean(String(draft.image_qa_report_path || '').trim()) &&
      versionedThumb &&
      versionedOg &&
      draft.image_qa?.pass === true &&
      Number(draft.image_qa?.series_consistency || 0) >= 8 &&
      Number(draft.image_qa?.article_visual_relevance || 0) >= 8;

    if (imageReady) {
      checks.push(check(
        'image_release',
        '記事画像',
        CHECK_OK,
        `旧5記事参照 ${IMAGE_STYLE_TEMPLATE} / GPT Image + exact typography / Brand QA PASS（series + article relevance）。`
      ));
    } else {
      const msg = 'Reference V2のThumbnail / OGPがまだ完成していません。旧5記事参照・画像用短縮コピー・記事と写真の意味一致・versioned asset・Brand QA PASSが揃うまで公開できません。';
      checks.push(check('image_release', '記事画像', CHECK_ERROR, msg));
      blocker = blocker || { code: 'image_not_ready', status: 409, message: msg };
    }
  } else {
    checks.push(check('image_release', '記事画像', CHECK_OK, '手動記事の画像パスを確認しました。'));
  }

  const targetPath = draft.source_path || (isValidSlug(draft.slug || '') ? contentPathFor(draft.slug) : null);
  const publicUrl = isValidSlug(draft.slug || '') ? publicUrlPathFor(draft.slug) : null;

  // --- 公開済み記事のslug変更が起きていないか（DB側の保険） ---
  if (mode === 'update' && isValidSlug(draft.slug || '') && draft.source_path !== contentPathFor(draft.slug)) {
    const msg = `公開済み記事のSlugが変更されています（公開時: ${draft.source_path}）。Phase Dではslug変更に対応していません。`;
    checks.push(check('slug_locked', 'Slug固定', CHECK_ERROR, msg));
    blocker = blocker || { code: 'slug_locked', status: 409, message: msg };
  }

  const markdown = fieldErrors.length || slugErrors.length ? null : buildBlogMarkdown(draft);

  // --- 6〜9. GitHub側の確認 ---
  let githubCurrentSha = null;
  let githubHtmlUrl = null;

  // Publisher権限がない場合はGitHubへ一切アクセスしない（トークンを使わない）。
  if (!publisher.allowed) {
    checks.push(check('github_connection', 'GitHub接続', CHECK_SKIP, 'Publisher権限がないため確認をスキップしました。'));
    checks.push(check('github_target', mode === 'create' ? 'GitHub上のslug衝突' : 'GitHub上の記事', CHECK_SKIP, '確認をスキップしました。'));
    checks.push(check('source_sync', 'source_path / source_sha', CHECK_SKIP, '確認をスキップしました。'));
    return finish();
  }

  try {
    const conn = await checkConnection();
    checks.push(check('github_connection', 'GitHub接続', CHECK_OK, `${conn.repo} @ ${conn.branch} へ接続できました。`));

    if (editorialManaged && !blocker) {
      const toRepoPath = (value) => {
        const s = String(value || '').trim();
        return s.startsWith('/') && !s.startsWith('//') ? s.slice(1) : null;
      };
      const thumbPath = toRepoPath(draft.thumbnail);
      const ogPath = toRepoPath(draft.og_image);
      if (!thumbPath || !ogPath) {
        const msg = '記事画像がGitHub管理パスではありません。';
        checks.push(check('image_assets', '画像ファイル実在', CHECK_ERROR, msg));
        blocker = blocker || { code: 'image_asset_missing', status: 409, message: msg };
      } else {
        const [thumbFile, ogFile] = await Promise.all([getFile(thumbPath), getFile(ogPath)]);
        if (thumbFile.exists && ogFile.exists) {
          checks.push(check('image_assets', '画像ファイル実在', CHECK_OK, 'Thumbnail / OGP のGitHub実体を確認しました。'));

          const [thumbLive, ogLive] = await Promise.all([
            publicAssetMatches(draft.thumbnail, thumbFile.size),
            publicAssetMatches(draft.og_image, ogFile.size)
          ]);
          if (thumbLive.ok && ogLive.ok) {
            checks.push(check('image_live', '本番画像反映', CHECK_OK, 'Xserver上のThumbnail / OGPがGitHubと同じサイズで反映済みです。'));
          } else {
            const msg = '画像ファイルは生成済みですが、Xserver本番への反映がまだ完了していません。反映完了後に自動で公開可能になります。';
            checks.push(check('image_live', '本番画像反映', CHECK_ERROR, msg));
            blocker = blocker || { code: 'image_live_not_ready', status: 409, message: msg };
          }
        } else {
          const msg = `画像ファイルが不足しています（Thumbnail: ${thumbFile.exists ? 'OK' : 'missing'} / OGP: ${ogFile.exists ? 'OK' : 'missing'}）。`;
          checks.push(check('image_assets', '画像ファイル実在', CHECK_ERROR, msg));
          blocker = blocker || { code: 'image_asset_missing', status: 409, message: msg };
        }
      }
    }

    if (!targetPath) {
      checks.push(check('github_target', 'GitHub上の記事', CHECK_ERROR, 'Slugが不正なため書き込み先を決定できません。'));
      checks.push(check('source_sync', 'source_path / source_sha', CHECK_SKIP, '確認をスキップしました。'));
      return finish();
    }

    const file = await getFile(targetPath);
    githubCurrentSha = file.exists ? file.sha : null;
    githubHtmlUrl = file.exists ? file.htmlUrl : null;

    if (mode === 'create') {
      if (file.exists) {
        const msg = `GitHubに ${targetPath} がすでに存在します。別のSlugを使用してください。`;
        checks.push(check('github_target', 'GitHub上のslug衝突', CHECK_ERROR, msg));
        blocker = blocker || { code: 'slug_exists_on_github', status: 409, message: msg };
      } else {
        checks.push(check('github_target', 'GitHub上のslug衝突', CHECK_OK, `${targetPath} は未使用です（新規作成）。`));
      }
      checks.push(check('source_sync', 'source_path / source_sha', CHECK_OK, '新規公開のため未設定です（公開成功後に保存されます）。'));
    } else {
      if (!file.exists) {
        const msg = `GitHub上に ${targetPath} が見つかりません。別経路で削除・移動された可能性があります。`;
        checks.push(check('github_target', 'GitHub上の記事', CHECK_ERROR, msg));
        blocker = blocker || { code: 'source_conflict', status: 409, message: msg };
        checks.push(check('source_sync', 'source_path / source_sha', CHECK_ERROR, 'GitHub側のファイルが存在しないため照合できません。'));
      } else {
        checks.push(check('github_target', 'GitHub上の記事', CHECK_OK, `${targetPath} を更新します。`));
        if (!draft.source_sha) {
          const msg = 'source_sha が保存されていないため、上書きの安全性を確認できません。';
          checks.push(check('source_sync', 'source_path / source_sha', CHECK_ERROR, msg));
          blocker = blocker || { code: 'source_conflict', status: 409, message: msg };
        } else if (draft.source_sha !== githubCurrentSha) {
          const msg = 'GitHub側の記事が別経路で変更されています。Adminからの上書きはできません。';
          checks.push(check('source_sync', 'source_path / source_sha', CHECK_ERROR, msg));
          blocker = blocker || { code: 'source_conflict', status: 409, message: msg };
        } else {
          checks.push(check('source_sync', 'source_path / source_sha', CHECK_OK, `SHA一致（${String(githubCurrentSha).slice(0, 7)}）。安全に更新できます。`));
        }
      }
    }
  } catch (e) {
    if (e instanceof GithubError) {
      checks.push(check('github_connection', 'GitHub接続', CHECK_ERROR, e.message));
      checks.push(check('github_target', 'GitHub上の記事', CHECK_SKIP, 'GitHubへ接続できないため確認できません。'));
      checks.push(check('source_sync', 'source_path / source_sha', CHECK_SKIP, 'GitHubへ接続できないため確認できません。'));
      blocker = blocker || { code: e.code, status: e.status, message: e.message };
    } else {
      throw e;
    }
  }

  return finish();

  function finish() {
    const ok = !blocker && checks.every((c) => c.status !== CHECK_ERROR);
    return {
      ok,
      mode,
      checks,
      draft: draft || null,
      markdown,
      targetPath,
      publicUrl,
      canonical: draft && isValidSlug(draft.slug || '') ? (draft.canonical || canonicalFor(draft.slug)) : null,
      github: { ...githubConfig, currentSha: githubCurrentSha, htmlUrl: githubHtmlUrl },
      blocker
    };
  }
}

/** Review画面へ返す用に、Draftから必要な項目だけを取り出す（body_markdownは別途返す）。 */
export function draftSummary(draft) {
  if (!draft) return null;
  return {
    id: draft.id,
    title: draft.title,
    slug: draft.slug,
    description: draft.description,
    category: draft.category,
    category_label: draft.category_label,
    author: draft.author,
    author_role: draft.author_role,
    published: draft.published,
    updated: draft.updated,
    thumbnail: draft.thumbnail,
    og_image: draft.og_image,
    cta_type: draft.cta_type,
    keywords: draft.keywords || [],
    featured: draft.featured,
    noindex: draft.noindex,
    canonical: draft.canonical,
    status: draft.status,
    source_path: draft.source_path,
    source_sha: draft.source_sha,
    body_markdown: draft.body_markdown,
    updated_at: draft.updated_at,
    editorial_source: draft.editorial_source,
    image_status: draft.image_status,
    image_render_version: draft.image_render_version,
    image_strategy: draft.image_strategy,
    image_asset_ready: draft.image_asset_ready,
    image_checked_at: draft.image_checked_at,
    image_qa: draft.image_qa,
    image_attempts: draft.image_attempts,
    image_style_template: draft.image_style_template,
    image_headline_short: draft.image_headline_short,
    image_category_label: draft.image_category_label,
    image_series_label: draft.image_series_label,
    image_asset_version: draft.image_asset_version,
    image_job_path: draft.image_job_path,
    image_qa_report_path: draft.image_qa_report_path,
    image_generation_model: draft.image_generation_model,
    image_qa_model: draft.image_qa_model,
    image_brand_qa_score: draft.image_brand_qa_score
  };
}
