// THE REV. Editorial Console — Phase D / Phase 10 regression tests
// node scripts/test-phase-d.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { buildBlogMarkdown, validateDraftForPublish, categoryLabelFor, contentPathFor, commitMessageFor } =
  await import('../lib/blogMarkdown.mjs');
const github = await import('../lib/githubContent.mjs');
const { checkPublisher, runPreflight } = await import('../lib/publishFlow.mjs');
const { IMAGE_RENDER_VERSION, IMAGE_STYLE_TEMPLATE } = await import('../lib/editorialImage.mjs');
const { HYBRID_IMAGE_FORMAT } = await import('../lib/editorialHybridImageFormat.mjs');
const storage = await import('../admin/js/admin-storage.mjs');

let passed = 0;
const failures = [];
function ok(name) { passed += 1; console.log(`  ✓ ${name}`); }
function fail(name, detail = '') { failures.push({ name, detail }); console.log(`  ✕ ${name}${detail ? ` — ${detail}` : ''}`); }
function assert(cond, name, detail = '') { cond ? ok(name) : fail(name, detail); }
function section(name) { console.log(`\n[${name}]`); }

const TEST_SLUG = 'phase-d-serializer-check';
const SAMPLE_DRAFT = {
  id: '00000000-0000-4000-8000-000000000000',
  title: 'Phase D 検証用：Markdown Serializer の出力確認',
  slug: TEST_SLUG,
  description: 'Serializerが生成したMarkdownを build-blog.mjs がそのまま読めるかを確認するための一時記事です。',
  published: '2026-01-15',
  updated: '2026-01-20',
  category: 'training',
  category_label: 'ignored',
  author: 'THE REV. CONDITIONING LAB.',
  author_role: 'THE REV. CONDITIONING LAB.',
  thumbnail: '/assets/images/blog/thumb-training.jpg',
  og_image: '/assets/images/blog/og/og-training.jpg',
  image_source_path: 'assets/images/trainer-top.jpg',
  image_asset_version: 'reference-v2-test123456',
  image_render_version: 'rev-column-reference-v2.2',
  status: 'draft',
  featured: true,
  cta_type: 'personal-training',
  keywords: ['引用"を含む', 'ハイフン-あり', '日本語'],
  canonical: null,
  noindex: false,
  body_markdown: '導入文です。\r\n\r\n## 見出しひとつめ\r\n\r\n本文の**強調**と[リンク](/price.html)。\r\n',
  source_path: null,
  source_sha: null
};

section('1. GitHub config fail-closed');
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_REPO;
delete process.env.GITHUB_BRANCH;
let cfg = github.publicGithubConfig();
assert(cfg.configured === false, '未設定ならconfigured=false', JSON.stringify(cfg));
assert(!('token' in cfg), '公開configにtokenを含めない');
try {
  await github.checkConnection();
  fail('未設定GitHub接続を拒否');
} catch (e) {
  assert(e.code === 'github_not_configured' && e.status === 503, 'github_not_configured (503)');
}

section('2. Publisher authorization');
delete process.env.ADMIN_PUBLISHER_USER_ID;
let p = await checkPublisher({ id: 'user-1' });
assert(p.allowed === false && p.reason === 'publisher_not_configured', 'Supabase無しは旧env方式でfail closed', JSON.stringify(p));
process.env.ADMIN_PUBLISHER_USER_ID = 'publisher-uuid';
p = await checkPublisher({ id: 'publisher-uuid' });
assert(p.allowed === true, 'env fallbackで一致ユーザーを許可', JSON.stringify(p));
p = await checkPublisher({ id: 'other' });
assert(p.allowed === false && p.reason === 'not_publisher', 'env fallbackで不一致ユーザーを拒否', JSON.stringify(p));

function fakeSupabase({ draft = SAMPLE_DRAFT, member = { active: true, can_publish: true }, error = null } = {}) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: table === 'admin_members' ? member : draft, error })
              };
            }
          };
        }
      };
    }
  };
}

