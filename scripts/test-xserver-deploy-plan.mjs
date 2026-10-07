import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPLOY_MODE,
  classifyXserverDeploy
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
