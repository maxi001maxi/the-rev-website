import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HYBRID_IMAGE_FORMAT } from '../lib/editorialHybridImageFormat.mjs';
import { REV_COLUMN_REFERENCE_V2 } from '../lib/editorialImageStyle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(message);
}
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}
function assertTrue(value, message) {
  if (!value) fail(message);
}
function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(`${message}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

const manifestPath = 'editorial/editorial-image-system.json';
const manifest = readJson(manifestPath);

const required = [
  'AGENTS.md',
  'editorial/EDITORIAL_IMAGE_RUNBOOK.md',
  manifestPath,
  'editorial/REFERENCE_V23_HYBRID_FORMAT.md',
  'editorial/reference-v23-hybrid-format.json',
  'editorial/hybrid-image-request.template.json',
  'editorial/fixtures/hybrid-image-request.sample.json',
  'editorial/hybrid-image-jobs/_template.json',
  'scripts/compile-hybrid-image-job.mjs',
  'scripts/validate-hybrid-image-jobs.mjs',
  'lib/editorialHybridImageFormat.mjs',
  'lib/editorialImageStyle.mjs',
  '.github/workflows/phase-9-check.yml',
  '.github/workflows/deploy-xserver.yml'
];
for (const rel of required) assertTrue(exists(rel), `required image-system file missing: ${rel}`);

assertEqual(manifest.current_standard.format_id, HYBRID_IMAGE_FORMAT.id, 'manifest/current Hybrid format drift');
assertEqual(manifest.current_standard.code_contract, 'lib/editorialHybridImageFormat.mjs', 'manifest code contract drift');
assertEqual(manifest.source_policy.drive_root_folder_id, HYBRID_IMAGE_FORMAT.driveRootFolderId, 'manifest Drive root drift');
assertEqual(manifest.release_boundary, HYBRID_IMAGE_FORMAT.publishBoundary, 'manifest publish boundary drift');

assertEqual(manifest.output_contract.thumbnail.width, HYBRID_IMAGE_FORMAT.output.thumbnail.width, 'manifest thumbnail width drift');
assertEqual(manifest.output_contract.thumbnail.height, HYBRID_IMAGE_FORMAT.output.thumbnail.height, 'manifest thumbnail height drift');
assertEqual(manifest.output_contract.ogp.width, HYBRID_IMAGE_FORMAT.output.ogp.width, 'manifest OGP width drift');
assertEqual(manifest.output_contract.ogp.height, HYBRID_IMAGE_FORMAT.output.ogp.height, 'manifest OGP height drift');

assertEqual(HYBRID_IMAGE_FORMAT.output.thumbnail.width, 1200, 'Hybrid thumbnail width must stay 1200');
assertEqual(HYBRID_IMAGE_FORMAT.output.thumbnail.height, 675, 'Hybrid thumbnail height must stay 675');
assertEqual(HYBRID_IMAGE_FORMAT.output.ogp.width, 1200, 'Hybrid OGP width must stay 1200');
assertEqual(HYBRID_IMAGE_FORMAT.output.ogp.height, 630, 'Hybrid OGP height must stay 630');

assertEqual(REV_COLUMN_REFERENCE_V2.thumb.width, 1200, 'source-lock thumbnail width must match site contract');
assertEqual(REV_COLUMN_REFERENCE_V2.thumb.height, 675, 'source-lock thumbnail height must match site contract');
assertEqual(REV_COLUMN_REFERENCE_V2.og.width, 1200, 'source-lock OGP width must stay 1200');
assertEqual(REV_COLUMN_REFERENCE_V2.og.height, 630, 'source-lock OGP height must stay 630');

assertEqual(
  JSON.stringify(manifest.design_reference_assets),
  JSON.stringify(HYBRID_IMAGE_FORMAT.designReferenceAssets),
  'manifest Design Reference drift'
);
for (const rel of HYBRID_IMAGE_FORMAT.designReferenceAssets) {
  assertTrue(exists(rel), `Design Reference asset missing: ${rel}`);
}

const packageJson = readJson('package.json');
assertTrue(packageJson.scripts?.['image:compile-job'], 'package script image:compile-job missing');
assertTrue(packageJson.scripts?.['test:editorial-images'], 'package script test:editorial-images missing');

const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/phase-9-check.yml'), 'utf8');
assertTrue(workflow.includes('npm run test:editorial-images'), 'Phase 9 CI must run canonical editorial image test');

const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'BLOG_README.md'), 'utf8');
assertTrue(agents.includes('editorial/EDITORIAL_IMAGE_RUNBOOK.md'), 'AGENTS.md must point to Editorial Image Runbook');
assertTrue(readme.includes('editorial/EDITORIAL_IMAGE_RUNBOOK.md'), 'BLOG_README must point to Editorial Image Runbook');

const compileSmoke = spawnSync(
  process.execPath,
  ['scripts/compile-hybrid-image-job.mjs', 'editorial/fixtures/hybrid-image-request.sample.json', '--stdout'],
  { cwd: ROOT, encoding: 'utf8' }
);
if (compileSmoke.status !== 0) {
  process.stderr.write(compileSmoke.stderr || '');
  fail('Hybrid Job compiler smoke test failed.');
}
let compiledFixture;
try {
  compiledFixture = JSON.parse(compileSmoke.stdout);
} catch {
  fail('Hybrid Job compiler did not emit valid JSON in --stdout mode.');
}
assertEqual(compiledFixture.render_version, HYBRID_IMAGE_FORMAT.id, 'compiled fixture render_version drift');
assertEqual(compiledFixture.image_strategy, HYBRID_IMAGE_FORMAT.strategy, 'compiled fixture image_strategy drift');
assertEqual(compiledFixture.publish_requires_human_approval, true, 'compiled fixture lost human publish gate');
assertTrue(compiledFixture.thumbnail.endsWith('-reference-v23-hybrid-fixture-50.jpg'), 'compiled fixture thumbnail path is not versioned');
assertTrue(compiledFixture.background_source?.selection_reason === 'compiler contract test fixture', 'compiled fixture lost source selection rationale');

const child = spawnSync(process.execPath, ['scripts/validate-hybrid-image-jobs.mjs'], {
  cwd: ROOT,
  stdio: 'inherit'
});
if (child.status !== 0) fail('Hybrid Job validator failed.');

console.log('Editorial image system validation: PASS');
console.log(`- standard: ${HYBRID_IMAGE_FORMAT.id}`);
console.log(`- hybrid thumbnail: ${HYBRID_IMAGE_FORMAT.output.thumbnail.width}x${HYBRID_IMAGE_FORMAT.output.thumbnail.height}`);
console.log(`- fallback thumbnail: ${REV_COLUMN_REFERENCE_V2.thumb.width}x${REV_COLUMN_REFERENCE_V2.thumb.height}`);
console.log(`- publish boundary: ${HYBRID_IMAGE_FORMAT.publishBoundary}`);
