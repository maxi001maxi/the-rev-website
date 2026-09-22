import fs from 'node:fs';
import path from 'node:path';
import { REV_COLUMN_REFERENCE_V2, buildReferenceV2QaPrompt } from '../lib/editorialImageStyle.mjs';

const jobPath = process.argv[2];
if (!jobPath) throw new Error('Usage: node scripts/qa-editorial-image.mjs <job.json>');

const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
if (!apiKey) throw new Error('OPENAI_API_KEY is required for Reference V2 brand QA.');

const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const {
  slug,
  asset_version,
  style_references = [],
  content_reference,
  render_mode,
  qa_model = REV_COLUMN_REFERENCE_V2.qaModel,
  qa_report_path
} = job;

if (!slug || !asset_version || !qa_report_path || !content_reference) {
  throw new Error('job requires slug, asset_version, qa_report_path, content_reference');
}
if (render_mode !== 'source-photo-lock-v1') {
  throw new Error('Reference V2.2 QA only accepts source-photo-lock-v1 jobs.');
}
if (!fs.existsSync(content_reference)) throw new Error(`content reference missing: ${content_reference}`);

const versionSuffix = asset_version ? `-${asset_version}` : '';
const finalPath = path.resolve(`assets/images/blog/thumb-${slug}${versionSuffix}.jpg`);
if (!fs.existsSync(finalPath)) throw new Error(`final thumbnail missing: ${finalPath}`);

for (const ref of style_references) {
  if (!fs.existsSync(ref)) throw new Error(`style reference missing: ${ref}`);
}

function toDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' :
    ext === '.webp' ? 'image/webp' :
    'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function responseOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text.trim();
    }
  }
  return '';
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pass: { type: 'boolean' },
    series_consistency: { type: 'integer', minimum: 0, maximum: 10 },
    editorial_quality: { type: 'integer', minimum: 0, maximum: 10 },
    typography_harmony: { type: 'integer', minimum: 0, maximum: 10 },
    negative_space: { type: 'integer', minimum: 0, maximum: 10 },
    photo_treatment: { type: 'integer', minimum: 0, maximum: 10 },
    article_visual_relevance: { type: 'integer', minimum: 0, maximum: 10 },
    rev_environment_consistency: { type: 'integer', minimum: 0, maximum: 10 },
    brand_space_authenticity: { type: 'integer', minimum: 0, maximum: 10 },
    source_identity_preservation: { type: 'integer', minimum: 0, maximum: 10 },
    invented_people_or_objects: { type: 'boolean' },
    source_photo_changed_materially: { type: 'boolean' },
    trainer_present: { type: 'boolean' },
    unknown_trainer_present: { type: 'boolean' },
    non_customer_people_present: { type: 'boolean' },
    customer_only_or_no_people: { type: 'boolean' },
    real_the_rev_background_confirmed: { type: 'boolean' },
    source_material_scope_pass: { type: 'boolean' },
    copy_legible: { type: 'boolean' },
    expected_copy_present: { type: 'boolean' },
    unexpected_readable_text: { type: 'boolean' },
    unexpected_text_is_source_native: { type: 'boolean' },
    too_promotional: { type: 'boolean' },
    comments: { type: 'string' },
    correction: { type: 'string' }
  },
  required: [
    'pass',
    'series_consistency',
    'editorial_quality',
    'typography_harmony',
    'negative_space',
    'photo_treatment',
    'article_visual_relevance',
    'rev_environment_consistency',
    'brand_space_authenticity',
    'source_identity_preservation',
    'invented_people_or_objects',
    'source_photo_changed_materially',
    'trainer_present',
    'unknown_trainer_present',
    'non_customer_people_present',
    'customer_only_or_no_people',
    'real_the_rev_background_confirmed',
    'source_material_scope_pass',
    'copy_legible',
    'expected_copy_present',
    'unexpected_readable_text',
    'unexpected_text_is_source_native',
    'too_promotional',
    'comments',
    'correction'
  ]
};

const content = [
  { type: 'input_text', text: buildReferenceV2QaPrompt(job) },
  ...style_references.map((ref) => ({
    type: 'input_image',
    image_url: toDataUrl(ref),
    detail: 'high'
  })),
  {
    type: 'input_image',
    image_url: toDataUrl(content_reference),
    detail: 'high'
  },
  {
    type: 'input_image',
    image_url: toDataUrl(finalPath),
    detail: 'high'
  }
];

