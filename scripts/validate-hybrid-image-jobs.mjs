import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HYBRID_IMAGE_FORMAT,
  hybridQaReady,
  hybridAssetPaths
} from '../lib/editorialHybridImageFormat.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JOB_DIR = path.join(ROOT, 'editorial', 'hybrid-image-jobs');
const FORMAT_JSON = path.join(ROOT, 'editorial', 'reference-v23-hybrid-format.json');

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clean(value) {
  return String(value ?? '').trim();
}

function jpegSize(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return {
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        height: (bytes[i + 5] << 8) | bytes[i + 6]
      };
    }
    if (!len || len < 2) break;
    i += 2 + len;
  }
  return null;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(`${message}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

function assertTrue(value, message) {
  if (!value) fail(message);
}

function validateFormatMirror() {
  const machine = readJson(FORMAT_JSON);
  assertEqual(machine.format_id, HYBRID_IMAGE_FORMAT.id, 'machine format_id drift');
  assertEqual(machine.status, HYBRID_IMAGE_FORMAT.status, 'machine status drift');
  assertEqual(machine.policy_revision, HYBRID_IMAGE_FORMAT.policyRevision, 'machine V2.4 policy drift');
  assertEqual(machine.layout_template_id, HYBRID_IMAGE_FORMAT.layoutTemplateId, 'machine layout template drift');
  assertEqual(machine.activation_mode, HYBRID_IMAGE_FORMAT.activationMode, 'activation mode drift');
  assertEqual(machine.fallback_before_hybrid_ready, HYBRID_IMAGE_FORMAT.fallbackBeforeHybridReady, 'fallback route drift');
  assertEqual(machine.job_template, HYBRID_IMAGE_FORMAT.jobTemplatePath, 'job template path drift');
  assertEqual(machine.validator, HYBRID_IMAGE_FORMAT.validatorScript, 'validator path drift');
  assertEqual(machine.style_template, HYBRID_IMAGE_FORMAT.styleTemplate, 'machine style_template drift');
  assertEqual(machine.image_strategy, HYBRID_IMAGE_FORMAT.strategy, 'machine image_strategy drift');
  assertEqual(
    JSON.stringify(machine.design_reference_assets),
    JSON.stringify(HYBRID_IMAGE_FORMAT.designReferenceAssets),
    'design reference assets drift'
  );
  assertEqual(machine.source_of_truth.drive_root_folder_id, HYBRID_IMAGE_FORMAT.driveRootFolderId, 'Drive root drift');
  assertEqual(machine.source_of_truth.full_drive_search, false, 'full Drive search must stay disabled');
  assertEqual(machine.source_of_truth.recent_reference_window, HYBRID_IMAGE_FORMAT.recentReferenceWindow, 'recent-reference window drift');
  assertEqual(machine.publish_boundary, HYBRID_IMAGE_FORMAT.publishBoundary, 'publish boundary drift');
  assertEqual(machine.outputs.thumbnail.width, HYBRID_IMAGE_FORMAT.output.thumbnail.width, 'thumbnail width drift');
  assertEqual(machine.outputs.thumbnail.height, HYBRID_IMAGE_FORMAT.output.thumbnail.height, 'thumbnail height drift');
  assertEqual(machine.outputs.ogp.width, HYBRID_IMAGE_FORMAT.output.ogp.width, 'OGP width drift');
  assertEqual(machine.outputs.ogp.height, HYBRID_IMAGE_FORMAT.output.ogp.height, 'OGP height drift');
  assertEqual(machine.outputs.gbp.width, HYBRID_IMAGE_FORMAT.output.gbp.width, 'GBP width drift');
  assertEqual(machine.outputs.gbp.height, HYBRID_IMAGE_FORMAT.output.gbp.height, 'GBP height drift');
  assertEqual(machine.outputs.gbp.ratio, HYBRID_IMAGE_FORMAT.output.gbp.ratio, 'GBP ratio drift');
  assertEqual(machine.qc_gate.typography_harmony_min, HYBRID_IMAGE_FORMAT.qc.minTypographyHarmony, 'typography QC drift');
  assertEqual(machine.qc_gate.negative_space_min, HYBRID_IMAGE_FORMAT.qc.minNegativeSpace, 'negative-space QC drift');
  assertEqual(machine.qc_gate.photo_treatment_min, HYBRID_IMAGE_FORMAT.qc.minPhotoTreatment, 'photo-treatment QC drift');
  assertEqual(machine.qc_gate.generated_customer_count_min, HYBRID_IMAGE_FORMAT.qc.minGeneratedCustomerCount, 'customer count min drift');
  assertEqual(machine.qc_gate.generated_customer_count_max, HYBRID_IMAGE_FORMAT.qc.maxGeneratedCustomerCount, 'customer count max drift');
  assertEqual(machine.qc_gate.facility_only_thumbnail, false, 'facility-only thumbnails must stay forbidden');
  assertEqual(machine.qc_gate.fixed_overlay_layout_confirmed, true, 'fixed overlay requirement drift');
}

function validateJob(jobPath) {
  const job = readJson(jobPath);
  const name = path.basename(jobPath);

  assertTrue(clean(job.slug), `${name}: slug missing`);
  assertTrue(clean(job.article_title), `${name}: article_title missing`);
  assertTrue(clean(job.image_headline_short), `${name}: image_headline_short missing`);
  assertEqual(job.render_version, HYBRID_IMAGE_FORMAT.id, `${name}: render_version drift`);
  assertEqual(job.image_strategy, HYBRID_IMAGE_FORMAT.strategy, `${name}: image_strategy drift`);
  assertEqual(job.image_style_template, HYBRID_IMAGE_FORMAT.styleTemplate, `${name}: image_style_template drift`);
  assertEqual(job.generation_model, HYBRID_IMAGE_FORMAT.generationModel, `${name}: generation model drift`);
  assertEqual(job.qa_model, HYBRID_IMAGE_FORMAT.qaModel, `${name}: QA model drift`);
  assertEqual(job.publish_requires_human_approval, true, `${name}: human publish boundary removed`);
  const legacyAccepted = HYBRID_IMAGE_FORMAT.acceptedReferences.some((ref) => ref.assetVersion === job.asset_version);
  if (!legacyAccepted) {
    assertEqual(job.policy_revision, HYBRID_IMAGE_FORMAT.policyRevision, `${name}: V2.4 policy revision missing`);
    assertEqual(job.layout_template_id, HYBRID_IMAGE_FORMAT.layoutTemplateId, `${name}: fixed overlay template drift`);
    assertTrue(clean(job.scene_intent), `${name}: scene_intent missing`);
    assertTrue(Number.isInteger(Number(job.generated_customer_count)) && Number(job.generated_customer_count) >= 1 && Number(job.generated_customer_count) <= 2, `${name}: generated_customer_count must be 1..2`);
    assertTrue(clean(job.generated_scene_path), `${name}: generated_scene_path missing`);
    assertEqual(job.policy?.generated_customer_required, true, `${name}: generated customer must be required`);
    assertEqual(job.policy?.facility_only_thumbnail_forbidden, true, `${name}: facility-only thumbnail policy drift`);
    assertEqual(job.policy?.fixed_overlay_required, true, `${name}: fixed overlay policy drift`);
  }
  assertEqual(
    JSON.stringify(job.style_references || []),
    JSON.stringify(HYBRID_IMAGE_FORMAT.designReferenceAssets),
    `${name}: approved style references missing or reordered`
  );

  assertEqual(job.policy?.source_scope, HYBRID_IMAGE_FORMAT.sourcePolicy.scope, `${name}: source_scope drift`);
  assertEqual(job.policy?.drive_root_folder_id, HYBRID_IMAGE_FORMAT.driveRootFolderId, `${name}: Drive root drift`);
  assertEqual(job.policy?.generated_customer_allowed, true, `${name}: generated-customer policy drift`);
  assertEqual(job.policy?.trainer_present_forbidden, true, `${name}: trainer-present policy drift`);
  assertEqual(job.policy?.unknown_trainer_forbidden, true, `${name}: unknown trainer policy drift`);
  assertEqual(job.policy?.non_customer_people_forbidden, true, `${name}: non-customer policy drift`);
  assertEqual(job.policy?.customer_only_or_no_people_required, true, `${name}: customer-only policy drift`);
  assertEqual(job.policy?.real_the_rev_background_required, true, `${name}: real THE REV environment requirement drift`);
  if (job.policy?.publish_boundary !== undefined) {
    assertEqual(job.policy.publish_boundary, HYBRID_IMAGE_FORMAT.publishBoundary, `${name}: job publish boundary drift`);
  }

  const bg = job.background_source || {};
  assertTrue(
    clean(bg.cached_frame_drive_file_id) || clean(bg.drive_file_id) || clean(bg.origin_video_file_id),
    `${name}: Drive background provenance missing`
  );

  const expected = hybridAssetPaths(job.slug, job.asset_version);
  assertEqual(job.thumbnail, expected.thumbnailRepoPath, `${name}: thumbnail path mismatch`);
  assertEqual(job.og_image, expected.ogRepoPath, `${name}: OGP path mismatch`);
  if (job.gbp_image) {
    assertEqual(job.gbp_image, expected.gbpRepoPath, `${name}: GBP path mismatch`);
    assertEqual(Number(job.gbp_image_width || 0), HYBRID_IMAGE_FORMAT.output.gbp.width, `${name}: GBP declared width mismatch`);
    assertEqual(Number(job.gbp_image_height || 0), HYBRID_IMAGE_FORMAT.output.gbp.height, `${name}: GBP declared height mismatch`);
    assertEqual(job.gbp_image_aspect_ratio, HYBRID_IMAGE_FORMAT.output.gbp.ratio, `${name}: GBP declared ratio mismatch`);
  }

  const thumbPath = path.join(ROOT, job.thumbnail);
  const ogPath = path.join(ROOT, job.og_image);
  const gbpPath = job.gbp_image ? path.join(ROOT, job.gbp_image) : null;
  const qaPath = path.join(ROOT, job.qa_report_path);

  assertTrue(fs.existsSync(thumbPath), `${name}: thumbnail asset missing: ${job.thumbnail}`);
  assertTrue(fs.existsSync(ogPath), `${name}: OGP asset missing: ${job.og_image}`);
  if (gbpPath) assertTrue(fs.existsSync(gbpPath), `${name}: GBP asset missing: ${job.gbp_image}`);
  assertTrue(fs.existsSync(qaPath), `${name}: QA report missing: ${job.qa_report_path}`);

  const thumbSize = jpegSize(thumbPath);
  const ogSize = jpegSize(ogPath);
  const gbpSize = gbpPath ? jpegSize(gbpPath) : null;
  assertTrue(thumbSize, `${name}: thumbnail is not readable JPEG`);
  assertTrue(ogSize, `${name}: OGP is not readable JPEG`);
  assertEqual(thumbSize.width, HYBRID_IMAGE_FORMAT.output.thumbnail.width, `${name}: thumbnail width mismatch`);
  assertEqual(thumbSize.height, HYBRID_IMAGE_FORMAT.output.thumbnail.height, `${name}: thumbnail height mismatch`);
  assertEqual(ogSize.width, HYBRID_IMAGE_FORMAT.output.ogp.width, `${name}: OGP width mismatch`);
  assertEqual(ogSize.height, HYBRID_IMAGE_FORMAT.output.ogp.height, `${name}: OGP height mismatch`);
  if (gbpPath) {
    assertTrue(gbpSize, `${name}: GBP image is not readable JPEG`);
    assertEqual(gbpSize.width, HYBRID_IMAGE_FORMAT.output.gbp.width, `${name}: GBP width mismatch`);
    assertEqual(gbpSize.height, HYBRID_IMAGE_FORMAT.output.gbp.height, `${name}: GBP height mismatch`);
  }

  const qa = readJson(qaPath);
  const draftShape = {
    image_render_version: job.render_version,
    image_strategy: job.image_strategy,
    image_asset_version: job.asset_version,
    image_qa: qa
  };
  assertTrue(hybridQaReady(draftShape, qa), `${name}: Hybrid QC gate failed`);
  if (qa.slug !== undefined) assertEqual(qa.slug, job.slug, `${name}: QA slug mismatch`);
  if (qa.asset_version !== undefined) assertEqual(qa.asset_version, job.asset_version, `${name}: QA asset_version mismatch`);
  if (qa.render_version !== undefined) assertEqual(qa.render_version, job.render_version, `${name}: QA render_version mismatch`);
  if (!legacyAccepted) {
    assertEqual(qa.policy_revision, HYBRID_IMAGE_FORMAT.policyRevision, `${name}: QA policy revision mismatch`);
    assertEqual(qa.layout_template_id, HYBRID_IMAGE_FORMAT.layoutTemplateId, `${name}: QA layout template mismatch`);
    assertEqual(qa.generated_customer_present, true, `${name}: generated customer missing`);
    assertTrue(Number(qa.generated_customer_count) >= 1 && Number(qa.generated_customer_count) <= 2, `${name}: QA customer count invalid`);
    assertEqual(qa.facility_only_thumbnail, false, `${name}: facility-only QA must be false`);
    assertEqual(qa.fixed_overlay_layout_confirmed, true, `${name}: fixed overlay QA missing`);
    if (job.gbp_image) {
      assertEqual(qa.gbp_image_required, true, `${name}: GBP QA required flag missing`);
      assertEqual(qa.gbp_aspect_ratio_pass, true, `${name}: GBP aspect ratio QA failed`);
      assertEqual(qa.gbp_safe_area_pass, true, `${name}: GBP safe-area QA failed`);
      assertEqual(qa.gbp_copy_legible, true, `${name}: GBP copy legibility QA failed`);
    }
    const scenePath = path.join(ROOT, job.generated_scene_path);
    assertTrue(fs.existsSync(scenePath), `${name}: generated scene missing: ${job.generated_scene_path}`);
  }

  if (qa.background_origin_video_file_id && bg.origin_video_file_id) {
    assertEqual(
      qa.background_origin_video_file_id,
      bg.origin_video_file_id,
      `${name}: QA/video provenance mismatch`
    );
  }
  if (qa.background_source_drive_file_id && bg.cached_frame_drive_file_id) {
    assertEqual(
      qa.background_source_drive_file_id,
      bg.cached_frame_drive_file_id,
      `${name}: QA/cached-frame provenance mismatch`
    );
  }

  return {
    slug: job.slug,
    assetVersion: job.asset_version,
    thumbnail: thumbSize,
    ogp: ogSize,
    gbp: gbpSize,
    qc: {
      series: qa.series_consistency,
      editorial: qa.editorial_quality,
      typography: qa.typography_harmony,
      negativeSpace: qa.negative_space,
      photoTreatment: qa.photo_treatment,
      relevance: qa.article_visual_relevance,
      revEnvironment: qa.rev_environment_consistency,
      brandSpace: qa.brand_space_authenticity
    }
  };
}

validateFormatMirror();

const jobs = fs.readdirSync(JOB_DIR)
  .filter((name) => name.endsWith('.json') && !name.startsWith('_'))
  .sort();

if (!jobs.length) fail('No V2.3 Hybrid jobs found.');

const results = jobs.map((name) => validateJob(path.join(JOB_DIR, name)));

console.log(`V2.3 Hybrid engine / V2.4 policy validation: PASS (${results.length} jobs)`);
for (const r of results) {
  console.log(
    `- ${r.slug}: ${r.assetVersion} / thumb ${r.thumbnail.width}x${r.thumbnail.height} / OGP ${r.ogp.width}x${r.ogp.height}${r.gbp ? ` / GBP ${r.gbp.width}x${r.gbp.height}` : ''} / QC ${r.qc.series}/${r.qc.editorial}/${r.qc.typography}/${r.qc.negativeSpace}/${r.qc.photoTreatment}/${r.qc.relevance}/${r.qc.revEnvironment}/${r.qc.brandSpace}`
  );
}
