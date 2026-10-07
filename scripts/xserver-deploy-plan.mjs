import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const DEPLOY_MODE = Object.freeze({
  SKIP: 'SKIP',
  BLOG_FAST: 'BLOG_FAST',
  FULL: 'FULL'
});

const FULL_PUBLIC_PATHS = [
  /^.*\.html$/,
  /^assets\//,
  /^templates\//,
  /^scripts\/build-blog\.mjs$/,
  /^scripts\/prepare-deploy\.mjs$/,
  /^scripts\/verify-blog-categories\.mjs$/,
  /^scripts\/verify-blog-card-dates\.mjs$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^favicon\.ico$/,
  /^robots\.txt$/,
  /^\.github\/workflows\/deploy-xserver\.yml$/
];

const BLOG_PATH = /^content\/blog\/.*\.md$/;

const EDITORIAL_STAGED_ASSET_PATHS = [
  /^assets\/images\/blog\//,
  /^assets\/images\/gbp\//,
  /^assets\/images\/editorial-generated\//
];

const AUTO_IMAGE_COMMIT_RE = /^(Generate Editorial Hybrid image assets|Mark Editorial Hybrid assets Xserver verified)\b/;

function uniq(values) {
  return [...new Set((values || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function isFullPublicImpact(file) {
  return FULL_PUBLIC_PATHS.some((re) => re.test(file));
}

function isEditorialStagedAsset(file) {
  return EDITORIAL_STAGED_ASSET_PATHS.some((re) => re.test(file));
}

export function classifyXserverDeploy({
  eventName = 'push',
  changedFiles = [],
  commitMessage = ''
} = {}) {
  const files = uniq(changedFiles);

  if (eventName === 'workflow_dispatch') {
    return {
      mode: DEPLOY_MODE.FULL,
      reason: 'manual-full-deploy',
      changedFiles: files,
      publicImpactFiles: files.filter(isFullPublicImpact)
    };
  }

  if (!files.length) {
    return {
      mode: DEPLOY_MODE.FULL,
      reason: 'unable-to-classify-fail-closed',
      changedFiles: files,
      publicImpactFiles: []
    };
  }

  const publicImpactFiles = files.filter((file) => BLOG_PATH.test(file) || isFullPublicImpact(file));

  if (!publicImpactFiles.length) {
    return {
      mode: DEPLOY_MODE.SKIP,
      reason: 'no-xserver-public-impact',
      changedFiles: files,
      publicImpactFiles
    };
  }

  const onlyBlog = publicImpactFiles.every((file) => BLOG_PATH.test(file));
  if (onlyBlog) {
    return {
      mode: DEPLOY_MODE.BLOG_FAST,
      reason: 'blog-content-only',
      changedFiles: files,
      publicImpactFiles
    };
  }

  const autoImageCommit = AUTO_IMAGE_COMMIT_RE.test(String(commitMessage || '').trim());
  const onlyStagedEditorialAssets = publicImpactFiles.every((file) => isEditorialStagedAsset(file));
  if (autoImageCommit && onlyStagedEditorialAssets) {
    return {
      mode: DEPLOY_MODE.SKIP,
      reason: 'editorial-assets-already-staged-and-verified',
      changedFiles: files,
      publicImpactFiles
    };
  }

  return {
    mode: DEPLOY_MODE.FULL,
    reason: 'static-site-or-unknown-public-impact',
    changedFiles: files,
    publicImpactFiles
  };
}

export function collectBlogFastTargetImages({ root = process.cwd(), changedFiles = [] } = {}) {
  const images = new Set();

  for (const file of uniq(changedFiles).filter((item) => BLOG_PATH.test(item))) {
    const full = path.resolve(root, file);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;

    const raw = fs.readFileSync(full, 'utf8');
    const { data } = matter(raw);
    if (String(data.status || '').trim().toLowerCase() !== 'published') continue;

    for (const value of [data.thumbnail, data.og_image]) {
      const publicPath = String(value || '').trim();
      if (!publicPath.startsWith('/assets/')) {
        throw new Error(`BLOG_FAST target image is not an /assets/ path: ${file} -> ${publicPath || '(empty)'}`);
      }
      const local = path.resolve(root, 'dist', publicPath.slice(1));
      if (!fs.existsSync(local)) {
        throw new Error(`BLOG_FAST target image is missing from dist: ${publicPath}`);
      }
      images.add(publicPath);
    }
  }

  return [...images].sort();
}

function readLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function appendGithubOutput(filePath, values) {
  if (!filePath) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value)}`);
  fs.appendFileSync(filePath, lines.join('\n') + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const changedFileList = argValue('--changed-file-list');
  const eventName = argValue('--event-name') || process.env.GITHUB_EVENT_NAME || 'push';
  const commitMessageFile = argValue('--commit-message-file');
  const githubOutput = argValue('--github-output');
  const writeTargetImages = argValue('--write-target-images');

  const changedFiles = readLines(changedFileList);
  const commitMessage = commitMessageFile && fs.existsSync(commitMessageFile)
    ? fs.readFileSync(commitMessageFile, 'utf8')
    : '';

  const plan = classifyXserverDeploy({ eventName, changedFiles, commitMessage });

  if (writeTargetImages) {
    const targets = collectBlogFastTargetImages({ changedFiles });
    fs.writeFileSync(writeTargetImages, targets.length ? `${targets.join('\n')}\n` : '');
  }

  appendGithubOutput(githubOutput, {
    mode: plan.mode,
    reason: plan.reason,
    changed_count: plan.changedFiles.length,
    public_impact_count: plan.publicImpactFiles.length
  });

  console.log(JSON.stringify(plan));
}
