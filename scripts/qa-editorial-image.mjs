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
  qa_model = REV_COLUMN_REFERENCE_V2.qaModel,
  qa_report_path
} = job;

if (!slug || !asset_version || !qa_report_path) {
  throw new Error('job requires slug, asset_version, qa_report_path');
}

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
    copy_legible: { type: 'boolean' },
    expected_copy_present: { type: 'boolean' },
    unexpected_readable_text: { type: 'boolean' },
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
    'copy_legible',
    'expected_copy_present',
    'unexpected_readable_text',
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
  qa.negative_space >= 7 &&
  qa.photo_treatment >= 7 &&
  qa.copy_legible === true &&
  qa.expected_copy_present === true &&
  qa.unexpected_readable_text === false &&
  qa.too_promotional === false;

const report = {
  ...qa,
  pass: hardPass,
  template: REV_COLUMN_REFERENCE_V2.id,
  render_version: REV_COLUMN_REFERENCE_V2.renderVersion,
  generation_model: job.generation_model || REV_COLUMN_REFERENCE_V2.generationModel,
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
process.exitCode = hardPass ? 0 : 2;
