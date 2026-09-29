import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeDailyInput,
  sessionSummary,
  buildManagerAssessment,
  validBusinessDate,
  isBusinessDay
} from '../lib/dailyManager.mjs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('daily input keeps unknown distinct from zero',()=>{
  const input=normalizeDailyInput(null);
  assert.equal(input.planned_sessions,null);
  assert.equal(input.cancel_count,0);
  assert.equal(input.same_day_additions,0);
  assert.equal(sessionSummary(input).quality,'UNKNOWN');
});

test('actual sessions override estimate',()=>{
  const input=normalizeDailyInput({
    planned_sessions:5,cancel_count:2,same_day_additions:1,actual_sessions:3
  });
  assert.deepEqual(sessionSummary(input),{completed:3,quality:'MANUAL_ACTUAL'});
});

test('planned minus cancel plus additions gives estimate',()=>{
  const input=normalizeDailyInput({
    planned_sessions:5,cancel_count:1,same_day_additions:1,actual_sessions:null
  });
  assert.deepEqual(sessionSummary(input),{completed:5,quality:'ESTIMATED_FROM_INPUT'});
});

test('manager assessment never invents GYMs-connected sales',()=>{
  const result=buildManagerAssessment({
    planned_sessions:5,completed_sessions:4,cancel_count:1,
    web_sessions:12,high_intent_events:0,reserve_click:0,line_click:0,
    snapshot_status:'PRELIMINARY'
  });
  assert.match(result.manager_comment,/GYM’sが外部正本/);
  assert.ok(result.priorities.some((p)=>p.key==='finalize'));
  assert.ok(result.priorities.length<=3);
});

test('missing morning count becomes an action rather than zero',()=>{
  const result=buildManagerAssessment({
    planned_sessions:null,completed_sessions:null,cancel_count:0,
    web_sessions:2,high_intent_events:0,reserve_click:0,line_click:0,
    snapshot_status:'PRELIMINARY'
  });
  assert.match(result.manager_comment,/未入力/);
  assert.equal(result.priorities[0].key,'session_input');
});

test('THE REV business-day guard skips Monday and Friday',()=>{
  assert.equal(isBusinessDay(new Date('2026-09-29T10:00:00Z')),true);
  assert.equal(isBusinessDay(new Date('2026-09-28T10:00:00Z')),false);
  assert.equal(isBusinessDay(new Date('2026-10-02T10:00:00Z')),false);
});

test('business date validation is strict',()=>{
  assert.equal(validBusinessDate('2026-09-29'),true);
  assert.equal(validBusinessDate('2026/09/29'),false);
  assert.equal(validBusinessDate('today'),false);
});

test('cron reuses the Daily Manager function and waits for the CI preview gate',()=>{
  const api=read('api/admin/daily-manager.mjs');
  const config=JSON.parse(read('vercel.json'));
  assert.match(api,/CRON_SECRET/);
  assert.match(api,/Authorization|authorization/);
  assert.match(api,/isBusinessDay/);
  assert.equal(fs.existsSync(new URL('../api/daily-manager-cron.mjs',import.meta.url)),false);
  assert.deepEqual(config.crons,[{path:'/api/admin/daily-manager',schedule:'0 10 * * *'}]);
  assert.equal(config.git?.deploymentEnabled?.['feature/daily-manager-v1'],false);
});

test('admin surface is low-input and protected',()=>{
  const api=read('api/admin/daily-manager.mjs');
  const page=read('admin/daily-manager/index.html');
  const client=read('admin/js/admin-api.mjs');
  assert.match(api,/getAuthedContext/);
  assert.match(page,/予定セッション数/);
  assert.match(page,/日次締め済み → FINAL更新/);
  assert.match(client,/getDailyManager/);
  assert.match(client,/saveDailyManagerInput/);
  assert.match(client,/runDailyManager/);
});

test('schema keeps input and snapshots separate with RLS',()=>{
  const sql=read('supabase/migrations/20260929080934_daily_manager_v1.sql');
  assert.match(sql,/daily_manager_inputs/);
  assert.match(sql,/daily_manager_snapshots/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/snapshot_status in \('PRELIMINARY','FINAL'\)/);
});
