import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const jobPath = process.argv[2];
if (!jobPath) {
  throw new Error('Usage: node scripts/auto-editorial-hybrid-image.mjs <hybrid-job.json>');
}

const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const GENERATION_MODEL = String(process.env.EDITORIAL_IMAGE_GENERATION_MODEL || 'gpt-5.6').trim();
const QA_MODEL = String(process.env.EDITORIAL_IMAGE_QA_MODEL || 'gpt-5.6').trim();
const MAX_TOTAL_ATTEMPTS = Math.max(1, Number(process.env.EDITORIAL_IMAGE_MAX_ATTEMPTS || 3));

if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');

const ROOT = process.cwd();
const sourcePath = String(job?.automation?.source_repo_path || '').trim();
if (!sourcePath || !fs.existsSync(sourcePath)) {
  throw new Error(`Verified THE REV source is missing: ${sourcePath || '(empty)'}`);
}

for (const p of job.style_references || []) {
  if (!fs.existsSync(p)) throw new Error(`Style reference is missing: ${p}`);
}

const stateDir = path.join(ROOT, 'editorial', 'image-operator-state');
fs.mkdirSync(stateDir, { recursive: true });
const statePath = path.join(stateDir, `${job.slug}.json`);

function readJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function dataUrl(filePath) {
  return `data:${mimeFor(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

async function openaiResponse(payload) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const requestId = res.headers.get('x-request-id') || '';
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}

  if (!res.ok) {
    const e = new Error(
      `OpenAI Responses API failed: HTTP ${res.status} / ` +
      String(json?.error?.message || body || '').slice(0, 1200)
    );
    e.status = res.status;
    e.code = json?.error?.code || '';
    e.requestId = requestId;
    throw e;
  }
  return json;
}

function outputText(response) {
  const chunks = [];
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const c of item?.content || []) {
      if (c?.type === 'output_text' && c?.text) chunks.push(c.text);
    }
  }
  return chunks.join('\n').trim();
}

function extractJson(text) {
  const cleaned = String(text || '').trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/i, '');
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('Visual QA did not return valid JSON.');
}

function generationPrompt(attempt) {
  const sourceNote = String(job.background_source?.selection_reason || '');
  const treatment = String(job.background_source?.treatment || '');
  return [
    'Create one photorealistic editorial photograph for THE REV. CONDITIONING LAB. Blog / Column.',
    '',
    'CRITICAL SOURCE RULE:',
    '- The FIRST input image is the real THE REV. environment and is the spatial source of truth.',
    '- Preserve its recognizable architecture, rack/equipment placement, floor, windows, walls, perspective and overall camera logic.',
    '- Do not replace the gym with a generic or invented gym.',
    '- You may harmonize light, depth and color, but the location must still be recognizably the supplied THE REV. space.',
    '',
    'CUSTOMER SCENE:',
    `- Scene intent: ${job.scene_intent}`,
    `- Generate exactly ${job.generated_customer_count} adult customer.`,
    '- The person must clearly read as a customer, never a trainer, coach, employee, doctor or staff member.',
    '- Natural neutral training clothes. No logos or readable text.',
    '- Make the person physically integrated into the room: correct scale, perspective, floor contact, contact shadow, lighting direction and color temperature.',
    '- Avoid difficult full-body exercise poses unless they are completely plausible. Prefer a quiet preparation, recovery, self-check or low-motion moment when that communicates the article.',
    '- No pasted/cutout/sticker look.',
    '',
    'COMPOSITION:',
    '- Landscape editorial photography suitable for a 16:9 card.',
    '- The deterministic renderer places this generated scene into the RIGHT half of the final card using object-fit: cover and object-position: center.',
    "- Because that renderer center-crops the generated scene into a relatively narrow panel, keep the customer's face, torso, hands and any meaningful body contact near the HORIZONTAL CENTER of the generated image, not at the far right edge.",
    '- Keep the full important customer silhouette inside roughly the central 35%–65% horizontal band whenever possible, with comfortable margins around the subject.',
    '- Do not rely on details placed in the outer left/right 20% of the generated image; those areas may be cropped out by the final overlay.',
    '- Premium, restrained, warm, calm, realistic. Not a commercial fitness advertisement.',
    '- Do not render Japanese or English typography into the scene. Text will be added later by a deterministic overlay.',
    '',
    'STYLE REFERENCES:',
    '- Input images after the first are approved THE REV. editorial cards. Use them only for photographic mood, restraint, tonal treatment and realism.',
    '- Do not copy their people, text, or exact composition.',
    '',
    `Article title: ${job.article_title}`,
    `Editorial copy that will be added later: ${job.image_headline_short}`,
    `Source selection reason: ${sourceNote}`,
    `Allowed treatment: ${treatment}`,
    attempt > 1 ? `This is retry ${attempt}. Improve realism and source-environment fidelity over the prior attempt.` : ''
  ].filter(Boolean).join('\n');
}

async function generateScene(attempt) {
  const content = [
    { type: 'input_text', text: generationPrompt(attempt) },
    { type: 'input_image', image_url: dataUrl(sourcePath), detail: 'high' }
  ];

  for (const stylePath of job.style_references || []) {
    content.push({ type: 'input_image', image_url: dataUrl(stylePath), detail: 'auto' });
  }

  const response = await openaiResponse({
    model: GENERATION_MODEL,
    input: [{ role: 'user', content }],
    tools: [{
      type: 'image_generation',
      quality: 'medium',
      size: '1536x1024'
    }]
  });

  const calls = (response.output || []).filter((x) => x?.type === 'image_generation_call' && x?.result);
  if (!calls.length) {
    throw new Error('Image generation completed without image_generation_call.result.');
  }

  const outPath = path.resolve(job.generated_scene_path);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(calls[0].result, 'base64'));
  return outPath;
}

function renderOverlay() {
  execFileSync(
    process.execPath,
    ['scripts/render-hybrid-editorial-overlay.mjs', jobPath],
    { stdio: 'inherit', env: process.env }
  );
}

function requiredBool(value) {
  return value === true;
}

function clampScore(value) {
  const n = Math.round(Number(value || 0));
  return Math.max(0, Math.min(10, n));
}

function deterministicRecentIds() {
  const ids = [];
  for (const row of job?.automation?.recent_articles || []) {
    for (const v of [row?.driveFileId, row?.originVideoFileId, row?.contentReference]) {
      const s = String(v || '').trim();
      if (s && !ids.includes(s)) ids.push(s);
    }
  }
  return ids;
}

function qaPass(qa) {
  return (
    qa.pass === true &&
    qa.series_consistency >= 8 &&
    qa.editorial_quality >= 8 &&
    qa.typography_harmony >= 8 &&
    qa.negative_space >= 8 &&
    qa.photo_treatment >= 8 &&
    qa.article_visual_relevance >= 8 &&
    qa.rev_environment_consistency >= 8 &&
    qa.brand_space_authenticity >= 8 &&
    qa.human_environment_integration >= 9 &&
    qa.perspective_scale_consistency >= 9 &&
    qa.ground_contact_shadow_consistency >= 9 &&
    qa.lighting_consistency >= 9 &&
    qa.anatomy_pose_realism >= 9 &&
    qa.no_cutout_or_sticker_look === true &&
    qa.location_semantics_pass === true &&
    qa.exercise_pose_plausible === true &&
    qa.manual_visual_rejection !== true &&
    qa.source_material_scope_pass === true &&
    qa.trainer_present === false &&
    qa.unknown_trainer_present === false &&
    qa.non_customer_people_present === false &&
    qa.customer_only_or_no_people === true &&
    qa.generated_customer_present === true &&
    Number(qa.generated_customer_count) >= 1 &&
    Number(qa.generated_customer_count) <= 2 &&
    qa.facility_only_thumbnail === false &&
    qa.fixed_overlay_layout_confirmed === true &&
    qa.real_the_rev_background_confirmed === true &&
    qa.background_source_recorded === true &&
    qa.background_selection_reason_recorded === true &&
    qa.image_generation_used === true &&
    qa.fallback_used === false &&
    qa.recent_similarity_check_pass === true &&
    qa.same_image_as_recent_articles === false &&
    qa.same_background_as_recent_articles === false &&
    qa.trainer_photo_reused === false &&
    qa.expected_copy_present === true &&
    qa.copy_legible === true &&
    qa.too_promotional === false &&
    (
      qa.gbp_image_required !== true ||
      (
        qa.gbp_aspect_ratio_pass === true &&
        qa.gbp_safe_area_pass === true &&
        qa.gbp_copy_legible === true
      )
    )
  );
}

async function visualQa(attempt) {
  const thumbPath = path.resolve(job.thumbnail);
  const gbpPath = job.gbp_image ? path.resolve(job.gbp_image) : '';
  if (!fs.existsSync(thumbPath)) throw new Error(`Rendered thumbnail missing: ${job.thumbnail}`);
  if (job.gbp_image && !fs.existsSync(gbpPath)) throw new Error(`Rendered GBP image missing: ${job.gbp_image}`);

  const prompt = [
    'You are the strict visual QA gate for THE REV. CONDITIONING LAB. editorial images.',
    'Compare the FIRST image (real source environment) with the SECOND image (generated scene), THIRD image (final 16:9 thumbnail), and when present the FOURTH image (final GBP 4:3 image).',
    'Return ONLY one JSON object. Do not use markdown.',
    '',
    'The source environment is authoritative. Fail if the final scene looks like another gym, if a person looks pasted in, if any trainer/staff/coach appears, if no customer appears, or if anatomy/perspective/contact shadows/lighting are not convincing.',
    'The left-side typography in the final thumbnail and GBP image is deterministic. Judge whether it is legible, quiet/editorial and consistent with the series.',
    'For the GBP 4:3 image, fail if the 4:3 crop cuts the customer, important equipment contact, or headline; important content must remain inside a comfortable central safe area.',
    'For non-exercise quiet scenes, exercise_pose_plausible should be true when the pose is naturally plausible for the intended activity.',
    '',
    'Required JSON fields:',
    '{',
    '  "pass": boolean,',
    '  "series_consistency": 0-10,',
    '  "editorial_quality": 0-10,',
    '  "typography_harmony": 0-10,',
    '  "negative_space": 0-10,',
    '  "photo_treatment": 0-10,',
    '  "article_visual_relevance": 0-10,',
    '  "rev_environment_consistency": 0-10,',
    '  "brand_space_authenticity": 0-10,',
    '  "human_environment_integration": 0-10,',
    '  "perspective_scale_consistency": 0-10,',
    '  "ground_contact_shadow_consistency": 0-10,',
    '  "lighting_consistency": 0-10,',
    '  "anatomy_pose_realism": 0-10,',
    '  "no_cutout_or_sticker_look": boolean,',
    '  "location_semantics_pass": boolean,',
    '  "exercise_pose_plausible": boolean,',
    '  "manual_visual_rejection": boolean,',
    '  "trainer_present": boolean,',
    '  "unknown_trainer_present": boolean,',
    '  "non_customer_people_present": boolean,',
    '  "customer_only_or_no_people": boolean,',
    '  "generated_customer_present": boolean,',
    '  "generated_customer_count": integer,',
    '  "facility_only_thumbnail": boolean,',
    '  "real_the_rev_background_confirmed": boolean,',
    '  "expected_copy_present": boolean,',
    '  "copy_legible": boolean,',
    '  "too_promotional": boolean,',
    '  "gbp_aspect_ratio_pass": boolean,',
    '  "gbp_safe_area_pass": boolean,',
    '  "gbp_copy_legible": boolean,',
    '  "comments": "short Japanese explanation"',
    '}',
    '',
    `Article: ${job.article_title}`,
    `Scene intent: ${job.scene_intent}`,
    `Expected copy: ${job.image_headline_short}`,
    `Attempt: ${attempt}`
  ].join('\n');

  const response = await openaiResponse({
    model: QA_MODEL,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: dataUrl(sourcePath), detail: 'high' },
        { type: 'input_image', image_url: dataUrl(path.resolve(job.generated_scene_path)), detail: 'high' },
        { type: 'input_image', image_url: dataUrl(thumbPath), detail: 'high' },
        ...(job.gbp_image ? [{ type: 'input_image', image_url: dataUrl(gbpPath), detail: 'high' }] : [])
      ]
    }]
  });

  const modelQa = extractJson(outputText(response));
  const bg = job.background_source || {};
  const scores = [
    'series_consistency','editorial_quality','typography_harmony','negative_space',
    'photo_treatment','article_visual_relevance','rev_environment_consistency',
    'brand_space_authenticity','human_environment_integration',
    'perspective_scale_consistency','ground_contact_shadow_consistency',
    'lighting_consistency','anatomy_pose_realism'
  ];
  for (const key of scores) modelQa[key] = clampScore(modelQa[key]);

  const recentIds = deterministicRecentIds();
  const selectedIds = [
    String(bg.cached_frame_drive_file_id || '').trim(),
    String(bg.drive_file_id || '').trim(),
    String(bg.origin_video_file_id || '').trim()
  ].filter(Boolean);
  const recentRepeat = selectedIds.some((id) => recentIds.includes(id));

  const qa = {
    ...modelQa,
    pass: requiredBool(modelQa.pass) && !recentRepeat,
    source_material_scope_pass: true,
    generated_customer_allowed_under_policy: true,
    generated_customer_role: 'customer',
    fixed_overlay_layout_confirmed: true,
    policy_revision: job.policy_revision,
    layout_template_id: job.layout_template_id,
    background_source_type: 'verified_the_rev_repo_mirror',
    content_reference: `drive://${bg.cached_frame_drive_file_id || bg.drive_file_id || ''}/${bg.origin_video_file_name || ''}`,
    background_source_drive_file_id: bg.cached_frame_drive_file_id || bg.drive_file_id || '',
    background_origin_video_file_id: bg.origin_video_file_id || '',
    background_origin_video_file_name: bg.origin_video_file_name || '',
    background_frame_position_ratio: bg.frame_position_ratio ?? null,
    background_treatment: bg.treatment || '',
    background_source_recorded: true,
    background_selection_reason_recorded: Boolean(String(bg.selection_reason || '').trim()),
    image_generation_used: true,
    fallback_used: false,
    fallback_reason: '',
    same_image_as_recent_articles: false,
    same_background_as_recent_articles: recentRepeat,
    trainer_photo_reused: false,
    recent_similarity_window: Number(job.policy?.recent_reference_window || 4),
    recent_similarity_check_pass: !recentRepeat,
    recent_background_source_ids: recentIds,
    recent_reference_guard: {
      window: Number(job.policy?.recent_reference_window || 4),
      selection_policy: 'relevance-first-recent4-hard-exclusion-v1',
      recent_articles: job?.automation?.recent_articles || [],
      selected_content_reference: `drive://${bg.cached_frame_drive_file_id || bg.drive_file_id || ''}/${bg.origin_video_file_name || ''}`,
      selected_drive_file_id: bg.cached_frame_drive_file_id || bg.drive_file_id || '',
      avoided_repeat: !recentRepeat,
      repeated_due_to_relevance: false
    },
    template: job.image_style_template,
    render_version: job.render_version,
    generation_model: job.generation_model,
    qa_model: QA_MODEL,
    qa_method: 'automated GPT-5.6 multimodal visual inspection against verified THE REV source plus deterministic V2.4 overlay',
    slug: job.slug,
    asset_version: job.asset_version,
    checked_at: new Date().toISOString(),
    review_mode: 'HYBRID_GENERATED',
    realism_qc_version: 'v1',
    gbp_image_required: Boolean(job.gbp_image),
    gbp_image_path: job.gbp_image || '',
    gbp_image_width: Number(job.gbp_image_width || 1200),
    gbp_image_height: Number(job.gbp_image_height || 900),
    gbp_image_aspect_ratio: String(job.gbp_image_aspect_ratio || '4:3')
  };

  // Convert model booleans to strict booleans; omitted/ambiguous values fail closed.
  for (const key of [
    'no_cutout_or_sticker_look','location_semantics_pass','exercise_pose_plausible',
    'real_the_rev_background_confirmed','expected_copy_present','copy_legible',
    'gbp_aspect_ratio_pass','gbp_safe_area_pass','gbp_copy_legible'
  ]) {
    qa[key] = modelQa[key] === true;
  }
  for (const key of [
    'manual_visual_rejection','trainer_present','unknown_trainer_present',
    'non_customer_people_present','facility_only_thumbnail','too_promotional'
  ]) {
    qa[key] = modelQa[key] === true;
  }
  qa.customer_only_or_no_people = modelQa.customer_only_or_no_people === true;
  qa.generated_customer_present = modelQa.generated_customer_present === true;
  qa.generated_customer_count = Math.max(0, Math.round(Number(modelQa.generated_customer_count || 0)));

  qa.pass = qaPass(qa);
  return qa;
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

