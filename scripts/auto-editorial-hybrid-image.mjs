import { SCENE_PLAUSIBILITY_VERSION, SCENE_PLAUSIBILITY_GUIDANCE, scenePlausibilityPass } from '../lib/editorialScenePlausibility.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { THUMBNAIL_TYPOGRAPHY_REVISION, TYPOGRAPHY_VISUAL_CHECKS, ART_DIRECTION_CHECKS,
  GOLDEN_REFERENCE_REVISION, GOLDEN_REFERENCE_ASSETS, typographyAcceptancePass } from '../lib/editorialThumbnailTypography.mjs';
import { execFileSync } from 'node:child_process';
import { retainSceneForOverlay, operatorStateMatchesAsset } from '../lib/editorialImageOperatorRecovery.mjs';
import { SCENE_GROUNDING_VERSION, SCENE_ONTOLOGY, planGroundedScene, groundedSceneBrief, evaluateSceneGrounding, sceneGroundingPass } from '../lib/editorialSceneGrounding.mjs';

const jobPath = process.argv[2];
if (!jobPath) {
  throw new Error('Usage: node scripts/auto-editorial-hybrid-image.mjs <hybrid-job.json>');
}

const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const GENERATION_MODEL = String(process.env.EDITORIAL_IMAGE_GENERATION_MODEL || 'gpt-5.6').trim();
const QA_MODEL = String(process.env.EDITORIAL_IMAGE_QA_MODEL || 'gpt-5.6').trim();
const MAX_TOTAL_ATTEMPTS = Math.max(
  1,
  Math.min(2, Number(job?.max_generation_attempts || process.env.EDITORIAL_IMAGE_MAX_ATTEMPTS || 2))
);

if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');

const ROOT = process.cwd();
const sourcePath = String(job?.automation?.source_repo_path || '').trim();
if (!sourcePath || !fs.existsSync(sourcePath)) {
  throw new Error(`Verified THE REV source is missing: ${sourcePath || '(empty)'}`);
}

for (const p of job.style_references || []) {
  if (!fs.existsSync(p)) throw new Error(`Style reference is missing: ${p}`);
}

const registry = JSON.parse(fs.readFileSync('editorial/automated-image-sources.json','utf8'));
const canonicalSource = registry.sources.find(s => s.source_id===job.automation?.selected_source_id && s.repo_path===sourcePath && s.drive_file_id===(job.background_source?.drive_file_id || job.background_source?.cached_frame_drive_file_id));
const hashFile = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if (!canonicalSource?.scene_inventory || hashFile(sourcePath)!==canonicalSource.scene_inventory.source_sha256) throw new Error('Canonical source inventory/bytes mismatch');
job.source_scene_inventory = canonicalSource.scene_inventory;
job.scene_grounding_version = SCENE_GROUNDING_VERSION;
job.scene_plan ||= planGroundedScene({title:job.article_title},canonicalSource,job.automation?.recent_semantic_articles || []);
if (job.scene_plan.source_sha256!==hashFile(sourcePath)) throw new Error('Scene plan source bytes mismatch');
// A legacy free-text intent cannot override canonical location/action limits.
job.scene_intent = groundedSceneBrief(job.scene_plan,job.source_scene_inventory);
fs.writeFileSync(jobPath,JSON.stringify(job,null,2)+'\n');

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

function generationPrompt(attempt, previousQa = null) {
  const sourceNote = String(job.background_source?.selection_reason || '');
  const treatment = String(job.background_source?.treatment || '');
  const visualClaim = String(job.visual_claim || '').trim();
  const compositionHint = String(job.composition_hint || '').trim();
  const thumbnailClaim = String(job.thumbnail_claim || '').trim();
  const visibleAction = String(job.visible_action || '').trim();
  const emotionalState = String(job.emotional_state || '').trim();
  const humanFirstLayout = String(job.layout_variant || '') === 'human-first-v1';
  const impactLayout = String(job.layout_variant || '') === 'impact-v1';
  const layoutNotes = humanFirstLayout
    ? [
        '- HUMAN FIRST V1: the customer is the visual hero. Aim for roughly 60-70% of visual attention to come from the person, face, expression and article-specific action.',
        '- Prefer a medium / medium-wide editorial portrait rather than a distant full-room composition. The face and action must remain readable at small blog-card size.',
        '- Keep THE REV. identifiable through one or two authentic anchors such as the wall logo, reception geometry, characteristic machine/rack or material palette, but make the background clearly secondary.',
        '- Use natural shallow depth of field / soft background blur. Do NOT render every background detail razor-sharp; small spatial differences should recede rather than become the subject.',
        '- The person should be sharp and believable, while THE REV. remains recognizable but visually quieter.',
        '- Thumbnail/OGP use a wide photo field with the deterministic ivory text overlay entering from the left. Keep the customer mostly in the center-right safe area.'
      ]
    : impactLayout
      ? [
        '- IMPACT V1: Thumbnail/OGP devote roughly 62% of the canvas to the photographic scene, with a soft ivory editorial veil entering from the left.',
        '- Keep the customer and article-specific action in the center-right safe area, but also preserve enough recognizable THE REV. equipment and architecture to make the facility identity obvious.',
        '- Do not compose for a tiny right-hand photo panel. The photograph is the visual majority and must remain interesting after the left typography overlay is applied.',
        '- For this layout, a clearly readable facility anchor plus a meaningful customer action is preferred over large empty floor/wall areas.'
      ]
    : [
        '- LEGACY V2.4: The deterministic renderer places this generated scene into the RIGHT half of the final card using object-fit: cover and object-position: center.',
        '- Thumbnail/OGP use a right-side crop, while GBP 4:3 uses the full generated scene underneath a left editorial veil.'
      ];
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
    thumbnailClaim ? `- Thumbnail claim: ${thumbnailClaim}` : '',
    visibleAction ? `- Visible action that must communicate the claim: ${visibleAction}` : '',
    emotionalState ? `- Emotional state that must be readable: ${emotionalState}` : '',
    visualClaim ? `- Concrete visual claim to express in the photograph: ${visualClaim}` : '',
    compositionHint ? `- Composition override for this article: ${compositionHint}` : '',
    '- Generate exactly ONE adult customer. No second person, no crowd, no staff in the background.',
    `- Planned customer presentation: ${String(job.customer_presentation || 'adult customer')}. Render an adult ${job.customer_presentation === 'male' ? 'man' : job.customer_presentation === 'female' ? 'woman' : 'customer'} without turning the scene into a stereotype.`,
    '- The person must clearly read as a customer, never a trainer, coach, employee, doctor or staff member.',
    '- Make the face, expression and body language legible. The emotional cue must support the article rather than being a generic stock-photo smile.',
    '- Natural neutral training clothes. No logos or readable text.',
    '- Make the person physically integrated into the room: correct scale, perspective, floor contact, contact shadow, lighting direction and color temperature.',
    SCENE_PLAUSIBILITY_GUIDANCE,
    '- Keep an article-relevant reader situation; do not invent equipment or services to illustrate a main claim.',
    '- When the article is about movement quality, strength progress, exercise execution, or training technique, show a clearly relevant training action with believable form rather than a generic preparation/rest pose.',
    '- Avoid difficult full-body exercise poses unless they are completely plausible. Prefer lower-complexity article-specific actions over visually impressive but semantically weak poses.',
    '- No pasted/cutout/sticker look.',
    '',
    'COMPOSITION:',
    '- Landscape editorial photography suitable for a 16:9 card.',
    ...layoutNotes,
    "- Compose ONE scene that survives both the 16:9 Thumbnail/OGP treatment and the GBP 4:3 full-scene layout.",
    "- Default composition only: when no article-specific composition override is supplied, place the customer's visual center around 58%–68% of the generated image width and keep the face/action inside roughly the 44%–84% horizontal band.",
    '- When an article-specific composition override is supplied, follow it instead of the default band while keeping the full meaningful action readable in both the right-panel crop and the GBP 4:3 full-scene layout.',
    '- Do not place the customer at the extreme right edge. The complete training action must remain readable after both the right-panel crop and the 4:3 full-scene layout.',
    '- Keep comfortable margins around the customer. Do not rely on details in the outer left/right 12% of the generated image.',
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
    attempt > 1 ? `This is the final allowed retry (${attempt}/2). Correct the prior rejection without changing the article claim.` : '',
    attempt > 1 && previousQa?.comments ? `Previous Visual QC rejection: ${String(previousQa.comments).slice(0, 600)}` : ''
  ].filter(Boolean).join('\n');
}

