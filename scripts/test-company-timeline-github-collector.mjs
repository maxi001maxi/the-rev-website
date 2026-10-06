import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMaterialChange } from '../lib/companyTimelineGithubCollector.mjs';

test('ignores generated editorial asset commits',()=>{
  assert.equal(classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'Generate Editorial Hybrid image assets',
    files:[{filename:'assets/images/blog/foo.jpg'}]
  }).material,false);
});

test('ignores article publish because Editorial Timeline owns it',()=>{
  assert.equal(classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'Publish blog: sample',
    files:[{filename:'content/blog/sample.md'}]
  }).material,false);
});

test('ignores one-off hybrid image job repair',()=>{
  assert.equal(classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'Repair DENBA GBP face protection and complete short headline',
    files:[{filename:'editorial/hybrid-image-jobs/denba.json'}]
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

test('captures Metricool Social Director integration',()=>{
  const r=classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'Social Director: use Metricool-synced canonical history',
    files:[{filename:'editorial/gas/SocialDirector_v0.5_ONE_PASTE.gs'}]
  });
  assert.equal(r.material,true);
  assert.equal(r.domain,'social');
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

test('ignores ordinary internal editorial repair',()=>{
  const r=classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'Editorial: self-heal Supervisor QC-stage crashes',
    files:[
      {filename:'editorial/gas/DailyEditorialSupervisorRecovery_v0.7.1.gs'},
      {filename:'scripts/test-supervisor-qc-recovery.mjs'}
    ]
  });
  assert.equal(r.material,false);
});

test('ignores generic docs-only noise',()=>{
  const r=classifyMaterialChange({
    repo:'maxi001maxi/the-rev-website',
    message:'docs: update README',
    files:[{filename:'README.md'}]
  });
  assert.equal(r.material,false);
});