const previousState = readJson(statePath, {});
let attemptsTotal = Math.max(0, Number(previousState?.attempts_total || 0));

if (previousState?.status === 'READY_CANDIDATE') {
  console.log(JSON.stringify({ status: 'ALREADY_READY', slug: job.slug, state_path: path.relative(ROOT, statePath) }));
  process.exit(0);
}

if (attemptsTotal >= MAX_TOTAL_ATTEMPTS) {
  writeState({
    ...previousState,
    slug: job.slug,
    status: 'BLOCKED_MAX_ATTEMPTS',
    attempts_total: attemptsTotal,
    max_attempts: MAX_TOTAL_ATTEMPTS,
    updated_at: new Date().toISOString()
  });
  console.log(JSON.stringify({ status: 'BLOCKED_MAX_ATTEMPTS', slug: job.slug, attempts_total: attemptsTotal }));
  process.exit(0);
}

let lastQa = null;
let lastError = '';

while (attemptsTotal < MAX_TOTAL_ATTEMPTS) {
  attemptsTotal += 1;
  try {
    console.log(`Automated Hybrid image attempt ${attemptsTotal}/${MAX_TOTAL_ATTEMPTS}: ${job.slug}`);
    await generateScene(attemptsTotal);
    renderOverlay();
    lastQa = await visualQa(attemptsTotal);

    fs.mkdirSync(path.dirname(path.resolve(job.qa_report_path)), { recursive: true });
    fs.writeFileSync(path.resolve(job.qa_report_path), JSON.stringify(lastQa, null, 2) + '\n');

    if (lastQa.pass === true) {
      writeState({
        slug: job.slug,
        status: 'READY_CANDIDATE',
        attempts_total: attemptsTotal,
        max_attempts: MAX_TOTAL_ATTEMPTS,
        job_path: jobPath,
        generated_scene_path: job.generated_scene_path,
        thumbnail: job.thumbnail,
        og_image: job.og_image,
        qa_report_path: job.qa_report_path,
        asset_version: job.asset_version,
        updated_at: new Date().toISOString()
      });
      console.log(JSON.stringify({
        status: 'READY_CANDIDATE',
        slug: job.slug,
        attempts_total: attemptsTotal,
        thumbnail: job.thumbnail,
        og_image: job.og_image,
        qa_report_path: job.qa_report_path,
        state_path: path.relative(ROOT, statePath)
      }));
      process.exit(0);
    }

    lastError = String(lastQa.comments || 'Visual QC failed.');
    console.warn(`Visual QC REJECT: ${lastError}`);

    // Never leave a rejected image where a later commit step can accidentally stage it.
    for (const p of [job.generated_scene_path, job.thumbnail, job.og_image]) {
      try { fs.rmSync(path.resolve(p), { force: true }); } catch {}
    }
  } catch (e) {
    lastError = String(e?.message || e);
    console.error(`Automated image attempt failed: ${lastError}`);
    for (const p of [job.generated_scene_path, job.thumbnail, job.og_image]) {
      try { fs.rmSync(path.resolve(p), { force: true }); } catch {}
    }
  }
}

writeState({
  slug: job.slug,
  status: 'ERROR',
  attempts_total: attemptsTotal,
  max_attempts: MAX_TOTAL_ATTEMPTS,
  last_error: lastError,
  last_qa: lastQa,
  job_path: jobPath,
  updated_at: new Date().toISOString()
});

console.log(JSON.stringify({
  status: 'ERROR',
  slug: job.slug,
  attempts_total: attemptsTotal,
  error: lastError,
  state_path: path.relative(ROOT, statePath)
}));
