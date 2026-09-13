// THE REV. Editorial Console — Phase D 検証スクリプト
//
//   node scripts/test-phase-d.mjs
//
// 目的：
//   1. GitHub環境変数が未設定でも安全に（例外で落ちず、正規化されたエラーで）失敗すること
//   2. GITHUB_TOKEN が戻り値・エラーメッセージへ絶対に含まれないこと
//   3. Publish権限（ADMIN_PUBLISHER_USER_ID）が fail closed であること
//   4. Markdown Serializerの出力が既存の scripts/build-blog.mjs でそのままビルドできること
//   5. Phase D.1: 画像アップロードの検証ロジック（MIME/サイズ/パス生成）が正しいこと
//
// 4番は実際に content/blog/ へ一時ファイルを書いて build-blog を実行し、
// 最後に必ず削除して元の状態へ戻す（finallyで復旧）。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// GitHub関連の環境変数は「未設定」の状態でテストする（実際のGitHubへは一切アクセスしない）。
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_REPO;
delete process.env.GITHUB_BRANCH;
delete process.env.ADMIN_PUBLISHER_USER_ID;

const { buildBlogMarkdown, validateDraftForPublish, categoryLabelFor, contentPathFor, commitMessageFor } =
  await import('../lib/blogMarkdown.mjs');
const github = await import('../lib/githubContent.mjs');
const { checkPublisher, runPreflight } = await import('../lib/publishFlow.mjs');

let passed = 0;
const failures = [];

function ok(name) { passed += 1; console.log(`  ✓ ${name}`); }
function fail(name, detail) { failures.push({ name, detail }); console.log(`  ✕ ${name}\n      ${detail}`); }
function assert(cond, name, detail = '条件を満たしませんでした') { cond ? ok(name) : fail(name, detail); }

function section(title) { console.log(`\n[${title}]`); }

const TEST_SLUG = 'phase-d-serializer-check';
const SAMPLE_DRAFT = {
  id: '00000000-0000-4000-8000-000000000000',
  title: 'Phase D 検証用：Markdown Serializer の出力確認',
  slug: TEST_SLUG,
  description: 'Serializerが生成したMarkdownを build-blog.mjs がそのまま読めるかを確認するための一時記事です。',
  published: '2026-01-15',
  updated: '2026-01-20',
  category: 'training',
  category_label: 'これは無視され、categoryから再計算されるはず',
  author: 'THE REV. CONDITIONING LAB.',
  author_role: 'THE REV. CONDITIONING LAB.',
  thumbnail: '/assets/images/blog/thumb-training.jpg',
  og_image: '/assets/images/blog/og/og-training.jpg',
  status: 'draft',            // Supabase側は常にdraft
  featured: true,
  cta_type: 'personal-training',
  keywords: ['引用"を含む', 'ハイフン-あり', '日本語'],
  canonical: null,
  noindex: false,
  body_markdown: '導入文です。\r\n\r\n## 見出しひとつめ\r\n\r\n本文の**強調**と[リンク](/price.html)。\r\n\r\n## 見出しふたつめ\r\n\r\n- 箇条書き1\r\n- 箇条書き2\r\n',
  source_path: null,
  source_sha: null
};

/* =============================================================
   1. GitHub未設定時の安全なエラー
   ============================================================= */
section('1. GitHub環境変数が未設定のとき');

const cfg = github.publicGithubConfig();
assert(cfg.configured === false, 'publicGithubConfig() が configured:false を返す', JSON.stringify(cfg));
assert(!('token' in cfg), 'publicGithubConfig() に token フィールドが存在しない', JSON.stringify(cfg));
assert(
  !JSON.stringify(cfg).toLowerCase().includes('token') || JSON.stringify(cfg).includes('GITHUB_TOKEN'),
  'publicGithubConfig() の中身にトークン値が含まれない（環境変数名の記載のみ）',
  JSON.stringify(cfg)
);