async function generateScene(attempt, previousQa = null) {
  const content = [
    { type: 'input_text', text: generationPrompt(attempt, previousQa) },
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
  try { execFileSync(
    process.execPath,
    ['scripts/render-hybrid-editorial-overlay.mjs', jobPath],
    { stdio: 'inherit', env: process.env }
  ); } catch (cause) {
    const error = new Error('Thumbnail Typography FAIL: deterministic overlay rejected the layout.', { cause });
    error.code = 'THUMBNAIL_TYPOGRAPHY_FAILED';
    throw error;
  }
}

function requiredBool(value) {
  return value === true;
}

function isProviderCreditBlock(error) {
  const s = String(error?.message || error || '');
  return /HTTP\s*429/i.test(s) && /no credits remaining|add credits|billing/i.test(s);
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
  if (!sceneGroundingPass(qa)) return false;
  const humanFirstRequired = String(job.layout_variant || '') === 'human-first-v1';
  const humanFirstPass = !humanFirstRequired || (
    Number(qa.human_subject_prominence || 0) >= 8 &&
    Number(qa.human_visual_attention_share || 0) >= 58 &&
    Number(qa.human_visual_attention_share || 0) <= 75 &&
    qa.face_expression_readable === true &&
    qa.background_secondary_pass === true &&
    qa.background_soft_blur_pass === true &&
    qa.the_rev_anchor_visible === true &&
    qa.customer_presentation_matches_plan === true &&
    Number(qa.generated_customer_count) === 1
  );
  return (
    typographyAcceptancePass(qa) &&
    humanFirstPass &&
    qa.pass === true &&
    qa.series_consistency >= 8 &&
    qa.editorial_quality >= 8 &&
    qa.typography_harmony >= 8 &&
    qa.negative_space >= 8 &&
    qa.photo_treatment >= 8 &&
    qa.article_visual_relevance >= 8 &&
    (qa.scene_plausibility_version === SCENE_PLAUSIBILITY_VERSION
      ? scenePlausibilityPass(qa)
      : qa.main_claim_visualization >= 8 && qa.article_theme_inferable_without_title === true) &&
    qa.scene_action_has_article_specific_meaning === true &&
    qa.generic_passive_pose_without_article_reason === false &&
    qa.rev_environment_consistency >= 8 &&
    qa.brand_space_authenticity >= 8 &&
    qa.human_environment_integration >= 8 &&
    qa.perspective_scale_consistency >= 8 &&
    qa.ground_contact_shadow_consistency >= 8 &&
    qa.lighting_consistency >= 8 &&
    qa.anatomy_pose_realism >= 8 &&
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
    Number(qa.generated_customer_count) === 1 &&
    qa.facility_only_thumbnail === false &&
    qa.fixed_overlay_layout_confirmed === true &&
    qa.real_the_rev_background_confirmed === true &&
    qa.background_source_recorded === true &&
    qa.background_selection_reason_recorded === true &&
    qa.image_generation_used === true &&
    qa.fallback_used === false &&
    qa.recent_similarity_check_pass === true &&
    qa.same_image_as_recent_articles === false &&
    (
      qa.same_background_as_recent_articles === false ||
      qa.background_reuse_relevance_exception === true
    ) &&
    qa.trainer_photo_reused === false &&
    qa.expected_copy_present === true &&
    qa.copy_legible === true &&
    qa.headline_line_break_quality === true &&
    Number(qa.headline_balance_score || 0) >= 8 &&
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
  const groundingEvidence = await inspectSceneGrounding();
  const thumbPath = path.resolve(job.thumbnail);
  const gbpPath = job.gbp_image ? path.resolve(job.gbp_image) : '';
  const typography = readJson(`${thumbPath}.typography.json`);
  if (typography?.revision !== THUMBNAIL_TYPOGRAPHY_REVISION || typography?.pass !== true ||
      typography.slug !== job.slug || typography.asset_version !== job.asset_version) {
    throw new Error('Thumbnail Typography FAIL: missing/current-set measurement evidence.');
  }
  const typographyImages = [];
  const goldenImages = [];
  const lock = readJson('editorial/typography-golden-reference/lock.json');
  if (lock?.revision !== GOLDEN_REFERENCE_REVISION) throw new Error('Thumbnail Typography FAIL: golden reference lock missing.');
  for (const ref of GOLDEN_REFERENCE_ASSETS) {
    const hash = createHash('sha256').update(fs.readFileSync(ref.path)).digest('hex');
    if (hash !== ref.sha256 || !lock.assets?.some((r) => r.path === ref.path && r.sha256 === hash)) {
      throw new Error('Thumbnail Typography FAIL: approved golden reference bytes changed.');
    }
    goldenImages.push({ type: 'input_text', text: `APPROVED GOLDEN TYPOGRAPHY REFERENCE: ${ref.variant}. Reference typography grammar ONLY; do not replace the real source environment or generated scene.` });
    goldenImages.push({ type: 'input_image', image_url: dataUrl(path.resolve(ref.path)), detail: 'high' });
  }
  for (const [variant, file] of [['thumbnail', job.thumbnail], ['og', job.og_image], ['gbp', job.gbp_image]]) {
    const metric = typography.variants?.[variant];
    const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    if (!file || metric?.asset_path !== file || hash(file) !== metric.asset_sha256) {
      throw new Error(`Thumbnail Typography FAIL: stale ${variant} evidence.`);
    }
    typographyImages.push({ type: 'input_text', text: `${variant}: original, then actual 320px and 400px JPEG previews.` });
    typographyImages.push({ type: 'input_image', image_url: dataUrl(path.resolve(file)), detail: 'high' });
    for (const width of [320, 400]) {
      const preview = metric.previews?.[width];
      if (!preview?.path || hash(preview.path) !== preview.sha256) throw new Error(`Thumbnail Typography FAIL: stale ${variant} preview.`);
      typographyImages.push({ type: 'input_image', image_url: dataUrl(path.resolve(preview.path)), detail: 'high' });
    }
  }
  if (!fs.existsSync(thumbPath)) throw new Error(`Rendered thumbnail missing: ${job.thumbnail}`);
  if (job.gbp_image && !fs.existsSync(gbpPath)) throw new Error(`Rendered GBP image missing: ${job.gbp_image}`);

  const prompt = [
    'You are the strict visual QA gate for THE REV. CONDITIONING LAB. editorial images.',
    'Compare the FIRST image (real source environment) with the SECOND image (generated scene), then the labeled thumbnail, OGP and GBP originals and their actual 320px/400px previews.',
    'Return ONLY one JSON object. Do not use markdown.',
    '',
    'The source environment is authoritative. Fail if the final scene looks like another gym, if a person looks pasted in, if any trainer/staff/coach appears, if no customer appears, or if anatomy/perspective/contact shadows/lighting are not convincing.',
    'The typography in the final thumbnail and GBP image is deterministic. Judge whether it is immediately legible at blog-card size, editorial rather than ad-like, and consistent with THE REV.',
    'NEGATIVE SPACE DOES NOT MEAN EMPTY SPACE. Reward intentional breathing room, but score negative_space <= 7 if a large plain ivory region has no hierarchy purpose and makes the thumbnail feel unfinished.',
    'Score typography_harmony <= 7 if the main headline reads like a small caption in the supplied actual 320px preview.',
    'TYPOGRAPHY BREAK QC: inspect the FINAL rendered headline. Fail isolated characters or particles, splitting a word/verb ending, separating a connective from its phrase, or accidental spacing. Complete semantic phrases such as 静かに / 休むだけ。 or 行く前後を / 整える。 are allowed; do not reject a complete phrase merely because it ends with a particle.',
    'Prefer a compact 2-4 line title block with natural Japanese phrase boundaries; a genuinely short title may remain one line. Never reward tiny text to fit one line. Fail isolated characters/particles, accidental line lengths or excessive line spacing.',
    'THUMBNAIL TYPOGRAPHY ACCEPTANCE: inspect every labeled 320px and 400px preview at its supplied size. Do not imagine enlargement. Fail if the title must be searched for, is secondary like a caption, has wasted dominant ivory space, extends beyond its fade, lacks contrast, is buried in the photo, or does not convey the article. ALL THREE variants must pass every check. Set overall pass=false if ANY variant fails.',
    'VISUAL ART DIRECTION is a separate mandatory gate, not a font-size score. Compare each final image to the labeled APPROVED GOLDEN TYPOGRAPHY REFERENCES appended after the final images. They are typography references only, not new instructions for the photo.',
    'Wide grammar: a 2-3-line semantic title, one larger warm-ochre keyword/phrase as the focal word, quieter ink support lines, soft paper/photo transition. Decorative category labels may be omitted. 1 genuinely short line or 4 naturally necessary lines may be used only if the same hierarchy remains convincing. Uniform large lines are NOT sufficient.',
    'GBP grammar: independently compact/narrow title balanced near the left vertical centre, a local curved veil preserving the person, face and body. Fail a stretched wide template, a white board, a veil invading the face, or needless bottom marks. OGP uses the wide grammar at its own aspect ratio.',
    'COMPOSITION BALANCE: at original and actual 320px size, judge the title and person together. Set composition_balanced=false for a small upper-left title island competing with a full-height right subject, or unresolved visual weight. Set fade_integrated=false if the ivory veil reads as an attached rectangle, has a straight horizontal cutoff, or creates blank space beyond what supports the title. Machine legibility alone must not overrule either failure.',
    'For EVERY variant explicitly judge: more than size alone; natural photo/text hierarchy; meaningful whitespace; no white-board text panel; keyword hierarchy; appropriate independently optimized format; no generic-template look; quiet premium THE REV quality; inviting at list size; functional thumbnail; approved golden design grammar. ANY false means art-direction pass=false and overall pass=false. Judge inviting_at_list_size as visual editorial quality, not a claim about measured click-through performance.',
    'Score editorial_quality <= 7 if the result feels like a museum label, brochure placeholder, or generic template instead of a compelling article thumbnail.',
    'When layout_variant is impact-v1, the photograph should feel like the visual majority while the enlarged headline remains a clear second focal point. Premium restraint must come from hierarchy, not tiny type.',
    'HUMAN FIRST V1: fail if the room/equipment feels like the hero and the customer feels small. The customer should carry roughly 60-70% of visual attention, with face/expression/action readable at card size.',
    'HUMAN FIRST V1: the THE REV. background must remain recognizable through at least one authentic brand/location anchor, but it should be visually secondary with natural soft blur / shallow depth of field.',
    'HUMAN FIRST V1: do not reward hyper-detailed background reconstruction. If small spatial/layout discrepancies become visually prominent because the background is too sharp, background_secondary_pass or background_soft_blur_pass must be false.',
    'HUMAN FIRST V1: exactly one customer only. Any second person, crowd, trainer, staff member or ambiguous human figure fails.',
    SCENE_PLAUSIBILITY_GUIDANCE,
    'SEMANTIC RELEVANCE: assess a natural article-relevant reader situation, not a literal demonstration of the main claim. A customer thinking over a health report is a meaningful action.',
    'Do NOT award high article_visual_relevance simply because the image shows THE REV. or a gym customer. The ACTION itself must carry article-specific meaning.',
    'A quiet before/after moment may pass when its article-specific reason is visible; do not demand medical measurement or readable paper text.',
    'If the article is about movement quality, strength progress, execution, form, training intensity, or exercise technique, require an actual plausible training action that directly supports that claim.',
    'For list-style articles with several progress signs, a single photograph does NOT need to literally show every list item. Judge main_claim_visualization by whether the image strongly expresses the umbrella claim and at least one concrete article-specific example.',
    'For abstract planning, habit, recovery, or lifestyle articles, do not require the photograph to literally depict invisible concepts such as tomorrow, a schedule, intention, or future fatigue. When the job provides a Concrete visual claim, judge article relevance against that claim as the photograph-level embodiment of the article, while still requiring the action to be specific and meaningful rather than generic.',
    'For the GBP 4:3 image, the generated scene should remain visible across the full canvas under a left editorial veil. Fail if the customer/action becomes obscured by the left veil, cut at the right edge, or unreadable as an exercise.',
    'For non-exercise quiet scenes, exercise_pose_plausible should be true when the pose is naturally plausible for the intended activity.',
    '',
    'Required JSON fields:',
    '{',
    '  "pass": boolean,',
    `  "thumbnail_typography_visual": { ${['thumbnail', 'og', 'gbp'].map((v) => `"${v}": { "pass": boolean, ${TYPOGRAPHY_VISUAL_CHECKS.map((k) => `"${k}": boolean`).join(', ')} }`).join(', ')} },`,
    `  "visual_art_direction": { "pass": boolean, "variants": { ${['thumbnail', 'og', 'gbp'].map((v) => `"${v}": { "pass": boolean, ${ART_DIRECTION_CHECKS.map((k) => `"${k}": boolean`).join(', ')} }`).join(', ')} }, "comments": "Japanese explanation comparing the actual finals to the golden references" },`,
    '  "series_consistency": 0-10,',
    '  "editorial_quality": 0-10,',
    '  "typography_harmony": 0-10,',
    '  "negative_space": 0-10,',
    '  "photo_treatment": 0-10,',
    '  "article_visual_relevance": 0-10,',
    '  "main_claim_visualization": 0-10,',
    '  "human_subject_prominence": 0-10,',
    '  "human_visual_attention_share": 0-100,',
    '  "face_expression_readable": boolean,',
    '  "background_secondary_pass": boolean,',
    '  "background_soft_blur_pass": boolean,',
    '  "the_rev_anchor_visible": boolean,',
    '  "customer_presentation_matches_plan": boolean,',
    '  "article_theme_inferable_without_title": boolean,',
    '  "scene_action_has_article_specific_meaning": boolean,',
    '  "generic_passive_pose_without_article_reason": boolean,',
    '  "rev_environment_consistency": 0-10,',
    '  "brand_space_authenticity": 0-10,',
    '  "human_environment_integration": 0-10,',
    '  "perspective_scale_consistency": 0-10,',
    '  "ground_contact_shadow_consistency": 0-10,',
    '  "lighting_consistency": 0-10,',
    '  "anatomy_pose_realism": 0-10,',
    '  "no_cutout_or_sticker_look": boolean,',
    '  "location_semantics_pass": boolean,',
    '  "location_behavior_plausible": boolean,',
    '  "service_misrepresentation_absent": boolean,',
    '  "unsupported_equipment_absent": boolean,',
    '  "scene_plausible_at_the_rev": boolean,',
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
    '  "headline_line_break_quality": boolean,',
    '  "headline_balance_score": 0-10,',
    '  "too_promotional": boolean,',
    '  "gbp_aspect_ratio_pass": boolean,',
    '  "gbp_safe_area_pass": boolean,',
    '  "gbp_copy_legible": boolean,',
    '  "comments": "short Japanese explanation"',
    '}',
    '',
    `Article: ${job.article_title}`,
    `Scene intent: ${job.scene_intent}`,
    `Thumbnail claim: ${String(job.thumbnail_claim || '').trim()}`,
    `Required visible action: ${String(job.visible_action || '').trim()}`,
    `Required emotional state: ${String(job.emotional_state || '').trim()}`,
    `Concrete visual claim: ${String(job.visual_claim || '').trim()}`,
    `Expected copy: ${job.image_headline_short}`,
    `Planned customer presentation: ${String(job.customer_presentation || '')}`,
    `Design revision: ${String(job.design_revision || '')}`,
    `Layout variant: ${String(job.layout_variant || 'legacy-v24')}`,
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
        ...typographyImages,
        ...goldenImages
      ]
    }]
  });

  const modelQa = extractJson(outputText(response));
  const bg = job.background_source || {};
  const scores = [
    'series_consistency','editorial_quality','typography_harmony','headline_balance_score','negative_space',
    'photo_treatment','article_visual_relevance','main_claim_visualization','human_subject_prominence','rev_environment_consistency',
    'brand_space_authenticity','human_environment_integration',
    'perspective_scale_consistency','ground_contact_shadow_consistency',
    'lighting_consistency','anatomy_pose_realism'
  ];
  for (const key of scores) modelQa[key] = clampScore(modelQa[key]);
  modelQa.human_visual_attention_share = Math.max(0, Math.min(100, Math.round(Number(modelQa.human_visual_attention_share || 0))));

  const recentIds = deterministicRecentIds();
  const selectedIds = [
    String(bg.cached_frame_drive_file_id || '').trim(),
    String(bg.drive_file_id || '').trim(),
    String(bg.origin_video_file_id || '').trim()
  ].filter(Boolean);
  const recentRepeat = selectedIds.some((id) => recentIds.includes(id));
  const repeatedDueToRelevance =
    recentRepeat &&
    job?.automation?.repeated_due_to_relevance === true &&
    Number(job?.automation?.repeat_distance) >= 3 &&
    Array.isArray(job?.scene_plan?.required_equipment) &&
    job.scene_plan.required_equipment.length > 0;

  const qa = {
    ...modelQa,
    scene_grounding_version: SCENE_GROUNDING_VERSION,
    scene_grounding: groundingEvidence,
    scene_fingerprint: groundingEvidence.observation?.scene_fingerprint,
    scene_location_consistency: !groundingEvidence.errors.includes('scene_location_consistency'),
    equipment_source_grounding: !groundingEvidence.errors.some(e=>e.includes('unsupported_equipment')),
    spatial_plausibility: !groundingEvidence.errors.includes('spatial_plausibility'),
    action_location_consistency: !groundingEvidence.errors.includes('action_location_consistency'),
    article_scene_match: !groundingEvidence.errors.some(e=>e.includes('article_scene_match')),
    recent_semantic_similarity: groundingEvidence.similarity,
    thumbnail_typography_revision: THUMBNAIL_TYPOGRAPHY_REVISION,
    thumbnail_typography_acceptance: {
      pass: ['thumbnail', 'og', 'gbp'].every((v) => modelQa.thumbnail_typography_visual?.[v]?.pass === true &&
        TYPOGRAPHY_VISUAL_CHECKS.every((k) => modelQa.thumbnail_typography_visual?.[v]?.[k] === true)) &&
        modelQa.visual_art_direction?.pass === true && ['thumbnail', 'og', 'gbp'].every((v) =>
          modelQa.visual_art_direction.variants?.[v]?.pass === true &&
          ART_DIRECTION_CHECKS.every((k) => modelQa.visual_art_direction.variants[v][k] === true)),
      deterministic: typography,
      visual: modelQa.thumbnail_typography_visual || {},
      art_direction: modelQa.visual_art_direction || {},
      golden_reference: { revision: GOLDEN_REFERENCE_REVISION, assets: GOLDEN_REFERENCE_ASSETS }
    },
    pass: requiredBool(modelQa.pass) && (!recentRepeat || repeatedDueToRelevance),
    source_material_scope_pass: true,
    generated_customer_allowed_under_policy: true,
    generated_customer_role: 'customer',
    customer_presentation: String(job.customer_presentation || ''),
    image_headline_short: String(job.image_headline_short || ''),
    fixed_overlay_layout_confirmed: true,
    policy_revision: job.policy_revision,
    layout_template_id: job.layout_template_id,
    design_revision: job.design_revision || '',
    layout_variant: job.layout_variant || 'legacy-v24',
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
    background_reuse_relevance_exception: repeatedDueToRelevance,
    recent_similarity_window: Number(job.policy?.recent_reference_window || 4),
    recent_similarity_check_pass: !recentRepeat || repeatedDueToRelevance,
    recent_background_source_ids: recentIds,
    recent_reference_guard: {
      window: Number(job.policy?.recent_reference_window || 4),
      selection_policy: 'relevance-first-recent4-hard-exclusion-v1',
      recent_articles: job?.automation?.recent_articles || [],
      selected_content_reference: `drive://${bg.cached_frame_drive_file_id || bg.drive_file_id || ''}/${bg.origin_video_file_name || ''}`,
      selected_drive_file_id: bg.cached_frame_drive_file_id || bg.drive_file_id || '',
      avoided_repeat: !recentRepeat,
      repeated_due_to_relevance: repeatedDueToRelevance,
      repeat_distance: repeatedDueToRelevance ? Number(job?.automation?.repeat_distance) : null,
      required_equipment: Array.isArray(job?.scene_plan?.required_equipment) ? job.scene_plan.required_equipment : []
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
    scene_plausibility_version: job.scene_plausibility_version || job.policy?.scene_plausibility_version || null,
    gbp_image_required: Boolean(job.gbp_image),
    gbp_image_path: job.gbp_image || '',
    gbp_image_width: Number(job.gbp_image_width || 1200),
    gbp_image_height: Number(job.gbp_image_height || 900),
    gbp_image_aspect_ratio: String(job.gbp_image_aspect_ratio || '4:3')
  };

  // Convert model booleans to strict booleans; omitted/ambiguous values fail closed.
  for (const key of [
    'location_behavior_plausible','service_misrepresentation_absent','unsupported_equipment_absent','scene_plausible_at_the_rev',
    'no_cutout_or_sticker_look','location_semantics_pass','exercise_pose_plausible',
    'real_the_rev_background_confirmed','expected_copy_present','copy_legible','headline_line_break_quality',
    'article_theme_inferable_without_title','scene_action_has_article_specific_meaning',
    'face_expression_readable','background_secondary_pass','background_soft_blur_pass',
    'the_rev_anchor_visible','customer_presentation_matches_plan',
    'gbp_aspect_ratio_pass','gbp_safe_area_pass','gbp_copy_legible'
  ]) {
    qa[key] = modelQa[key] === true;
  }
  for (const key of [
    'manual_visual_rejection','trainer_present','unknown_trainer_present',
    'non_customer_people_present','facility_only_thumbnail','too_promotional',
    'generic_passive_pose_without_article_reason'
  ]) {
    qa[key] = modelQa[key] === true;
  }
  qa.customer_only_or_no_people = modelQa.customer_only_or_no_people === true;
  qa.generated_customer_present = modelQa.generated_customer_present === true;
  qa.generated_customer_count = Math.max(0, Math.round(Number(modelQa.generated_customer_count || 0)));

  qa.pass = qaPass(qa);
  if (!groundingEvidence.pass) qa.comments = `Source/Scene FAIL: ${groundingEvidence.errors.join(', ')}. ${qa.comments || ''}`;
  return qa;
}

