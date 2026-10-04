import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectorDailyPlan } from './daily-editorial-connector-plan.mjs';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const settings = { daily_editorial_enabled: true, daily_editorial_lead_days: 1,
  daily_editorial_cadence: 'BUSINESS_DAYS', daily_editorial_days: 'TU,WE,TH,SA,SU' };
const row = { content_id: 'BLOG-20261004-existing', run_date: '2026/10/03',
  target_date: '2026/10/04', queue_status: 'IMAGE_PREPARING',
  updated_at: '2026/10/03 22:00' };
test('Sunday closed-target decision retains unfinished Sunday work', () => {
  const r = connectorDailyPlan({ rows: [row], shortlist: [], settings, now: '2026-10-04T05:00:00+09:00' });
  assert.equal(r.plan.target_date, '2026-10-05');
  assert.equal(r.creation.status, 'NOT_REQUIRED');
  assert.equal(r.creation.reason, 'CLOSED_DAY');
  assert.equal(r.plan.existing_work[0].next_action, 'POLL_IMAGE');
  assert.equal(r.plan.invariants.auto_publish, false);
});
test('same target with a different run_date is not duplicated', () => {
  const r = connectorDailyPlan({ rows: [row], shortlist: [], settings, now: '2026-10-03T05:00:00+09:00' });
  assert.equal(r.creation.reason, 'ALREADY_SCHEDULED_TODAY');
});
test('only verified publication reconciles and frees the active queue', () => {
  const evidence = { publish_status: 'PUBLISH_COMMITTED', published_url: 'https://therev-lab.com/blog/example/' };
  const input = { rows: [{ ...row, queue_status: 'REVIEW_READY' }], shortlist: [], settings,
    now: '2026-10-04T05:00:00+09:00', evidenceByContentId: { [row.content_id]: evidence } };
  assert.equal(connectorDailyPlan(input).plan.reconciliation.patches.length, 0);
  evidence.publish_status = 'PUBLISHED';
  evidence.publish_verified_at = '2026-10-03T12:00:00Z';
  const r = connectorDailyPlan(input);
  assert.equal(r.plan.reconciliation.patches[0].queue_status, 'PUBLISHED');
  assert.equal(r.plan.active.count, 0);
});
test('missing inputs fail closed rather than making an independent decision', () => {
  assert.throws(() => connectorDailyPlan({ rows: [], now: '2026-10-04' }), /arrays/);
  assert.throws(() => connectorDailyPlan({ rows: [], shortlist: [], now: 'bad' }), /timestamp/);
});
test('the documented connector download set starts in an empty directory without installed dependencies', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const runbook = readFileSync(join(root, 'editorial/DAILY_CREATOR_RUNBOOK.md'), 'utf8');
  const files = ['scripts/daily-editorial-connector-plan.mjs', 'lib/dailyEditorialCreator.mjs',
    'lib/editorialReadiness.mjs', 'lib/editorialScenePlausibility.mjs', 'lib/editorialArticleOverlap.mjs', 'lib/dailyEditorialStateMachine.mjs', 'lib/dailyEditorialKnowledge.mjs',
    'lib/editorialPublication.mjs', 'lib/blogMarkdown.mjs'];
  const isolated = mkdtempSync(join(tmpdir(), 'rev-connector-plan-'));
  try {
    for (const file of files) {
      assert.ok(runbook.includes('`' + file + '`'), 'download is documented: ' + file);
      mkdirSync(dirname(join(isolated, file)), { recursive: true });
      copyFileSync(join(root, file), join(isolated, file));
    }
    const result = spawnSync(process.execPath, ['scripts/daily-editorial-connector-plan.mjs'], {
      cwd: isolated, input: JSON.stringify({ rows: [row], shortlist: [], settings,
        now: '2026-10-04T05:00:00+09:00' }), encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.creation.reason, 'CLOSED_DAY');
    assert.equal(plan.plan.existing_work[0].next_action, 'POLL_IMAGE');
  } finally { rmSync(isolated, { recursive: true, force: true }); }
});
