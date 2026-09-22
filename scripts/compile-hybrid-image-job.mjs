import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HYBRID_IMAGE_FORMAT,
  hybridAssetPaths
} from '../lib/editorialHybridImageFormat.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(message);
}

function clean(value) {
  return String(value ?? '').trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slugSafe(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseArgs(argv) {
  const args = { force: false, stdout: false, requestPath: '' };
  for (const arg of argv) {
    if (arg === '--force') args.force = true;
    else if (arg === '--stdout') args.stdout = true;
    else if (!args.requestPath) args.requestPath = arg;
    else fail(`Unexpected argument: ${arg}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.requestPath) {
  fail('Usage: npm run image:compile-job -- <request.json> [--stdout] [--force]');
}

const requestPath = path.resolve(args.requestPath);
if (!fs.existsSync(requestPath)) fail(`Request file not found: ${requestPath}`);

const request = readJson(requestPath);
if (request._template === true) {
  fail('Request is still marked as _template=true. Copy the template and remove _template/_note before compiling.');
}

const slug = slugSafe(request.slug);
if (!slug || slug !== clean(request.slug)) {
  fail('slug must already be lowercase kebab-case [a-z0-9-].');
}

for (const key of ['article_title', 'category_label', 'column_label', 'image_headline_short', 'asset_version']) {
  if (!clean(request[key])) fail(`Missing required request field: ${key}`);
}

const assetVersion = slugSafe(request.asset_version);
if (!assetVersion || assetVersion !== clean(request.asset_version)) {
  fail('asset_version must be lowercase kebab-case [a-z0-9-].');
}

const bg = request.background_source || {};
if (!clean(bg.drive_file_id) && !clean(bg.cached_frame_drive_file_id) && !clean(bg.origin_video_file_id)) {
  fail('background_source must contain at least one Drive provenance ID.');
}

if (bg.frame_position_ratio !== undefined && bg.frame_position_ratio !== null) {
  const ratio = Number(bg.frame_position_ratio);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    fail('background_source.frame_position_ratio must be between 0 and 1.');
  }
}

const paths = hybridAssetPaths(slug, assetVersion);

const job = {
  slug,
  article_title: clean(request.article_title),
  category_label: clean(request.category_label),
  column_label: clean(request.column_label),
  image_headline_short: clean(request.image_headline_short),
  image_style_template: HYBRID_IMAGE_FORMAT.styleTemplate,
  render_version: HYBRID_IMAGE_FORMAT.id,
  image_strategy: HYBRID_IMAGE_FORMAT.strategy,
  asset_version: assetVersion,
  thumbnail: paths.thumbnailRepoPath,
  og_image: paths.ogRepoPath,
  qa_report_path: `editorial/image-qa/${slug}-${assetVersion}.json`,
  generation_model: HYBRID_IMAGE_FORMAT.generationModel,
  qa_model: HYBRID_IMAGE_FORMAT.qaModel,
  publish_requires_human_approval: true,
  policy: {
    generated_customer_allowed: HYBRID_IMAGE_FORMAT.generationPolicy.generatedCustomerAllowed,
    unknown_trainer_forbidden: HYBRID_IMAGE_FORMAT.generationPolicy.unknownTrainerForbidden,
    non_customer_people_forbidden: HYBRID_IMAGE_FORMAT.generationPolicy.nonCustomerPeopleForbidden,
    real_the_rev_background_required: HYBRID_IMAGE_FORMAT.generationPolicy.realTheRevEnvironmentRequired,
    source_scope: HYBRID_IMAGE_FORMAT.sourcePolicy.scope,
    drive_root_folder_id: HYBRID_IMAGE_FORMAT.driveRootFolderId,
    recent_reference_window: HYBRID_IMAGE_FORMAT.recentReferenceWindow,
    selection_policy: HYBRID_IMAGE_FORMAT.sourceSelectionPolicy,
    publish_boundary: HYBRID_IMAGE_FORMAT.publishBoundary
  },
  background_source: {
    drive_file_id: clean(bg.drive_file_id),
    cached_frame_drive_file_id: clean(bg.cached_frame_drive_file_id),
    origin_video_file_id: clean(bg.origin_video_file_id),
    origin_video_file_name: clean(bg.origin_video_file_name),
    frame_position_ratio: bg.frame_position_ratio ?? null,
    selection_reason: clean(bg.selection_reason),
    treatment: clean(bg.treatment) || 'real THE REV source; editorial soften/blur/depth allowed'
  },
  style_references: [...HYBRID_IMAGE_FORMAT.designReferenceAssets]
};

const json = JSON.stringify(job, null, 2) + '\n';

if (args.stdout) {
  process.stdout.write(json);
  process.exit(0);
}

const outPath = path.join(ROOT, 'editorial', 'hybrid-image-jobs', `${slug}.json`);
if (fs.existsSync(outPath) && !args.force) {
  fail(`Job already exists: ${outPath}. Use --force only when intentionally replacing it.`);
}

fs.writeFileSync(outPath, json, 'utf8');
console.log(`Hybrid Job compiled: ${path.relative(ROOT, outPath)}`);
console.log(`Thumbnail: ${job.thumbnail}`);
console.log(`OGP: ${job.og_image}`);
console.log(`QA: ${job.qa_report_path}`);