for (const [name, fn] of [
  ['checkConnection()', () => github.checkConnection()],
  ['getFile()', () => github.getFile('content/blog/x.md')],
  ['getFileSha()', () => github.getFileSha('content/blog/x.md')],
  ['putFile()', () => github.putFile({ path: 'content/blog/x.md', content: 'x', message: 'x' })]
]) {
  try {
    await fn();
    fail(`${name} が未設定時にエラーになる`, '例外が投げられませんでした（GitHubへアクセスした可能性があります）');
  } catch (e) {
    if (e instanceof github.GithubError && e.code === 'github_not_configured' && e.status === 503) {
      ok(`${name} が github_not_configured (503) で安全に失敗する`);
    } else {
      fail(`${name} が未設定時に正規化されたエラーになる`, `${e?.name}: ${e?.code || ''} ${e?.message}`);
    }
  }
}

// トークンが設定されていてもリポジトリ未設定なら動かないこと（設定漏れの検知）
process.env.GITHUB_TOKEN = 'dummy-token-value-should-never-leak';
try {
  await github.checkConnection();
  fail('GITHUB_REPO未設定でGitHubへ接続しない', '例外が投げられませんでした');
} catch (e) {
  const leaked = String(e.message).includes('dummy-token-value-should-never-leak');
  assert(e.code === 'github_not_configured', 'GITHUB_REPO未設定なら github_not_configured', `code=${e.code}`);
  assert(!leaked, 'エラーメッセージにトークン値が含まれない', e.message);
}
const cfg2 = github.publicGithubConfig();
assert(
  !JSON.stringify(cfg2).includes('dummy-token-value-should-never-leak'),
  'publicGithubConfig() にトークン値が含まれない',
  JSON.stringify(cfg2)
);
delete process.env.GITHUB_TOKEN;

/* =============================================================
   2. Publish権限（fail closed）
   ============================================================= */
section('2. Publish権限（ADMIN_PUBLISHER_USER_ID）');

delete process.env.ADMIN_PUBLISHER_USER_ID;
let p = checkPublisher({ id: 'user-1' });
assert(p.allowed === false && p.reason === 'publisher_not_configured',
  '環境変数未設定なら許可しない（fail closed）', JSON.stringify(p));

process.env.ADMIN_PUBLISHER_USER_ID = 'publisher-uuid';
p = checkPublisher({ id: 'someone-else' });
assert(p.allowed === false && p.reason === 'not_publisher', 'user.id不一致なら許可しない', JSON.stringify(p));

p = checkPublisher({ id: 'publisher-uuid' });
assert(p.allowed === true, 'user.id一致なら許可する', JSON.stringify(p));

p = checkPublisher(null);
assert(p.allowed === false, 'userがnullなら許可しない', JSON.stringify(p));
delete process.env.ADMIN_PUBLISHER_USER_ID;

/* =============================================================
   3. Markdown Serializer 単体
   ============================================================= */
section('3. Markdown Serializer');

const md = buildBlogMarkdown(SAMPLE_DRAFT);
const parsed = matter(md);

assert(parsed.data.status === 'published', 'GitHub出力のstatusは published（Supabase側はdraftのまま）', `status=${parsed.data.status}`);
assert(SAMPLE_DRAFT.status === 'draft', '元のDraftオブジェクトのstatusを書き換えていない', `status=${SAMPLE_DRAFT.status}`);
assert(parsed.data.category_label === categoryLabelFor(SAMPLE_DRAFT.category),
  'category_label は category から自動算出される', `category_label=${parsed.data.category_label}`);
assert(parsed.data.canonical === `https://therev-lab.com/blog/${TEST_SLUG}/`,
  'canonical が自動生成される', `canonical=${parsed.data.canonical}`);
assert(Array.isArray(parsed.data.keywords) && parsed.data.keywords.length === 3,
  'keywords が配列として読み戻せる', JSON.stringify(parsed.data.keywords));
assert(parsed.data.keywords[0] === '引用"を含む', 'ダブルクォートを含むkeywordが壊れない', JSON.stringify(parsed.data.keywords));
assert(parsed.data.featured === true && parsed.data.noindex === false, 'boolean が boolean として読み戻せる',
  `featured=${parsed.data.featured} noindex=${parsed.data.noindex}`);
