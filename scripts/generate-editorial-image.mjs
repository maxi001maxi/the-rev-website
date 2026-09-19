import fs from 'node:fs';
import path from 'node:path';
import { buildReferenceV2GenerationPrompt, REV_COLUMN_REFERENCE_V2 } from '../lib/editorialImageStyle.mjs';

const jobPath = process.argv[2];
if (!jobPath) throw new Error('Usage: node scripts/generate-editorial-image.mjs <job.json>');

const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
if (!apiKey) throw new Error('OPENAI_API_KEY is required for Reference V2 image generation.');

const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const {
  slug,
  asset_version,
  style_references = [],
  content_reference,
  generation_model = REV_COLUMN_REFERENCE_V2.generationModel
} = job;

if (!slug || !asset_version || !content_reference) {
  throw new Error('job requires slug, asset_version, content_reference');
}
if (!Array.isArray(style_references) || style_references.length < 3) {
  throw new Error('Reference V2 requires at least 3 approved style references.');
}

const allInputs = [...style_references, content_reference];
for (const file of allInputs) {
  if (!fs.existsSync(file)) throw new Error(`reference image missing: ${file}`);
}

const tmpDir = path.resolve('.editorial-tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const basePath = path.join(tmpDir, `${slug}-${asset_version}-base.jpg`);
const qaTempPath = path.join(tmpDir, `${slug}-${asset_version}-qa.json`);

let correction = '';
if (fs.existsSync(qaTempPath)) {
  try {
    const previous = JSON.parse(fs.readFileSync(qaTempPath, 'utf8'));
    if (previous && previous.pass === false && previous.correction) {
      correction = String(previous.correction).trim();
    }
  } catch {
    // Ignore malformed previous QA; this attempt should still be able to run.
  }
}

const prompt = [
  buildReferenceV2GenerationPrompt(job),
  correction ? '' : null,
  correction ? 'REVISION FROM PREVIOUS BRAND QA:' : null,
  correction || null,
  correction ? 'Apply the correction while preserving the five approved references as the style source of truth.' : null
].filter(Boolean).join('\n');

const form = new FormData();
form.append('model', String(process.env.EDITORIAL_IMAGE_MODEL || generation_model || 'gpt-image-2'));
form.append('prompt', prompt);
form.append('n', '1');
form.append('size', '1536x1024');
form.append('quality', String(process.env.EDITORIAL_IMAGE_QUALITY || 'high'));
form.append('output_format', 'jpeg');
form.append('output_compression', '92');
form.append('background', 'opaque');

for (let i = 0; i < allInputs.length; i += 1) {
  const filePath = allInputs[i];
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' :
    ext === '.webp' ? 'image/webp' :
    'image/jpeg';
  const bytes = fs.readFileSync(filePath);
  form.append('image[]', new Blob([bytes], { type: mime }), path.basename(filePath));
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 300000);
timeout.unref?.();

let res;
try {
  res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: controller.signal
  });
} finally {
  clearTimeout(timeout);
}

let data = null;
try { data = await res.json(); } catch { /* handled below */ }

if (!res.ok || !data?.data?.[0]?.b64_json) {
  const detail = data?.error?.message || data?.error?.code || `HTTP ${res.status}`;
  throw new Error(`Reference V2 image generation failed: ${detail}`);
}

fs.writeFileSync(basePath, Buffer.from(data.data[0].b64_json, 'base64'));

console.log(JSON.stringify({
  slug,
  asset_version,
  model: process.env.EDITORIAL_IMAGE_MODEL || generation_model,
  style_reference_count: style_references.length,
  content_reference,
  base_image: basePath,
  correction_applied: Boolean(correction)
}));
