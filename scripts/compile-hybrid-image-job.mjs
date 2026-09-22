import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HYBRID_IMAGE_FORMAT,
  buildHybridImageJob
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

const job = buildHybridImageJob({
  slug,
  title: clean(request.article_title),
  categoryLabel: clean(request.category_label),
  columnLabel: clean(request.column_label),
  imageHeadlineShort: clean(request.image_headline_short),
  assetVersion,
  qaReportPath: `editorial/image-qa/${slug}-${assetVersion}.json`,
  backgroundSource: {
    driveFileId: clean(bg.drive_file_id),
    cachedFrameDriveFileId: clean(bg.cached_frame_drive_file_id),
    originVideoFileId: clean(bg.origin_video_file_id),
    originVideoFileName: clean(bg.origin_video_file_name),
    framePositionRatio: bg.frame_position_ratio ?? null,
    selectionReason: clean(bg.selection_reason),
    treatment: clean(bg.treatment)
  }
});

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