p = await checkPublisher({ id: 'publisher-uuid' }, fakeSupabase());
assert(p.allowed === true, 'admin_members active+can_publishを許可', JSON.stringify(p));
p = await checkPublisher({ id: 'publisher-uuid' }, fakeSupabase({ member: { active: true, can_publish: false } }));
assert(p.allowed === false && p.reason === 'not_publisher', 'can_publish=falseを拒否', JSON.stringify(p));

section('3. Markdown serializer / validation');
const md = buildBlogMarkdown(SAMPLE_DRAFT);
const parsed = matter(md);
assert(parsed.data.status === 'published', 'GitHub出力statusはpublished');
assert(parsed.data.category_label === categoryLabelFor(SAMPLE_DRAFT.category), 'category_labelをcategoryから算出');
assert(parsed.data.thumbnail === SAMPLE_DRAFT.thumbnail, 'thumbnailをFront Matterへ出力');
assert(parsed.data.og_image === SAMPLE_DRAFT.og_image, 'og_imageをFront Matterへ出力');
assert(parsed.data.content_reference === SAMPLE_DRAFT.image_source_path, 'Content Reference lineageをFront Matterへ出力');
assert(parsed.data.image_asset_version === SAMPLE_DRAFT.image_asset_version, 'image asset versionをFront Matterへ出力');
assert(parsed.data.image_render_version === SAMPLE_DRAFT.image_render_version, 'image render versionをFront Matterへ出力');
assert(parsed.data.canonical === `https://therev-lab.com/blog/${TEST_SLUG}/`, 'canonical自動生成');
assert(Array.isArray(parsed.data.keywords) && parsed.data.keywords.length === 3, 'keywords配列を保持');
assert(!parsed.content.includes('\r'), '本文CRLFをLFへ正規化');
assert(commitMessageFor(SAMPLE_DRAFT, 'create').startsWith('Publish blog: '), '新規publish commit message');
assert(contentPathFor(TEST_SLUG) === `content/blog/${TEST_SLUG}.md`, 'content path生成');

assert(validateDraftForPublish(SAMPLE_DRAFT).length === 0, '完成Draftはpublish validation通過', validateDraftForPublish(SAMPLE_DRAFT).join(' '));
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, title: '' }).some((x) => x.includes('Title')), 'title未入力を検出');
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, thumbnail: '' }).some((x) => x.includes('Thumbnail')), 'thumbnail未設定を検出');
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, og_image: '' }).some((x) => x.includes('OGP')), 'OGP未設定を検出');
assert(validateDraftForPublish({ ...SAMPLE_DRAFT, slug: 'Bad Slug' }).some((x) => x.startsWith('Slug ')), '不正slugを検出');

section('4. Real build compatibility');
const tmpMdPath = path.join(ROOT, 'content', 'blog', `${TEST_SLUG}.md`);
const outIndexPath = path.join(ROOT, 'blog', TEST_SLUG, 'index.html');
if (fs.existsSync(tmpMdPath)) {
  fail('一時テスト記事が事前に存在しない', tmpMdPath);
} else {
  try {
    fs.writeFileSync(tmpMdPath, md, 'utf8');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-blog.mjs')], { cwd: ROOT, encoding: 'utf8' });
    assert(fs.existsSync(outIndexPath), 'build-blogが記事HTMLを生成');
    const html = fs.readFileSync(outIndexPath, 'utf8');
    assert(html.includes(SAMPLE_DRAFT.title), '生成HTMLにタイトル');
    assert(html.includes(SAMPLE_DRAFT.og_image), '生成HTMLにOGP画像');
    assert(html.includes(SAMPLE_DRAFT.thumbnail), '生成HTMLに記事画像');
  } catch (e) {
    fail('build-blog互換性', String(e.stdout || e.message || e));
  } finally {
    if (fs.existsSync(tmpMdPath)) fs.unlinkSync(tmpMdPath);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-blog.mjs')], { cwd: ROOT, stdio: 'ignore' });
    assert(!fs.existsSync(outIndexPath), 'テスト生成物をcleanup');
  }
}