async function inspectSceneGrounding({job: inspectionJob = job,sourcePath: inspectionSource = sourcePath} = {}) {
  // Independent narrow observation call: do not feed prior PASS flags, style references,
  // generation prompt or desired high scores. Canonical comparison happens in code.
  const recent = inspectionJob.automation?.recent_semantic_articles || [];
  const content = [{type:'input_text',text:[
    'Observe the labeled real source and generated scene independently. Return JSON only.',
    'Do not vote PASS. Describe visible objects and their physical zones. A rack visible at the REAR of a source lobby does not support a new rack in its FOREGROUND.',
    `Use EXACT fingerprint vocabulary for both generated and recent images: ${JSON.stringify(SCENE_ONTOLOGY)}. Do not invent synonyms. If the actual image does not fit, mark complete=false, do not invent a matching label.`,
    'Equipment vocabulary: training_rack, cable_machine, barbell, weight_plates, training_bench, oxygen_room, denba_device, boxing_gloves, boxing_mitt, medical_device, unknown_equipment. A combined rack/cable unit can be listed as training_rack only. List every major equipment object. Do not list reception furniture, phone or paper as training equipment.',
    'Zones: reception, rear_training_area, training_area, boxing_area, recovery_area. In a lobby, the rack beyond the reception counter is rear_training_area; ANY new rack in the customer/foreground zone is reception.',
    'Location is the customer activity area, not a distant room. Record equipment_relocated=true if copied, enlarged or moved across floor/room zones compared to the source.',
    `Generated planned meaning (judge actual image against this, do not infer observation from plan): ${JSON.stringify(inspectionJob.scene_plan)}`,
    'Return {source:{complete:boolean,equipment:[{object,zone}]},generated:{complete:boolean,equipment:[{object,zone}],location_type,subject_zone,human_action,equipment_relocated:boolean,room_geometry_preserved:boolean,article_scene_match:boolean,scene_fingerprint:{scene_type,location_type,human_action,composition_type,visual_role,article_intent}},recent:[{slug,scene_fingerprint:{same six fields}}]}.',
    'Use plan vocabulary for actually matching actions only. rack_adjustment/cable_operation/strength_exercise cannot be renamed observing_real_equipment. Infer recent fingerprints from actual images and their supplied article titles/copies. Do not vary labels merely because person gender, clothes or file differ.',
    'Missing or obscured evidence: complete=false. Do not guess a safe answer.'
  ].join('\n')}, {type:'input_text',text:'REAL SOURCE'}, {type:'input_image',image_url:dataUrl(inspectionSource),detail:'high'},
    {type:'input_text',text:'GENERATED SCENE'}, {type:'input_image',image_url:dataUrl(inspectionJob.generated_scene_path),detail:'high'}];
  for(const r of recent) {
    if (!r.thumbnail || !fs.existsSync(r.thumbnail)) throw new Error(`Semantic history image missing: ${r.slug}`);
    content.push({type:'input_text',text:`RECENT ARTICLE ${r.slug}: ${r.imageHeadlineShort || ''}; title ${r.articleTitle || r.slug}`});
    content.push({type:'input_image',image_url:dataUrl(r.thumbnail),detail:'high'});
  }
  const response=await openaiResponse({model:QA_MODEL,input:[{role:'user',content}]});
  const observed=extractJson(outputText(response));
  const evaluatedHistory=recent.map(r=>({...r,scene_fingerprint:observed.recent?.find(x=>x.slug===r.slug)?.scene_fingerprint || r.sceneFingerprint}));
  const evidence=evaluateSceneGrounding({inventory:inspectionJob.source_scene_inventory,plan:inspectionJob.scene_plan,sourceRecognition:observed.source,observation:observed.generated,recent:evaluatedHistory});
  if (evaluatedHistory.some(r=>!r.scene_fingerprint)) {evidence.pass=false;evidence.errors.push('semantic_history_observation_missing');}
  return {...evidence,recent:evaluatedHistory,asset_version:inspectionJob.asset_version,
    asset_hashes:{source:hashFile(inspectionSource),scene:hashFile(inspectionJob.generated_scene_path),thumbnail:hashFile(inspectionJob.thumbnail),og:hashFile(inspectionJob.og_image),gbp:hashFile(inspectionJob.gbp_image)},
    observation_method:'independent multimodal inventory observation + deterministic canonical comparison'};
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify({ ...state, asset_version: job.asset_version }, null, 2) + '\n');
}

