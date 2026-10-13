import fs from 'node:fs';
import path from 'node:path';

export const DEPLOY_MODE = Object.freeze({
  SKIP: 'SKIP',
  BLOG_FAST: 'BLOG_FAST',
  FULL_DELTA: 'FULL_DELTA',
  FULL: 'FULL'
});

const FULL_PUBLIC_PATHS = [
  /^(?!admin\/).*\.html$/,
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


function frontMatterValue(raw, key) {
  const text = String(raw || '');
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return '';
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return '';
  const end = lines.indexOf('---', 1);
  if (end < 0) return '';
  const prefix = `${key}:`;
  const line = lines.slice(1, end).find((row) => row.startsWith(prefix));
  if (!line) return '';
  const value = line.slice(prefix.length).trim();
  if (!value) return '';
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return String(JSON.parse(value)); } catch {}
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

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
  deletedFiles = [],
  hasBeforeSha = false,
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

  // A narrowly scoped, verifiable asset-only route. Never use it for deletions,
  // unknown base commits, blog changes, templates, or build changes.
  // It verifies remote BEFORE bytes against the Git parent before uploading.
  const assetOnly = publicImpactFiles.every(file => /^assets\/images\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(file)
    && !file.includes('..') && !file.endsWith('/'));
  if (hasBeforeSha && assetOnly && deletedFiles.length === 0
      && files.length <= 30 && publicImpactFiles.length > 0) {
    return {
      mode: DEPLOY_MODE.FULL_DELTA,
      reason: 'asset-only-exact-delta-with-preimage-backup',
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
    const status = frontMatterValue(raw, 'status').trim().toLowerCase();
    if (status !== 'published') continue;

    for (const value of [frontMatterValue(raw, 'thumbnail'), frontMatterValue(raw, 'og_image')]) {
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
  const deletedFileList = argValue('--deleted-file-list');
  const hasBeforeSha = argValue('--has-before-sha') === 'true';
  const deltaAssetList = argValue('--write-delta-assets');
  const githubOutput = argValue('--github-output');
  const writeTargetImages = argValue('--write-target-images');

  const changedFiles = readLines(changedFileList);
  const commitMessage = commitMessageFile && fs.existsSync(commitMessageFile)
    ? fs.readFileSync(commitMessageFile, 'utf8')
    : '';

  const plan = classifyXserverDeploy({ eventName, changedFiles, deletedFiles: readLines(deletedFileList), hasBeforeSha, commitMessage });
  if (deltaAssetList) {
    fs.writeFileSync(deltaAssetList, plan.mode === DEPLOY_MODE.FULL_DELTA
      ? plan.publicImpactFiles.join('\n') + '\n' : '');
  }

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