section('5. Preflight branches');
const USER = { id: 'publisher-uuid', email: 'owner@example.com' };
const BASE_DRAFT = { ...SAMPLE_DRAFT, id: 'a1', slug: 'my-post', source_path: null, source_sha: null };
function checkOf(result, id) { return result.checks.find((c) => c.id === id); }

delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_REPO;
let r = await runPreflight({ supabase: fakeSupabase({ draft: BASE_DRAFT }), user: USER, articleId: 'a1' });
assert(r.ok === false && r.blocker?.code === 'github_not_configured', 'admin権限OKでもGitHub未設定なら停止', JSON.stringify(r.blocker));

r = await runPreflight({ supabase: fakeSupabase({ draft: { ...BASE_DRAFT, thumbnail: '' } }), user: USER, articleId: 'a1' });
assert(checkOf(r, 'required')?.status === 'error' && r.blocker?.status === 422, '画像未設定はPreflightでpublish不可', JSON.stringify(r.blocker));

r = await runPreflight({
  supabase: fakeSupabase({
    draft: {
      ...BASE_DRAFT,
      editorial_source: 'the-rev-editorial-ai',
      image_status: 'LEGACY_READY',
      image_asset_ready: true,
      image_render_version: null
    }
  }),
  user: USER,
  articleId: 'a1'
});
assert(checkOf(r, 'image_release')?.status === 'error' && ['image_review_gate_failed','image_not_ready'].includes(r.blocker?.code), '旧画像Render VersionのEditorial記事はpublish不可', JSON.stringify(r.blocker));

r = await runPreflight({
  supabase: fakeSupabase({
    draft: {
      ...BASE_DRAFT,
      editorial_source: 'the-rev-editorial-ai',
      image_status: 'READY',
      image_asset_ready: true,
      image_render_version: IMAGE_RENDER_VERSION,
      image_style_template: 'wrong-template',
      image_headline_short: '短いコピー。',
      image_asset_version: 'classic-v1-deadbeef00',
      image_qa: { pass: true },
      thumbnail: '/assets/images/blog/thumb-my-post-classic-v1-deadbeef00.jpg',
      og_image: '/assets/images/blog/og/og-my-post-classic-v1-deadbeef00.jpg'
    }
  }),
  user: USER,
  articleId: 'a1'
});
assert(checkOf(r, 'image_release')?.status === 'error' && ['image_review_gate_failed','image_not_ready'].includes(r.blocker?.code), 'Classic V1以外のテンプレートはpublish不可', JSON.stringify(r.blocker));

r = await runPreflight({
  supabase: fakeSupabase({
    draft: {
      ...BASE_DRAFT,
      editorial_source: 'the-rev-editorial-ai',
      image_status: 'READY',
      image_asset_ready: true,
      image_render_version: IMAGE_RENDER_VERSION,
      image_style_template: IMAGE_STYLE_TEMPLATE,
      image_headline_short: '短いコピー。',
      image_asset_version: 'classic-v1-deadbeef00',
      image_qa: { pass: true },
      thumbnail: '/assets/images/blog/thumb-my-post.jpg',
      og_image: '/assets/images/blog/og/og-my-post.jpg'
    }
  }),
  user: USER,
  articleId: 'a1'
});
assert(checkOf(r, 'image_release')?.status === 'error' && ['image_review_gate_failed','image_not_ready'].includes(r.blocker?.code), 'versioned filenameでないEditorial画像はpublish不可', JSON.stringify(r.blocker));

