import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMaterialChange } from '../lib/companyTimelineGithubCollector.mjs';

test('ignores generated editorial asset commits',()=>{
  assert.equal(classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'Generate Editorial Hybrid image assets',
    files:[{filename:'assets/images/foo.jpg'}]
  }).material,false);
});

test('ignores article publish because Editorial Timeline owns it',()=>{
  assert.equal(classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'Publish blog: sample',
    files:[{filename:'content/blog/sample.md'}]
  }).material,false);
});

test('captures public site release',()=>{
  const r=classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'Release improved access page',
    files:[{filename:'access.html'}]
  });
  assert.equal(r.material,true);
  assert.equal(r.eventType,'WEBSITE_CHANGE');
});

test('captures Company OS milestone',()=>{
  const r=classifyMaterialChange({
    repo:'maxi001maxi/the-rev-ops',
    message:'Company OS Phase 5 complete',
    files:[{filename:'docs/company-os/PHASE5_ACCEPTANCE.md'}]
  });
  assert.equal(r.material,true);
  assert.equal(r.eventType,'MILESTONE');
});

test('ignores generic docs-only noise',()=>{
  const r=classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'docs: update README',
    files:[{filename:'README.md'}]
  });
  assert.equal(r.material,false);
});