assert(!parsed.content.includes('\r'), '本文のCRLFがLFへ正規化されている', 'CRが残っています');
assert(parsed.content.trim().startsWith('導入文です。'), '本文の先頭が保持されている', parsed.content.slice(0, 40));

// Front Matterの並び（既存記事と同じ順序で読みやすいこと）
const FIELD_ORDER = ['title', 'slug', 'description', 'published', 'updated', 'category', 'category_label',
  'author', 'author_role', 'thumbnail', 'og_image', 'status', 'featured', 'cta_type', 'keywords',
  'canonical', 'noindex'];
const emitted = md.split('\n---')[0].split('\n').slice(1)
  .filter((l) => /^[a-z_]+:/.test(l)).map((l) => l.split(':')[0]);
assert(JSON.stringify(emitted) === JSON.stringify(FIELD_ORDER),
  'Front Matterのフィールドが既存Blog仕様と同じ並びで出力される', JSON.stringify(emitted));

assert(commitMessageFor(SAMPLE_DRAFT, 'create').startsWith('Publish blog: '), 'commit message（新規）', commitMessageFor(SAMPLE_DRAFT, 'create'));
assert(commitMessageFor(SAMPLE_DRAFT, 'update').startsWith('Update blog: '), 'commit message（更新）', commitMessageFor(SAMPLE_DRAFT, 'update'));
assert(contentPathFor(TEST_SLUG) === `content/blog/${TEST_SLUG}.md`, '書き込み先パス', contentPathFor(TEST_SLUG));

/* =============================================================
   4. Preflight用バリデーション
   ============================================================= */
section('4. validateDraftForPublish');

assert(validateDraftForPublish(SAMPLE_DRAFT).length === 0, '揃っているDraftはエラーなし',
  validateDraftForPublish(SAMPLE_DRAFT).join(' '));
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, title: '' }).some((m) => m.includes('Title')), 'title未入力を検出');
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, published: null }).some((m) => m.includes('Published')), 'published未入力を検出');
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, slug: 'Bad Slug' }).some((m) => m.startsWith('Slug ')), '不正なslugを検出');
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, category: 'nope' }).some((m) => m.includes('Category')), '不正なcategoryを検出');
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, body_markdown: '   ' }).some((m) => m.includes('本文')), '空の本文を検出');
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, published: '2026-02-30' }).some((m) => m.includes('Published')), '存在しない日付を検出');

/* =============================================================
   5. build-blog.mjs でそのままビルドできるか（結合テスト）
   ============================================================= */
section('5. build-blog.mjs との互換性（実ビルド）');

const tmpMdPath = path.join(ROOT, 'content', 'blog', `${TEST_SLUG}.md`);
const outIndexPath = path.join(ROOT, 'blog', TEST_SLUG, 'index.html');

if (fs.existsSync(tmpMdPath)) {
  fail('テスト用ファイルの事前確認', `${tmpMdPath} がすでに存在します。手動で削除してから再実行してください。`);
} else {
  try {
    fs.writeFileSync(tmpMdPath, md, 'utf8');
    const log = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-blog.mjs')], { cwd: ROOT, encoding: 'utf8' });
    ok('build-blog.mjs がエラーなく完走する');
    assert(/公開: 1/.test(log), 'status: published として1件が公開対象になる', log.trim().split('\n').slice(-4).join(' / '));

    assert(fs.existsSync(outIndexPath), `/blog/${TEST_SLUG}/index.html が生成される`, outIndexPath);
    if (fs.existsSync(outIndexPath)) {
      const html = fs.readFileSync(outIndexPath, 'utf8');
      assert(html.includes(SAMPLE_DRAFT.title), '生成HTMLにタイトルが含まれる');
      assert(html.includes('2026.01.15'), '生成HTMLに公開日が含まれる');
      assert(html.includes('UPDATE 2026.01.20'), '生成HTMLに更新日が含まれる');
      assert(html.includes('COLUMN / TRAINING'), '生成HTMLにカテゴリラベルが含まれる');
      assert(html.includes('見出しひとつめ'), '生成HTMLに本文の見出しが含まれる');
      assert(html.includes('/assets/images/blog/og/og-training.jpg'), '生成HTMLにOGP画像が含まれる');
      assert(html.includes(`https://therev-lab.com/blog/${TEST_SLUG}/`), '生成HTMLにcanonicalが含まれる');
    }
    const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    assert(sitemap.includes(`/blog/${TEST_SLUG}/`), 'sitemap.xml に公開URLが追加される');
  } catch (e) {
    fail('build-blog.mjs との互換性', e.stdout ? `${e.message}\n${e.stdout}` : String(e.message || e));
  } finally {
    // 何があっても一時ファイルを消し、生成物を元の状態へ戻す。
    if (fs.existsSync(tmpMdPath)) fs.unlinkSync(tmpMdPath);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-blog.mjs')], { cwd: ROOT, stdio: 'ignore' });
    const cleaned = !fs.existsSync(tmpMdPath) && !fs.existsSync(outIndexPath);
    assert(cleaned, 'テスト用の一時記事とその生成物が残っていない',
      `md=${fs.existsSync(tmpMdPath)} html=${fs.existsSync(outIndexPath)}`);
  }
}