r = await runPreflight({
  supabase: fakeSupabase({
    draft: {
      ...BASE_DRAFT,
      editorial_source: 'the-rev-editorial-ai',
      image_status: 'READY',
      image_asset_ready: true,
      image_render_version: HYBRID_IMAGE_FORMAT.id,
      image_strategy: HYBRID_IMAGE_FORMAT.strategy,
      image_style_template: IMAGE_STYLE_TEMPLATE,
      image_headline_short: '短いHybridコピー。',
      image_asset_version: 'reference-v23-hybrid-test',
      image_qa_report_path: 'editorial/image-qa/my-post-reference-v23-hybrid-test.json',
      image_qa: {
        pass: true,
        series_consistency: 9,
        editorial_quality: 9,
        typography_harmony: 9,
        negative_space: 9,
        photo_treatment: 9,
        article_visual_relevance: 10,
        rev_environment_consistency: 10,
        brand_space_authenticity: 10,
        source_material_scope_pass: true,
        trainer_present: false,
        unknown_trainer_present: false,
        non_customer_people_present: false,
        customer_only_or_no_people: true,
        generated_customer_present: true,
        generated_customer_count: 1,
        facility_only_thumbnail: false,
        fixed_overlay_layout_confirmed: true,
        layout_template_id: HYBRID_IMAGE_FORMAT.layoutTemplateId,
        policy_revision: HYBRID_IMAGE_FORMAT.policyRevision,
        real_the_rev_background_confirmed: true,
        background_source_recorded: true,
        background_selection_reason_recorded: true,
        image_generation_used: true,
        fallback_used: false,
        same_image_as_recent_articles: false,
        same_background_as_recent_articles: false,
        trainer_photo_reused: false,
        recent_similarity_window: 4,
        recent_similarity_check_pass: true,
        expected_copy_present: true,
        copy_legible: true,
        too_promotional: false
      },
      thumbnail: '/assets/images/blog/thumb-my-post-reference-v23-hybrid-test.jpg',
      og_image: '/assets/images/blog/og/og-my-post-reference-v23-hybrid-test.jpg'
    }
  }),
  user: USER,
  articleId: 'a1'
});
assert(checkOf(r, 'image_release')?.status === 'ok', 'V2.4 Policy準拠HybridのQC合格Draftは画像Release Gate通過', JSON.stringify(r.blocker));

r = await runPreflight({
  supabase: fakeSupabase({
    draft: {
      ...BASE_DRAFT,
      editorial_source: 'the-rev-editorial-ai',
      image_status: 'READY',
      image_asset_ready: true,
      image_render_version: HYBRID_IMAGE_FORMAT.id,
      image_strategy: HYBRID_IMAGE_FORMAT.strategy,
      image_style_template: IMAGE_STYLE_TEMPLATE,
      image_headline_short: '短いHybridコピー。',
      image_asset_version: 'reference-v23-hybrid-test',
      image_qa_report_path: 'editorial/image-qa/my-post-reference-v23-hybrid-test.json',
      image_qa: {
        pass: true,
        series_consistency: 9,
        editorial_quality: 9,
        article_visual_relevance: 10,
        rev_environment_consistency: 10,
        brand_space_authenticity: 10,
        source_material_scope_pass: true,
        trainer_present: false,
        unknown_trainer_present: true,
        non_customer_people_present: false,
        customer_only_or_no_people: true,
        generated_customer_present: true,
        generated_customer_count: 1,
        facility_only_thumbnail: false,
        fixed_overlay_layout_confirmed: true,
        layout_template_id: HYBRID_IMAGE_FORMAT.layoutTemplateId,
        policy_revision: HYBRID_IMAGE_FORMAT.policyRevision,
        real_the_rev_background_confirmed: true,
        background_source_recorded: true,
        background_selection_reason_recorded: true,
        image_generation_used: true,
        fallback_used: false,
        same_image_as_recent_articles: false,
        same_background_as_recent_articles: false,
        trainer_photo_reused: false,
        recent_similarity_window: 4,
        recent_similarity_check_pass: true,
        expected_copy_present: true,
        copy_legible: true,
        too_promotional: false
      },
      thumbnail: '/assets/images/blog/thumb-my-post-reference-v23-hybrid-test.jpg',
      og_image: '/assets/images/blog/og/og-my-post-reference-v23-hybrid-test.jpg'
    }
  }),
  user: USER,
  articleId: 'a1'
});
assert(checkOf(r, 'image_release')?.status === 'error' && ['image_review_gate_failed','image_not_ready'].includes(r.blocker?.code), '未知トレーナーありHybridはPublish Gateで拒否', JSON.stringify(r.blocker));