// Actual-image negative control, not just a synthetic metadata unit test.
if (job.slug === 'shinomiya-gym-beginner-choose' && String(job.asset_version).includes('grounded-')) {
  const fixture=readJson('editorial/fixtures/scene-grounding-r3-rejection.json');
  for (const [key,p] of [['source',fixture.evidence.source_path],['scene',fixture.evidence.scene_path]]) {
    if (hashFile(p)!==fixture.evidence[`${key}_sha256`]) throw new Error('r3 negative control fixture bytes changed');
  }
  const oldSource=registry.sources.find(s=>s.repo_path===fixture.evidence.source_path);
  const oldJob={...fixture.old_job,source_scene_inventory:oldSource.scene_inventory,
    scene_plan:planGroundedScene({title:fixture.old_job.article_title},oldSource),automation:{recent_semantic_articles:[]}};
  const negative=await inspectSceneGrounding({job:oldJob,sourcePath:fixture.evidence.source_path});
  const detected=negative.pass===false && negative.errors.some(e=>e==='generated_unsupported_equipment:training_rack@reception' || e==='generated_unsupported_equipment:cable_machine@reception');
  fs.writeFileSync('editorial/image-qa/scene-grounding-r3-negative-control.json',JSON.stringify({control_pass:detected,checked_at:new Date().toISOString(),evidence:negative},null,2)+'\n');
  if (!detected) throw new Error('Actual r3 negative control: observer did not detect invented foreground equipment');
}