/* =============================================================
   6. Preflight（GitHubをスタブして分岐を網羅）
   ============================================================= */
section('6. runPreflight の分岐');

// Supabaseクライアントの最小スタブ（.from().select().eq().maybeSingle()）
function fakeSupabase(row, error = null) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }) }) };
}

const BASE_DRAFT = {
  id: 'a1', title: 'テスト記事', slug: 'my-post', description: '説明',
  published: '2026-01-01', updated: '2026-01-01', category: 'training',
  author: 'THE REV. CONDITIONING LAB.', body_markdown: '本文です。',
  keywords: [], featured: false, noindex: false, cta_type: 'general',
  status: 'draft', source_path: null, source_sha: null
};
const USER = { id: 'publisher-uuid', email: 'owner@example.com' };

function checkOf(result, id) { return result.checks.find((c) => c.id === id); }

// --- GitHub未設定・Publisher未設定のときの安全な挙動 ---
delete process.env.ADMIN_PUBLISHER_USER_ID;
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_REPO;

let r = await runPreflight({ supabase: fakeSupabase(BASE_DRAFT), user: USER, articleId: 'a1' });
assert(r.ok === false && r.blocker?.code === 'publisher_not_configured' && r.blocker.status === 403,
  'Publisher未設定ならok=false / 403', JSON.stringify(r.blocker));
assert(checkOf(r, 'github_connection').status === 'skip',
  'Publisher権限がないときGitHubへアクセスしない（skip）', JSON.stringify(checkOf(r, 'github_connection')));

process.env.ADMIN_PUBLISHER_USER_ID = 'publisher-uuid';
r = await runPreflight({ supabase: fakeSupabase(BASE_DRAFT), user: USER, articleId: 'a1' });
assert(r.ok === false && r.blocker?.code === 'github_not_configured',
  'GitHub未設定ならPreflightが github_not_configured で止まる', JSON.stringify(r.blocker));

r = await runPreflight({ supabase: fakeSupabase(null), user: USER, articleId: 'a1' });
assert(r.ok === false && r.blocker?.code === 'not_found' && r.blocker.status === 404, 'Draftが無ければ404', JSON.stringify(r.blocker));

r = await runPreflight({ supabase: fakeSupabase({ ...BASE_DRAFT, title: '', published: null }), user: USER, articleId: 'a1' });
assert(checkOf(r, 'required').status === 'error' && r.blocker?.status === 422, '必須項目欠けは422', JSON.stringify(r.blocker));
assert(r.markdown === null, '必須項目が欠けているときMarkdownを生成しない', String(r.markdown).slice(0, 40));

r = await runPreflight({ supabase: fakeSupabase({ ...BASE_DRAFT, slug: 'Bad Slug!' }), user: USER, articleId: 'a1' });
assert(checkOf(r, 'slug_format').status === 'error' && r.targetPath === null, '不正slugは書き込み先を決めない', String(r.targetPath));

