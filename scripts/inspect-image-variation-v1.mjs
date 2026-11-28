#!/usr/bin/env node
/**
 * Read-only offline inspector for an EXISTING canonical Hybrid job.
 * Produces a shadow report; never writes job/QA/state files or uses API tokens.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildImageVariationShadowReport} from '../lib/editorialImageVariationV1.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const jobArg=process.argv[2];
if (!jobArg || process.argv.length!==3)
  throw new Error('Usage: node scripts/inspect-image-variation-v1.mjs editorial/hybrid-image-jobs/<slug>.json');
const absolute=path.resolve(ROOT,jobArg);
const allowedRoot=path.join(ROOT,'editorial','hybrid-image-jobs');
if (!absolute.startsWith(allowedRoot+path.sep) || !absolute.endsWith('.json') || path.basename(absolute)==='_template.json')
  throw new Error('Inspector requires an existing canonical Hybrid job JSON under editorial/hybrid-image-jobs');
const job=JSON.parse(fs.readFileSync(absolute,'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'editorial/automated-image-sources.json'),'utf8'));
const source=registry.sources.find(x=>x.source_id===job.automation?.selected_source_id);
if (!source || job.automation?.source_repo_path!==source.repo_path || job.background_source?.drive_file_id!==source.drive_file_id)
  throw new Error('SOURCE_REGISTRY_MISMATCH');
const sourceFile=path.resolve(ROOT,source.repo_path);
if (!sourceFile.startsWith(ROOT+path.sep)) throw new Error('SOURCE_PATH_ESCAPE');
const actualHash=createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
if (actualHash!==source.scene_inventory?.source_sha256 || actualHash!==job.scene_plan?.source_sha256)
  throw new Error('SOURCE_HASH_MISMATCH');
const report=buildImageVariationShadowReport({
  article:{title:job.article_title,description:'',primary_query:''},
  source,canonicalPlan:job.scene_plan,
  recent:job.automation?.recent_semantic_articles||[],
  imageCopy:job.image_headline_short
});
process.stdout.write(JSON.stringify({
  job_path:path.relative(ROOT,absolute),
  slug:job.slug,asset_version:job.asset_version,
  warning:'OFFLINE_SHADOW_ONLY_NO_VISUAL_QC_OR_READY_STATUS',
  report
},null,2)+'\n');