const rawPreviousState = readJson(statePath, {});
const previousAssetVersion = String(rawPreviousState?.asset_version || '').trim();
const currentAssetVersion = String(job?.asset_version || '').trim();
const sameAssetVersion = operatorStateMatchesAsset(rawPreviousState, job, jobPath);

// Operator state belongs to an asset version, not merely to a slug.
// A newly versioned image is a fresh generation lifecycle and must never
// inherit attempts/backfill/rerender flags or Xserver verification from the
// previous image. Otherwise an approved old asset can block its replacement.
const previousState = sameAssetVersion ? rawPreviousState : {};
let attemptsTotal = sameAssetVersion
  ? Math.max(0, Number(previousState?.attempts_total || 0))
  : 0;

if (!sameAssetVersion && Object.keys(rawPreviousState || {}).length) {
  console.log(JSON.stringify({
    status: 'RESET_STATE_FOR_NEW_ASSET_VERSION',
    slug: job.slug,
    previous_asset_version: previousAssetVersion || null,
    current_asset_version: currentAssetVersion || null
  }));
}

const gbpRequested = Boolean(String(job.gbp_image || '').trim());
const gbpAlreadyExists = gbpRequested && fs.existsSync(path.resolve(job.gbp_image));
const forceGbpBackfill = previousState?.status === 'GBP_BACKFILL_REQUESTED';
const forceOverlayRerender = previousState?.status === 'OVERLAY_RERENDER_REQUESTED';
const needsGbpBackfill = gbpRequested && (
  forceGbpBackfill ||
  (previousState?.status === 'READY_CANDIDATE' && !gbpAlreadyExists)
);