r = await runPreflight({
  supabase: fakeSupabase({ ...BASE_DRAFT, slug: 'renamed', source_path: 'content/blog/my-post.md', source_sha: 'sha-1' }),
  user: USER, articleId: 'a1'
});
assert(r.blocker?.code === 'slug_locked' && r.blocker.status === 409,
  '公開済み記事のslug変更は slug_locked (409)', JSON.stringify(r.blocker));

// --- ここから GitHub API を fetch スタブで再現する（実通信はしない） ---
process.env.GITHUB_TOKEN = 'stub-token-must-not-leak';
process.env.GITHUB_REPO = 'example-owner/example-repo';
process.env.GITHUB_BRANCH = 'main';

const realFetch = globalThis.fetch;
let stubState = { files: {}, calls: [], sentAuth: [] };

function installFetchStub() {
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    stubState.calls.push(`${options.method || 'GET'} ${u}`);
    stubState.sentAuth.push(options.headers?.Authorization || '');
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    if (!u.startsWith('https://api.github.com/')) return json(500, { message: 'unexpected host' });
    if (/\/repos\/[^/]+\/[^/]+$/.test(u)) return json(200, { default_branch: 'main' });
    if (/\/branches\/main$/.test(u)) return json(200, { name: 'main' });

    const contents = /\/contents\/(.+?)(?:\?|$)/.exec(u);
    if (contents) {
      const filePath = decodeURIComponent(contents[1]);
      if ((options.method || 'GET') === 'GET') {
        const file = stubState.files[filePath];
        if (!file) return json(404, { message: 'Not Found' });
        return json(200, { sha: file.sha, path: filePath, size: file.content.length, html_url: `https://github.com/x/${filePath}`, content: Buffer.from(file.content, 'utf8').toString('base64') });
      }
      if (options.method === 'PUT') {
        const sent = JSON.parse(options.body);
        const existing = stubState.files[filePath];
        if (existing && !sent.sha) return json(422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
        if (existing && sent.sha !== existing.sha) return json(409, { message: 'does not match' });
        const newSha = `sha-${Object.keys(stubState.files).length + 1}-${Date.now()}`;
        stubState.files[filePath] = { sha: newSha, content: Buffer.from(sent.content, 'base64').toString('utf8') };
        return json(200, { content: { path: filePath, sha: newSha, html_url: 'https://github.com/x' }, commit: { sha: 'commit-abc123', html_url: 'https://github.com/x/commit/abc123' } });
      }
    }
    return json(404, { message: 'Not Found' });
  };
}
function restoreFetch() { globalThis.fetch = realFetch; }