r = await runPreflight({ supabase: fakeSupabase({ draft: null }), user: USER, articleId: 'a1' });
assert(r.ok === false && r.blocker?.code === 'not_found', 'Draft無しは404');

process.env.GITHUB_TOKEN = 'stub-token-must-not-leak';
process.env.GITHUB_REPO = 'example-owner/example-repo';
process.env.GITHUB_BRANCH = 'main';
const realFetch = globalThis.fetch;
let files = {};
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (/\/repos\/[^/]+\/[^/]+$/.test(u)) return json(200, { default_branch: 'main' });
  if (/\/branches\/main$/.test(u)) return json(200, { name: 'main' });
  const m = /\/contents\/(.+?)(?:\?|$)/.exec(u);
  if (m) {
    const filePath = decodeURIComponent(m[1]);
    if ((options.method || 'GET') === 'GET') {
      const f = files[filePath];
      return f ? json(200, { sha: f.sha, path: filePath, size: f.content.length, html_url: `https://github.com/x/${filePath}`, content: Buffer.from(f.content).toString('base64') }) : json(404, { message: 'Not Found' });
    }
    if (options.method === 'PUT') {
      const sent = JSON.parse(options.body);
      const existing = files[filePath];
      if (existing && sent.sha !== existing.sha) return json(409, { message: 'does not match' });
      const sha = `sha-${Date.now()}`;
      files[filePath] = { sha, content: Buffer.from(sent.content, 'base64').toString('utf8') };
      return json(200, { content: { sha, path: filePath, html_url: 'https://github.com/x' }, commit: { sha: 'commit-1', html_url: 'https://github.com/x/c/1' } });
    }
  }
  return json(404, { message: 'Not Found' });
};
try {
  r = await runPreflight({ supabase: fakeSupabase({ draft: BASE_DRAFT }), user: USER, articleId: 'a1' });
  assert(r.ok === true && r.mode === 'create', '新規記事はGitHub衝突なしでPreflight通過', JSON.stringify(r.blocker));
  files['content/blog/my-post.md'] = { sha: 'sha-existing', content: '# existing' };
  r = await runPreflight({ supabase: fakeSupabase({ draft: BASE_DRAFT }), user: USER, articleId: 'a1' });
  assert(r.ok === false && r.blocker?.code === 'slug_exists_on_github', 'slug衝突を検出');
} finally {
  globalThis.fetch = realFetch;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPO;
  delete process.env.GITHUB_BRANCH;
  delete process.env.ADMIN_PUBLISHER_USER_ID;
}

section('6. Admin image upload validation');
assert(storage.validateImageFile({ type: 'image/jpeg', size: 1024 }).ok === true, 'JPEG許可');
assert(storage.validateImageFile({ type: 'image/gif', size: 1024 }).ok === false, 'GIF拒否');
assert(storage.validateImageFile({ type: 'image/png', size: storage.MAX_FILE_SIZE_BYTES + 1 }).ok === false, '5MB超過拒否');
const pth = storage.buildStoragePath('11111111-1111-4111-8111-111111111111', 'image/webp');
assert(/^blog\/[^/]+\/[0-9]+-[0-9a-z]+\.webp$/.test(pth), '安全なstorage path生成', pth);

console.log(`\n──────────────────────────────`);
console.log(`  PASS ${passed} / FAIL ${failures.length}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log('  すべて成功しました。');