if (previousState?.status === 'READY_CANDIDATE' && !needsGbpBackfill && !forceOverlayRerender) {
  console.log(JSON.stringify({ status: 'ALREADY_READY', slug: job.slug, state_path: path.relative(ROOT, statePath) }));
  process.exit(0);
}

let lastQa = previousState?.last_qa || null;
let lastError = '';

if (forceOverlayRerender) {
  try {
    if (!job.generated_scene_path || !fs.existsSync(path.resolve(job.generated_scene_path))) {
      throw new Error('Overlay rerender requires the existing approved generated scene.');
    }

    console.log(`Full deterministic overlay rerender from existing approved scene: ${job.slug}`);
    renderOverlay();
    lastQa = await visualQa(Math.max(1, attemptsTotal || 1));

    fs.mkdirSync(path.dirname(path.resolve(job.qa_report_path)), { recursive: true });
    fs.writeFileSync(path.resolve(job.qa_report_path), JSON.stringify(lastQa, null, 2) + '\n');

    if (lastQa.pass === true) {
      writeState({
        ...previousState,
        slug: job.slug,
        status: 'READY_CANDIDATE',
        attempts_total: attemptsTotal,
        max_attempts: MAX_TOTAL_ATTEMPTS,
        job_path: jobPath,
        generated_scene_path: job.generated_scene_path,
        thumbnail: job.thumbnail,
        og_image: job.og_image,
        gbp_image: job.gbp_image || null,
        qa_report_path: job.qa_report_path,
        asset_version: job.asset_version,
        xserver_verified: false,
        updated_at: new Date().toISOString()
      });
      console.log(JSON.stringify({
        status: 'READY_CANDIDATE',
        route: 'OVERLAY_RERENDER',
        slug: job.slug,
        asset_version: job.asset_version,
        thumbnail: job.thumbnail,
        og_image: job.og_image,
        gbp_image: job.gbp_image || null,
        qa_report_path: job.qa_report_path,
        state_path: path.relative(ROOT, statePath)
      }));
      process.exit(0);
    }

    lastError = String(lastQa.comments || 'Overlay Visual QC failed.');
    for (const p of [job.thumbnail, job.og_image, job.gbp_image].filter(Boolean)) {
      try { fs.rmSync(path.resolve(p), { force: true }); } catch {}
    }
  } catch (e) {
    lastError = String(e?.message || e);
    console.error(`Overlay rerender failed: ${lastError}`);
    for (const p of [job.thumbnail, job.og_image, job.gbp_image].filter(Boolean)) {
      try { fs.rmSync(path.resolve(p), { force: true }); } catch {}
    }
  }

  writeState({
    ...previousState,
    slug: job.slug,
    status: 'OVERLAY_QC_REJECTED',
    attempts_total: attemptsTotal,
    max_attempts: MAX_TOTAL_ATTEMPTS,
    last_error: lastError,
    job_path: jobPath,
    generated_scene_path: job.generated_scene_path,
    thumbnail: job.thumbnail,
    og_image: job.og_image,
    gbp_image: job.gbp_image || null,
    qa_report_path: job.qa_report_path,
    asset_version: job.asset_version,
    xserver_verified: false,
    updated_at: new Date().toISOString()
  });
  console.log(JSON.stringify({
    status: 'OVERLAY_QC_REJECTED',
    slug: job.slug,
    error: lastError,
    state_path: path.relative(ROOT, statePath)
  }));
  process.exit(0);
}