installFetchStub();
try {
  // 接続確認
  const conn = await github.checkConnection();
  assert(conn.ok && conn.repo === 'example-owner/example-repo' && conn.branch === 'main', 'checkConnection() が接続情報を返す', JSON.stringify(conn));

  // 新規：GitHubに未存在
  r = await runPreflight({ supabase: fakeSupabase(BASE_DRAFT), user: USER, articleId: 'a1' });
  assert(r.ok === true && r.mode === 'create', '新規・衝突なしならPreflight通過', JSON.stringify(r.blocker));
  assert(r.targetPath === 'content/blog/my-post.md' && r.publicUrl === '/blog/my-post/', '書き込み先と公開URL', `${r.targetPath} ${r.publicUrl}`);

  // 新規：GitHubに同名ファイルが既に存在 → 必ずブロック
  stubState.files['content/blog/my-post.md'] = { sha: 'sha-existing', content: '既存の記事' };
  r = await runPreflight({ supabase: fakeSupabase(BASE_DRAFT), user: USER, articleId: 'a1' });
  assert(r.ok === false && r.blocker?.code === 'slug_exists_on_github' && r.blocker.status === 409,
    '新規公開でGitHubにslug衝突があればブロック（409）', JSON.stringify(r.blocker));

  // 更新：source_shaがGitHubの現在SHAと一致
  const publishedDraft = { ...BASE_DRAFT, source_path: 'content/blog/my-post.md', source_sha: 'sha-existing' };
  r = await runPreflight({ supabase: fakeSupabase(publishedDraft), user: USER, articleId: 'a1' });
  assert(r.ok === true && r.mode === 'update' && r.github.currentSha === 'sha-existing',
    '更新・SHA一致ならPreflight通過', JSON.stringify(r.blocker));

  // 更新：GitHub側が別経路で変更された（SHA不一致） → 上書き禁止
  r = await runPreflight({ supabase: fakeSupabase({ ...publishedDraft, source_sha: 'sha-old' }), user: USER, articleId: 'a1' });
  assert(r.ok === false && r.blocker?.code === 'source_conflict' && r.blocker.status === 409,
    'SHA不一致なら source_conflict (409) で上書き禁止', JSON.stringify(r.blocker));
  assert(/別経路で変更/.test(r.blocker.message), 'source_conflictのメッセージが日本語で説明的', r.blocker.message);

  // 更新：GitHub側でファイルが消えている
  delete stubState.files['content/blog/my-post.md'];
  r = await runPreflight({ supabase: fakeSupabase(publishedDraft), user: USER, articleId: 'a1' });
  assert(r.ok === false && r.blocker?.code === 'source_conflict',
    'GitHub側にファイルが無い更新も source_conflict', JSON.stringify(r.blocker));

  // putFile: 新規作成 → 更新（SHA一致） → SHA不一致で409
  const created = await github.putFile({ path: 'content/blog/new-post.md', content: '# hello', message: 'Publish blog: x' });
  assert(created.commitSha === 'commit-abc123' && created.contentSha, 'putFile（新規）がcommit SHAとcontent SHAを返す', JSON.stringify(created));

  const updated = await github.putFile({ path: 'content/blog/new-post.md', content: '# hello 2', message: 'Update blog: x', sha: created.contentSha });
  assert(updated.contentSha && updated.contentSha !== created.contentSha, 'putFile（更新）で新しいSHAが返る', JSON.stringify(updated));

  try {
    await github.putFile({ path: 'content/blog/new-post.md', content: '# hello 3', message: 'Update blog: x', sha: 'stale-sha' });
    fail('古いSHAでの上書きが拒否される', '例外が投げられませんでした');
  } catch (e) {
    assert(e.code === 'github_conflict' && e.status === 409, '古いSHAでの上書きは github_conflict (409)', `${e.code}/${e.status}`);
  }

  try {
    await github.putFile({ path: 'content/blog/new-post.md', content: '# dup', message: 'Publish blog: x' });
    fail('既存ファイルへのcreateが拒否される', '例外が投げられませんでした');
  } catch (e) {
    assert(e.status === 409, '既存ファイルへのcreate（sha無し）は409相当', `${e.code}/${e.status}`);
  }

  // 生成された内容がSerializerの出力と一致していること（往復確認）
  const roundTrip = await github.getFile('content/blog/new-post.md');
  assert(roundTrip.exists && roundTrip.content === '# hello 2', 'getFile() が書き込んだ内容をUTF-8で読み戻せる', String(roundTrip.content));

  // トークンはAuthorizationヘッダ（GitHub宛）にのみ現れ、戻り値には現れない
  const returned = JSON.stringify({ conn, created, updated, roundTrip, preflight: r });
  assert(!returned.includes('stub-token-must-not-leak'), '戻り値のどこにもトークンが含まれない');
  assert(stubState.sentAuth.some((h) => h.includes('stub-token-must-not-leak')), 'トークンはGitHub宛Authorizationヘッダにのみ使われている');
} finally {
  restoreFetch();
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPO;
  delete process.env.GITHUB_BRANCH;
  delete process.env.ADMIN_PUBLISHER_USER_ID;
}

/* =============================================================
   7. Phase D.1: 画像アップロード（admin-storage.mjs の純粋関数）
   ============================================================= */
section('7. admin-storage.mjs（画像アップロードの検証ロジック）');