const requestedQaModel = String(process.env.EDITORIAL_IMAGE_QA_MODEL || '').trim();
const resolvedQaModel =
  requestedQaModel && requestedQaModel !== 'gpt-5.4-mini'
    ? requestedQaModel
    : String(qa_model || 'gpt-5.6-luna');

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 120000);
timeout.unref?.();

let res;
try {
  res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: resolvedQaModel,
      store: false,
      reasoning: { effort: 'low' },
      input: [{
        role: 'user',
        content
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'the_rev_editorial_image_qa',
          strict: true,
          schema
        }
      }
    }),
    signal: controller.signal
  });
} finally {
  clearTimeout(timeout);
}

let data = null;
try { data = await res.json(); } catch { /* handled below */ }

if (!res.ok) {
  const detail = data?.error?.message || data?.error?.code || `HTTP ${res.status}`;
  throw new Error(`Reference V2 image QA failed: ${detail}`);
}

let qa = null;
try {
  qa = JSON.parse(responseOutputText(data));
} catch {
  throw new Error('Reference V2 image QA returned invalid JSON.');
}

const hardPass =
  qa.pass === true &&
  qa.series_consistency >= 8 &&
  qa.editorial_quality >= 8 &&
  qa.typography_harmony >= 8 &&
  qa.negative_space >= 8 &&
  qa.photo_treatment >= 8 &&
  qa.article_visual_relevance >= 8 &&
  qa.rev_environment_consistency >= 8 &&
  qa.brand_space_authenticity >= 8 &&
  qa.source_identity_preservation >= 9 &&
  qa.invented_people_or_objects === false &&
  qa.source_photo_changed_materially === false &&
  qa.trainer_present === false &&
  qa.unknown_trainer_present === false &&
  qa.non_customer_people_present === false &&
  qa.customer_only_or_no_people === true &&
  qa.real_the_rev_background_confirmed === true &&
  qa.source_material_scope_pass === true &&
  qa.copy_legible === true &&
  qa.expected_copy_present === true &&
  (
    qa.unexpected_readable_text === false ||
    qa.unexpected_text_is_source_native === true
  ) &&
  qa.too_promotional === false;

const recentGuard = job.recent_reference_guard || {};
const currentRef = String(job.content_reference || '');
const recentRefs = Array.isArray(recentGuard.recent_content_references)
  ? recentGuard.recent_content_references.map(String)
  : [];
const deterministicRepeat = Boolean(currentRef && recentRefs.includes(currentRef));
const trainerSource = /(^|\/)(trainer-|career-boxing|career-asia|career-racing)/i.test(currentRef);
const fallbackReason = String(job.fallback_reason || '').trim();
const reviewHardPass =
  hardPass &&
  !deterministicRepeat &&
  !trainerSource &&
  Boolean(fallbackReason);

const report = {
  ...qa,
  pass: reviewHardPass,
  review_mode: 'SOURCE_LOCK_FALLBACK',
  image_generation_used: false,
  fallback_used: true,
  fallback_reason: fallbackReason,
  background_source_recorded: Boolean(currentRef),
  background_selection_reason_recorded: Boolean(String(job.content_reference_reason || '').trim()),
  recent_similarity_window: Number(recentGuard.window || 0),
  recent_similarity_check_pass: !deterministicRepeat,
  same_image_as_recent_articles: deterministicRepeat,
  same_background_as_recent_articles: deterministicRepeat,
  trainer_photo_reused: trainerSource,
  template: REV_COLUMN_REFERENCE_V2.id,
  render_version: REV_COLUMN_REFERENCE_V2.renderVersion,
  generation_model: job.generation_model || REV_COLUMN_REFERENCE_V2.generationModel,
  render_mode: job.render_mode || null,
  content_reference: job.content_reference || null,
  recent_reference_guard: job.recent_reference_guard || null,
  qa_model: resolvedQaModel,
  slug,
  asset_version,
  checked_at: new Date().toISOString()
};

fs.mkdirSync(path.dirname(qa_report_path), { recursive: true });
fs.writeFileSync(qa_report_path, JSON.stringify(report, null, 2) + '\n');

const tmpDir = path.resolve('.editorial-tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const tmpQa = path.join(tmpDir, `${slug}-${asset_version}-qa.json`);
fs.writeFileSync(tmpQa, JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify(report));
process.exitCode = reviewHardPass ? 0 : 2;
