import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(
  vercel?.git?.deploymentEnabled,
  false,
  'automatic Git deployments must remain disabled'
);

const previewQa = fs.readFileSync(
  new URL('../.github/workflows/preview-qa.yml', import.meta.url),
  'utf8'
);
assert.match(previewQa, /workflow_dispatch:/, 'Preview QA must be explicit/manual');
assert.doesNotMatch(
  previewQa,
  /^\s{2}push:\s*$/m,
  'Preview QA must not auto-run on Git push'
);
assert.match(previewQa, /base_url:/, 'Preview QA must require an explicit deployment URL');
assert.match(previewQa, /deployment_sha:/, 'Preview QA must bind the exact Git SHA');

const agents = fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
assert.match(
  agents,
  /VERCEL_RELEASE_POLICY_V1\.md/,
  'Agents must route Vercel release work to the canonical policy'
);

console.log('Vercel release policy static contract PASS');