if (needsGbpBackfill) {
  let typographyBlocked = false;
  try {
    const requiredExisting = [job.generated_scene_path, job.thumbnail, job.og_image, job.qa_report_path];
    if (!requiredExisting.every((p) => p && fs.existsSync(path.resolve(p)))) {
      throw new Error('GBP backfill requires existing generated scene, Thumbnail, OGP and QA assets.');
    }
    console.log(`GBP 4:3 backfill from existing approved scene: ${job.slug}`);
    renderOverlay();
    lastQa = await visualQa(Math.max(1, attemptsTotal || 1));
    fs.writeFileSync(path.resolve(job.qa_report_path), JSON.stringify(lastQa, null, 2) + '\n');
    if (lastQa.pass === true) {
      writeState({
        ...previousState,
        slug: job.slug,
        status: 'READY_CANDIDATE',
        attempts_total: attemptsTotal,
        max_attempts: MAX_TOTAL_ATTEMPTS,
        job_path: jobPath,
        generated_scene_path: job.generated_scene_path,
        thumbnail: job.thumbnail,
        og_image: job.og_image,
        gbp_image: job.gbp_image,
        qa_report_path: job.qa_report_path,
        asset_version: job.asset_version,
        xserver_verified: false,
        updated_at: new Date().toISOString()
      });
      console.log(JSON.stringify({
        status: 'READY_CANDIDATE',
        route: 'GBP_BACKFILL',
        slug: job.slug,
        gbp_image: job.gbp_image,
        qa_report_path: job.qa_report_path,
        state_path: path.relative(ROOT, statePath)
      }));
      process.exit(0);
    }
    lastError = String(lastQa.comments || 'GBP Visual QC failed.');
    typographyBlocked = !typographyAcceptancePass(lastQa);
    try { fs.rmSync(path.resolve(job.gbp_image), { force: true }); } catch {}
  } catch (e) {
    lastError = String(e?.message || e);
    typographyBlocked = e.code === 'THUMBNAIL_TYPOGRAPHY_FAILED' || lastError.startsWith('Thumbnail Typography FAIL:');
    console.error(`GBP backfill failed: ${lastError}`);
    try { if (job.gbp_image) fs.rmSync(path.resolve(job.gbp_image), { force: true }); } catch {}
  }
  if (typographyBlocked) {
    writeState({ ...previousState, slug: job.slug, status: 'OVERLAY_QC_REJECTED',
      attempts_total: attemptsTotal, max_attempts: MAX_TOTAL_ATTEMPTS,
      last_error: lastError, job_path: jobPath, generated_scene_path: job.generated_scene_path,
      xserver_verified: false, updated_at: new Date().toISOString() });
    console.log(JSON.stringify({ status: 'OVERLAY_QC_REJECTED', slug: job.slug,
      error: lastError, state_path: path.relative(ROOT, statePath) }));
    process.exit(0);
  }
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

while (attemptsTotal < MAX_TOTAL_ATTEMPTS) {
  attemptsTotal += 1;
  try {
    console.log(`Automated Hybrid image attempt ${attemptsTotal}/${MAX_TOTAL_ATTEMPTS}: ${job.slug}`);
    await generateScene(attemptsTotal, lastQa);
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
        gbp_image: job.gbp_image || null,
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
        gbp_image: job.gbp_image || null,
        qa_report_path: job.qa_report_path,
        state_path: path.relative(ROOT, statePath)
      }));
      process.exit(0);
    }

    lastError = String(lastQa.comments || 'Visual QC failed.');
    console.warn(`Visual QC REJECT: ${lastError}`);
    // A typography-only failure must not spend another image-generation attempt.
    if (retainSceneForOverlay(lastQa, job)) {
      for (const file of [job.thumbnail, job.og_image, job.gbp_image].filter(Boolean)) {
        fs.rmSync(file, { force: true });
        for (const width of [320, 400]) fs.rmSync(file.replace(/\.jpg$/, `-preview-${width}.jpg`), { force: true });
      }
      fs.rmSync(`${job.thumbnail}.typography.json`, { force: true });
      break;
    }

    // Never leave a rejected image where a later commit step can accidentally stage it.
    for (const p of [job.generated_scene_path, job.thumbnail, job.og_image, job.gbp_image].filter(Boolean)) {
      try { fs.rmSync(path.resolve(p), { force: true }); } catch {}
    }
  } catch (e) {
    lastError = String(e?.message || e);

    if (isProviderCreditBlock(e)) {
      attemptsTotal = Math.max(0, attemptsTotal - 1);
      writeState({
        slug: job.slug,
        status: 'BLOCKED_PROVIDER_CREDITS',
        attempts_total: attemptsTotal,
        max_attempts: MAX_TOTAL_ATTEMPTS,
        last_error: lastError,
        job_path: jobPath,
        updated_at: new Date().toISOString()
      });
      console.warn(`Provider credits blocked generation without consuming a QC attempt: ${job.slug}`);
      console.log(JSON.stringify({
        status: 'BLOCKED_PROVIDER_CREDITS',
        slug: job.slug,
        attempts_total: attemptsTotal,
        error: lastError,
        state_path: path.relative(ROOT, statePath)
      }));
      process.exit(0);
    }

    console.error(`Automated image attempt failed: ${lastError}`);
    if (e.code === 'THUMBNAIL_TYPOGRAPHY_FAILED') break;
    for (const p of [job.generated_scene_path, job.thumbnail, job.og_image, job.gbp_image].filter(Boolean)) {
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