// このファイルはトップレベルで admin-auth.mjs（CDNからSupabase SDKをimport）を
// importしない設計になっている。ここでのimport自体がネットワークアクセスを
// 発生させないことも、このテストが通ること自体で確認できる。
const storage = await import('../admin/js/admin-storage.mjs');

assert(
  JSON.stringify(storage.ALLOWED_MIME_TYPES) === JSON.stringify(['image/jpeg', 'image/png', 'image/webp']),
  'ALLOWED_MIME_TYPES は JPEG / PNG / WebP のみ', JSON.stringify(storage.ALLOWED_MIME_TYPES)
);
assert(storage.MAX_FILE_SIZE_BYTES === 5 * 1024 * 1024, 'MAX_FILE_SIZE_BYTES は5MB', String(storage.MAX_FILE_SIZE_BYTES));

assert(storage.validateImageFile({ type: 'image/jpeg', size: 1024 }).ok === true, '許可されたMIME・サイズ内はok');
assert(storage.validateImageFile({ type: 'image/gif', size: 1024 }).ok === false, '許可されていないMIME（gif等）は拒否');
assert(storage.validateImageFile({ type: 'application/octet-stream', size: 1024 }).ok === false, '画像以外のMIMEは拒否');
assert(storage.validateImageFile({ type: 'image/png', size: storage.MAX_FILE_SIZE_BYTES + 1 }).ok === false, '上限超過サイズは拒否');
assert(storage.validateImageFile({ type: 'image/webp', size: storage.MAX_FILE_SIZE_BYTES }).ok === true, '上限ちょうどのサイズは許可');
assert(storage.validateImageFile({ type: 'image/jpeg', size: 0 }).ok === false, '空ファイル（size:0）は拒否');
assert(storage.validateImageFile(null).ok === false, 'ファイル未選択は拒否');

const path1 = storage.buildStoragePath('11111111-1111-4111-8111-111111111111', 'image/jpeg');
assert(path1.startsWith('blog/11111111-1111-4111-8111-111111111111/'), '保存先パスは blog/{draft-id}/ 配下', path1);
assert(path1.endsWith('.jpg'), 'JPEGの拡張子は.jpg', path1);
assert(storage.buildStoragePath('id', 'image/png').endsWith('.png'), 'PNGの拡張子は.png');
assert(storage.buildStoragePath('id', 'image/webp').endsWith('.webp'), 'WebPの拡張子は.webp');

const pathA = storage.buildStoragePath('id', 'image/jpeg');
const pathB = storage.buildStoragePath('id', 'image/jpeg');
assert(pathA !== pathB, '同じdraft・同じ形式でも毎回異なるファイル名になる（上書き事故防止）', `${pathA} / ${pathB}`);

try {
  storage.buildStoragePath(null, 'image/jpeg');
  fail('draft-id未指定はエラーになる', '例外が投げられませんでした');
} catch (e) {
  ok('draft-id未指定はエラーになる（Save Draft前のアップロードを防止）');
}

try {
  storage.buildStoragePath('id', 'image/gif');
  fail('未許可MIMEでのパス生成はエラーになる', '例外が投げられませんでした');
} catch (e) {
  ok('未許可MIMEでのパス生成はエラーになる');
}

// パストラバーサル対策：draft-idやファイル名はユーザー入力の生文字列を一切パスへ混ぜない設計を確認する
// （ファイル名は常にAdmin側が生成するtimestamp+ランダム値＋拡張子のみ）。
const suspicious = storage.buildStoragePath('11111111-1111-4111-8111-111111111111', 'image/png');
assert(!suspicious.includes('..'), '生成されるパスに ".." が含まれない', suspicious);
assert(/^blog\/[^/]+\/[0-9]+-[0-9a-z]+\.(jpg|png|webp)$/.test(suspicious), 'パスの形式が blog/{id}/{timestamp}-{rand}.{ext} に一致', suspicious);

/* ============================================================= */
console.log(`\n──────────────────────────────`);
console.log(`  PASS ${passed} / FAIL ${failures.length}`);
if (failures.length) {
  console.log('\n失敗した項目:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log('  すべて成功しました。');
