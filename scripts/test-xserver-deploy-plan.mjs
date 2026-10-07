import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEPLOY_MODE,
  classifyXserverDeploy,
  collectBlogFastTargetImages
} from './xserver-deploy-plan.mjs';

test('content/blog only uses BLOG_FAST', () => {
  const plan = classifyXserverDeploy({
    changedFiles: ['content/blog/new-article.md']
  });
  assert.equal(plan.mode, DEPLOY_MODE.BLOG_FAST);
  assert.equal(plan.reason, 'blog-content-only');
});

test('blog plus non-public metadata still uses BLOG_FAST', () => {
  const plan = classifyXserverDeploy({
    changedFiles: ['content/blog/new-article.md', 'docs/note.md']
  });
  assert.equal(plan.mode, DEPLOY_MODE.BLOG_FAST);
});

test('API/lib-only changes do not occupy Xserver deploy lane', () => {
  const plan = classifyXserverDeploy({
    changedFiles: ['lib/publishFlow.mjs', 'api/integrations/editorial-status.mjs']
  });
  assert.equal(plan.mode, DEPLOY_MODE.SKIP);
  assert.equal(plan.reason, 'no-xserver-public-impact');
});

test('known Editorial image operator commit skips redundant full assets deploy', () => {
  const plan = classifyXserverDeploy({
    commitMessage: 'Generate Editorial Hybrid image assets',
    changedFiles: [
      'assets/images/blog/thumb-sample.jpg',
      'assets/images/blog/og/og-sample.jpg',
      'assets/images/gbp/gbp-sample.jpg',
      'editorial/image-qa/sample.json'
    ]
  });
  assert.equal(plan.mode, DEPLOY_MODE.SKIP);
  assert.equal(plan.reason, 'editorial-assets-already-staged-and-verified');
});

test('manual asset change remains FULL', () => {
  const plan = classifyXserverDeploy({
    commitMessage: 'Update homepage hero',
    changedFiles: ['assets/images/blog/thumb-sample.jpg']
  });
  assert.equal(plan.mode, DEPLOY_MODE.FULL);
});

test('CSS/template/build changes remain FULL', () => {
  for (const file of [
    'assets/css/style.css',
    'templates/blog-post.html',
    'scripts/build-blog.mjs',
    'package.json',
    'index.html'
  ]) {
    const plan = classifyXserverDeploy({ changedFiles: [file] });
    assert.equal(plan.mode, DEPLOY_MODE.FULL, file);
  }
});

test('mixed blog and static change fails over to FULL', () => {
  const plan = classifyXserverDeploy({
    changedFiles: ['content/blog/new-article.md', 'assets/css/blog.css']
  });
  assert.equal(plan.mode, DEPLOY_MODE.FULL);
});

test('manual workflow dispatch is always FULL', () => {
  const plan = classifyXserverDeploy({
    eventName: 'workflow_dispatch',
    changedFiles: ['content/blog/new-article.md']
  });
  assert.equal(plan.mode, DEPLOY_MODE.FULL);
});

test('empty classification fails closed to FULL', () => {
  const plan = classifyXserverDeploy({ changedFiles: [] });
  assert.equal(plan.mode, DEPLOY_MODE.FULL);
  assert.equal(plan.reason, 'unable-to-classify-fail-closed');
});


test('BLOG_FAST extracts only the changed published article images', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xserver-plan-'));
  try {
    fs.mkdirSync(path.join(root, 'content/blog'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist/assets/images/blog/og'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'content/blog/sample.md'),
      [
        '---',
        'status: published',
        'thumbnail: /assets/images/blog/thumb-sample.jpg',
        'og_image: /assets/images/blog/og/og-sample.jpg',
        '---',
        '',
        'body'
      ].join('\n')
    );
    fs.writeFileSync(path.join(root, 'dist/assets/images/blog/thumb-sample.jpg'), 'thumb');
    fs.writeFileSync(path.join(root, 'dist/assets/images/blog/og/og-sample.jpg'), 'og');

    assert.deepEqual(
      collectBlogFastTargetImages({ root, changedFiles: ['content/blog/sample.md'] }),
      ['/assets/images/blog/og/og-sample.jpg', '/assets/images/blog/thumb-sample.jpg']
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('BLOG_FAST fails closed if a published article points to a missing image', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xserver-plan-missing-'));
  try {
    fs.mkdirSync(path.join(root, 'content/blog'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'content/blog/sample.md'),
      [
        '---',
        'status: published',
        'thumbnail: /assets/images/blog/thumb-missing.jpg',
        'og_image: /assets/images/blog/og/og-missing.jpg',
        '---'
      ].join('\n')
    );
    assert.throws(
      () => collectBlogFastTargetImages({ root, changedFiles: ['content/blog/sample.md'] }),
      /missing from dist/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
