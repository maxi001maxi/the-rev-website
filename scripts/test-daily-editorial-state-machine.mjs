// THE REV. Daily Editorial zero-to-ten regression tests.
// node scripts/test-daily-editorial-state-machine.mjs
//
// Reproduces the 2026-10-01 / 2026-10-03 incident: one REVIEW_READY article
// (BLOG-20260930-oxy02) with active 1/5 stopped the next business days'
// article, and the human-published article was never reconciled to PUBLISHED.

import fs from 'node:fs';
import vm from 'node:vm';
import {
  DAILY_DECISION,
  DAILY_DECISION_REASON,
  detectMissedDailyCreation,
  hasVerifiedPublication,
  planDailyEditorial,
  toJstDateKey,
  weekdayCodeForDateKey
} from '../lib/dailyEditorialStateMachine.mjs';
import { collectPublicationEvidence } from '../api/integrations/editorial-status.mjs';

let passed = 0;
const failures = [];
function assert(cond, name, detail = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✕ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(name) { console.log(`\n[${name}]`); }

const FIXTURE = JSON.parse(fs.readFileSync(new URL('../editorial/fixtures/daily-queue-2026-10-03-snapshot.json', import.meta.url), 'utf8'));
const SETTINGS = {
  daily_editorial_enabled: 1,
  daily_editorial_days: 'TU,WE,TH,SA,SU',
  daily_editorial_max_active_queue: 5,
  daily_editorial_max_new_topics: 1,
  daily_editorial_active_statuses: 'NEW|KNOWLEDGE_CHECK|INTERVIEW_WAITING|INTERVIEW_COMPLETE|DRAFTING|QC|IMAGE_PREPARING|REVIEW_READY|ERROR'
};
const OXY02 = 'BLOG-20260930-oxy02';
const PUBLISHED_EVIDENCE = {
  [OXY02]: {
    publish_status: 'PUBLISHED',
    published_url: 'https://therev-lab.com/blog/oxygen-room-how-to-spend-time/',
    publish_verified_at: '2026-10-01T02:06:00.000Z',
    publish_commit_sha: '16482afe30ea75434988ed93b5c63679619a00a6'
  }
};
const at = (iso) => new Date(iso);
const rows = () => FIXTURE.rows.map((r) => ({ ...r }));

section('1. Date normalization (Sheets / GAS values)');
assert(toJstDateKey('2026/09/30') === '2026-09-30', 'Sheets YYYY/MM/DD');
assert(toJstDateKey(46284) === '2026-09-19' && toJstDateKey('46284.369') === '2026-09-19', 'Sheets serial date (live row DQ-20260919-c22983)');
assert(toJstDateKey('2026-09-30T15:00:00.000Z') === '2026-10-01', 'GAS Date serialized as UTC ISO → JST date');
assert(toJstDateKey('2026/09/30 10:05:00') === '2026-09-30', 'local datetime string keeps its calendar date');
assert(toJstDateKey(at('2026-10-03T05:00:00+09:00')) === '2026-10-03', 'Date object in JST');
assert(toJstDateKey('READY') === null && toJstDateKey('') === null, 'garbage is null, never silently today');
assert(weekdayCodeForDateKey('2026-10-01') === 'TH' && weekdayCodeForDateKey('2026-10-02') === 'FR' && weekdayCodeForDateKey('2026-10-03') === 'SA', 'weekday codes');

section('1b. Next-day preparation (run every day, prepare tomorrow)');
{
  const day = (iso, settings = SETTINGS) => planDailyEditorial({ rows: [], now: at(iso), settings });
  const wed = day('2026-09-30T05:00:00+09:00');
  assert(wed.prepared_on === '2026-09-30' && wed.run_date === '2026-10-01' && wed.lead_days === 1, 'default: the run on 9/30 prepares the 10/01 article');
  assert(wed.weekday === 'TH' && wed.decision.action === DAILY_DECISION.CREATE_NEW, 'business day is judged on the target day');
  assert(day('2026-10-01T05:00:00+09:00').decision.reason === DAILY_DECISION_REASON.CLOSED_DAY, 'Thursday run -> Friday target is closed -> nothing prepared');
  assert(day('2026-10-02T05:00:00+09:00').decision.action === DAILY_DECISION.CREATE_NEW, 'Friday (closed today) still prepares Saturday');
  assert(day('2026-10-04T05:00:00+09:00').decision.reason === DAILY_DECISION_REASON.CLOSED_DAY, 'Sunday run -> Monday target is closed');
  assert(day('2026-10-05T05:00:00+09:00').run_date === '2026-10-06' && day('2026-10-05T05:00:00+09:00').decision.action === DAILY_DECISION.CREATE_NEW, 'Monday (closed today) prepares Tuesday');
  const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
    .map((d) => day(`${d}T05:00:00+09:00`)).filter((x) => x.decision.action === DAILY_DECISION.CREATE_NEW).map((x) => x.weekday);
  assert(week.join(',') === 'TU,WE,TH,SA,SU', 'a full week of daily runs prepares exactly the five business days', week.join(','));
  const same = day('2026-10-03T05:00:00+09:00', { ...SETTINGS, daily_editorial_lead_days: 0 });
  assert(same.run_date === '2026-10-03' && same.lead_days === 0, 'daily_editorial_lead_days=0 keeps same-day creation available');
  assert(day('2026-10-02T05:00:00+09:00', { ...SETTINGS, daily_editorial_lead_days: 'x' }).lead_days === 1, 'invalid lead setting falls back to 1');
  const dup = planDailyEditorial({ rows: [{ run_date: '2026/10/03', content_id: 'BLOG-20261003-a', queue_status: 'REVIEW_READY' }], now: at('2026-10-02T09:00:00+09:00'), settings: SETTINGS });
  assert(dup.decision.reason === DAILY_DECISION_REASON.ALREADY_SCHEDULED_TODAY, 'idempotency key is the target run_date');
}

section('2. Incident 2026-10-01 05:00 — REVIEW_READY 1/5 must not block');
{
  const plan = planDailyEditorial({ rows: rows(), now: at('2026-09-30T05:00:00+09:00'), settings: SETTINGS });
  assert(plan.business_day === true && plan.weekday === 'TH', 'Thursday is a business day');
  assert(plan.active.count === 1 && plan.active.cap === 5, 'active 1/5 (oxy02 REVIEW_READY)', JSON.stringify(plan.active));
  assert(plan.decision.action === DAILY_DECISION.CREATE_NEW, 'decision CREATE_NEW', JSON.stringify(plan.decision));
  assert(plan.decision.new_topics_allowed === 1, 'max 1 new topic');
  const oxy = plan.existing_work.find((w) => w.content_id === OXY02);
  assert(oxy?.next_action === 'AWAIT_HUMAN_PUBLISH' && oxy.blocks_daily_creation === false, 'existing Review work is parallel, not exclusive');
  assert(plan.invariants.review_ready_blocks_creation === false && plan.invariants.auto_publish === false, 'invariants exported');
  assert(plan.reconciliation.patches.length === 0, 'no evidence → no PUBLISHED guess');
}

section('3. Incident 2026-10-03 05:00 — stale REVIEW_READY with verified publish evidence');
{
  const plan = planDailyEditorial({ rows: rows(), now: at('2026-10-02T05:00:00+09:00'), settings: SETTINGS, evidenceByContentId: PUBLISHED_EVIDENCE });
  const patch = plan.reconciliation.patches[0];
  assert(plan.reconciliation.patches.length === 1 && patch.content_id === OXY02, 'oxy02 reconciled');
  assert(patch.from_queue_status === 'REVIEW_READY' && patch.queue_status === 'PUBLISHED' && patch.web_bridge_status === 'PUBLISHED', 'REVIEW_READY → PUBLISHED / Bridge PUBLISHED');
  assert(patch.published_url.endsWith('/oxygen-room-how-to-spend-time/') && patch.human_action_required === 'NONE', 'patch carries URL and clears human action');
  assert(plan.active.count === 0, 'published article frees active capacity');
  assert(plan.decision.action === DAILY_DECISION.CREATE_NEW, 'today article still created');
}
{
  const plan = planDailyEditorial({ rows: rows(), now: at('2026-10-02T05:00:00+09:00'), settings: SETTINGS });
  assert(plan.active.count === 1 && plan.decision.action === DAILY_DECISION.CREATE_NEW, 'even without reconciliation, stale REVIEW_READY does not stop 10/03');
}

section('4. Evidence strictness — never PUBLISHED by guess');
{
  const committed = { [OXY02]: { publish_status: 'PUBLISH_COMMITTED', published_url: 'https://therev-lab.com/blog/x/' } };
  const plan = planDailyEditorial({ rows: rows(), now: at('2026-10-02T05:00:00+09:00'), settings: SETTINGS, evidenceByContentId: committed });
  assert(plan.reconciliation.patches.length === 0, 'PUBLISH_COMMITTED (deploy unverified) is not PUBLISHED');
  assert(plan.reconciliation.pending_deploy_verification[0]?.content_id === OXY02, 'PUBLISH_COMMITTED surfaced as pending verification');
  assert(!hasVerifiedPublication({ publish_status: 'PUBLISH_COMMITTED', published_url: 'https://x', publish_verified_at: '2026-10-01T00:00:00Z' }), 'PUBLISH_COMMITTED rejected even with URL + timestamp');
  assert(!hasVerifiedPublication({ publish_status: 'PUBLISHED', published_url: 'https://x' }), 'PUBLISHED without publish_verified_at rejected');
  assert(!hasVerifiedPublication({ publish_status: 'PUBLISHED', publish_verified_at: '2026-10-01T00:00:00Z' }), 'PUBLISHED without URL rejected');
  assert(hasVerifiedPublication({ article: PUBLISHED_EVIDENCE[OXY02] }), 'reconcilePublication() result shape accepted');
}

section('5. Active cap is preserved (cap, not lock)');
{
  const base = rows().filter((r) => r.content_id !== OXY02);
  const fourActive = [...base, ...['IMAGE_PREPARING', 'REVIEW_READY', 'INTERVIEW_WAITING', 'ERROR'].map((s, i) => ({ run_date: '2026/09/2' + i, content_id: `A${i}`, queue_status: s }))];
  const five = [...fourActive, { run_date: '2026/09/30', content_id: 'A5', queue_status: 'REVIEW_READY' }];
  const now = at('2026-10-02T05:00:00+09:00');
  assert(planDailyEditorial({ rows: fourActive, now, settings: SETTINGS }).decision.action === DAILY_DECISION.CREATE_NEW, 'active 4/5 → CREATE_NEW');
  const capped = planDailyEditorial({ rows: five, now, settings: SETTINGS });
  assert(capped.decision.action === DAILY_DECISION.NO_ACTION && capped.decision.reason === DAILY_DECISION_REASON.ACTIVE_CAP_REACHED, 'active 5/5 → NO_ACTION / ACTIVE_CAP_REACHED');
  const fiveReviewReady = Array.from({ length: 5 }, (_, i) => ({ run_date: '2026/09/2' + i, content_id: `R${i}`, queue_status: 'REVIEW_READY' }));
  const evidence = Object.fromEntries(fiveReviewReady.map((r) => [r.content_id, { ...PUBLISHED_EVIDENCE[OXY02] }]));
  const healed = planDailyEditorial({ rows: fiveReviewReady, now, settings: SETTINGS, evidenceByContentId: evidence });
  assert(healed.reconciliation.patches.length === 5 && healed.decision.action === DAILY_DECISION.CREATE_NEW, 'five stale published REVIEW_READY rows self-heal and unblock the cap');
  const leaky = planDailyEditorial({ rows: five, now, settings: { ...SETTINGS, daily_editorial_active_statuses: 'REVIEW_READY|PUBLISHED' } });
  assert(leaky.active.count === 2, 'terminal statuses cannot be configured as active', JSON.stringify(leaky.active));
}

section('6. Business days / idempotency / resume');
{
  const fri = planDailyEditorial({ rows: rows(), now: at('2026-10-01T05:00:00+09:00'), settings: SETTINGS });
  assert(fri.decision.action === DAILY_DECISION.NO_ACTION && fri.decision.reason === DAILY_DECISION_REASON.CLOSED_DAY, 'Friday closed day → NO_ACTION');
  const today = [...rows(), { run_date: '2026/10/03', content_id: 'BLOG-20261003-new', queue_status: 'DRAFTING' }];
  const again = planDailyEditorial({ rows: today, now: at('2026-10-02T09:00:00+09:00'), settings: SETTINGS });
  assert(again.decision.reason === DAILY_DECISION_REASON.ALREADY_SCHEDULED_TODAY, 'second run same day does not duplicate');
  const skipped = [...rows(), { run_date: '2026/10/03', content_id: 'BLOG-20261003-x', queue_status: 'SKIPPED' }];
  assert(planDailyEditorial({ rows: skipped, now: at('2026-10-02T09:00:00+09:00'), settings: SETTINGS }).decision.action === DAILY_DECISION.CREATE_NEW, 'only a SKIPPED row today → can resume and create');
  const late = planDailyEditorial({ rows: rows(), now: at('2026-10-02T11:30:00+09:00'), settings: SETTINGS });
  assert(late.decision.action === DAILY_DECISION.CREATE_NEW, 'missed 05:00 run is resumable later the same day');
  assert(planDailyEditorial({ rows: rows(), now: at('2026-10-02T05:00:00+09:00'), settings: { ...SETTINGS, daily_editorial_enabled: 0 } }).decision.reason === DAILY_DECISION_REASON.DISABLED, 'disabled flag respected');
}

section('7. Notification state never gates content');
{
  const noisy = rows().map((r) => ({ ...r, notification_status: 'FAILED' }));
  const plan = planDailyEditorial({ rows: noisy, now: at('2026-10-02T05:00:00+09:00'), settings: SETTINGS });
  assert(plan.decision.action === DAILY_DECISION.CREATE_NEW && plan.invariants.notification_failure_blocks_creation === false, 'FAILED/PENDING notifications do not stop creation');
}

section('8. Missed-creation watchdog');
{
  const plan = planDailyEditorial({ rows: rows(), now: at('2026-10-02T05:00:00+09:00'), settings: SETTINGS });
  assert(detectMissedDailyCreation({ plan, rows: rows() }).missed === true, 'CREATE_NEW + no row today → missed (ERROR_BLOCKED)');
  assert(detectMissedDailyCreation({ plan, rows: [...rows(), { run_date: '2026/10/03', queue_status: 'DRAFTING' }] }).missed === false, 'row exists → not missed');
}

section('9. Bridge daily_plan evidence collector');
{
  const drafts = [
    { editorial_content_id: OXY02, publish_status: 'PUBLISH_COMMITTED', publish_commit_sha: 'c1', published_url: 'https://therev-lab.com/blog/oxygen-room-how-to-spend-time/' },
    { editorial_content_id: 'BLOG-other', publish_status: 'NOT_PUBLISHED' }
  ];
  let queriedIds = null;
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async (_col, ids) => { queriedIds = ids; return { data: drafts.filter((d) => ids.includes(d.editorial_content_id)), error: null }; }
        })
      })
    })
  };
  let reconcileCalls = 0;
  const reconcileFn = async ({ article }) => {
    reconcileCalls += 1;
    return { article: { ...article, publish_status: 'PUBLISHED', publish_verified_at: '2026-10-03T00:00:00Z' } };
  };
  const evidence = await collectPublicationEvidence({
    supabase,
    rows: [...rows(), { content_id: 'BLOG-other', queue_status: 'DRAFTING' }],
    reconcileFn
  });
  assert(Array.isArray(queriedIds) && queriedIds.includes(OXY02) && !queriedIds.includes('BLOG-20260929-oxy06'), 'only non-terminal Queue rows are looked up');
  assert(reconcileCalls === 1, 'PUBLISH_COMMITTED drafts are re-verified via reconcilePublication');
  assert(hasVerifiedPublication(evidence.byContentId[OXY02]), 'verified evidence returned for oxy02');
  assert(evidence.byContentId['BLOG-other'].publish_status === 'NOT_PUBLISHED', 'unpublished drafts stay unpublished');
}

section('10. GAS v0.6.9 gate + watchdog (sandboxed Apps Script)');
{
  const gasSource = fs.readFileSync(new URL('../editorial/gas/DailyEditorialGate_v0.6.9.gs', import.meta.url), 'utf8');

  function makeSheet(name, header, objects) {
    return { name, header: [...header], data: objects.map((o) => ({ ...o })) };
  }
  function harness({ now, queueRows, evidence = {}, planFails = false, lineOk = true }) {
    const queue = makeSheet('26_DAILY_EDITORIAL_QUEUE', Object.keys(queueRows[0]), queueRows);
    const bridge = makeSheet('25_WEB_PUBLISH_BRIDGE', ['content_id', 'bridge_status', 'published_url', 'notes'], [
      { content_id: OXY02, bridge_status: 'PREVIEW_READY', published_url: '', notes: 'Human approval required before publish.' }
    ]);
    const gbp = makeSheet('22_GBP_POST', ['content_id', 'parent_blog_id', 'blog_url_placeholder', 'body_copy_paste', 'post_ready', 'notes'], [
      { content_id: 'GBP-20260930-oxy02', parent_blog_id: OXY02, blog_url_placeholder: '[BLOG_URL]', body_copy_paste: '詳しくは [BLOG_URL]', post_ready: 'BLOCKED_URL', notes: '' }
    ]);
    const sheets = { [queue.name]: queue, [bridge.name]: bridge, [gbp.name]: gbp };
    const logs = [];
    const props = { EDITORIAL_BRIDGE_SECRET: 'test-secret', THE_REV_LINE_CHANNEL_ACCESS_TOKEN: 't', THE_REV_LINE_USER_ID: 'u' };
    const line = [];
    const sandbox = {
      Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now.getTime()); } static now() { return now.getTime(); } },
      JSON, Math, Object, String, Number, Array, isNaN,
      ss_: () => ({ getSheetByName: (n) => sheets[n] || null }),
      getObjectsWithRow_: (sh) => sh.data.map((o, i) => ({ ...o, __row: i + 2 })),
      setObjectRow_: (sh, row, obj) => { Object.assign(sh.data[row - 2], obj); },
      getSettings_: () => SETTINGS,
      startAutomationLog_: (job, trigger) => { logs.push({ job, trigger, status: 'START' }); return `run-${logs.length}`; },
      finishAutomationLog_: (runId, status, count, summary, error) => { logs.push({ runId, status, count, summary, error }); },
      errorText_: (e) => String(e && e.message || e),
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
      Utilities: {
        formatDate: (d, _tz, _fmt) => toJstDateKey(d)
      },
      UrlFetchApp: {
        fetch: (url, opts) => {
          if (url.includes('api.line.me')) {
            line.push(JSON.parse(opts.payload).messages[0].text);
            return { getResponseCode: () => (lineOk ? 200 : 500), getContentText: () => '', getAllHeaders: () => ({}) };
          }
          if (planFails) return { getResponseCode: () => 503, getContentText: () => '{"message":"down"}', getAllHeaders: () => ({}) };
          const body = JSON.parse(opts.payload);
          if (opts.headers.Authorization !== 'Bearer test-secret' || body.action !== 'daily_plan') {
            return { getResponseCode: () => 401, getContentText: () => '{}', getAllHeaders: () => ({}) };
          }
          const plan = planDailyEditorial({ rows: body.rows, now: new Date(body.now), settings: body.settings, evidenceByContentId: evidence });
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, plan }), getAllHeaders: () => ({}) };
        }
      },
      ScriptApp: { getProjectTriggers: () => [] }
    };
    vm.createContext(sandbox);
    vm.runInContext(gasSource, sandbox, { filename: 'DailyEditorialGate_v0.6.9.gs' });
    return { sandbox, sheets, logs, props, line };
  }

  const queueRows = rows().map((r) => ({ ...r, last_successful_stage: '', next_stage: '', human_action_required: '', last_error: '', notes: '' }));
  const h = harness({ now: at('2026-10-02T04:20:00+09:00'), queueRows, evidence: PUBLISHED_EVIDENCE });
  const gate = h.sandbox.scheduledDailyEditorialGateV069();
  const oxyRow = h.sheets['26_DAILY_EDITORIAL_QUEUE'].data.find((r) => r.content_id === OXY02);
  assert(gate.status === 'CREATE_NEW', 'gate decision CREATE_NEW on 10/03', JSON.stringify(gate).slice(0, 300));
  assert(oxyRow.queue_status === 'PUBLISHED' && oxyRow.web_bridge_status === 'PUBLISHED' && oxyRow.human_action_required === 'NONE', 'Queue oxy02 REVIEW_READY → PUBLISHED');
  const bridgeRow = h.sheets['25_WEB_PUBLISH_BRIDGE'].data[0];
  assert(bridgeRow.bridge_status === 'PUBLISHED' && bridgeRow.published_url.endsWith('/oxygen-room-how-to-spend-time/'), '25_WEB_PUBLISH_BRIDGE → PUBLISHED with production URL');
  const gbpRow = h.sheets['22_GBP_POST'].data[0];
  assert(gbpRow.blog_url_placeholder.startsWith('https://therev-lab.com/') && !gbpRow.body_copy_paste.includes('[BLOG_URL]') && gbpRow.post_ready === 'READY', '22_GBP_POST [BLOG_URL] resolved, BLOCKED_URL → READY (not posted)');
  assert(h.logs[0].status === 'START' && h.logs[0].job === 'DAILY_EDITORIAL_GATE' && /decision=CREATE_NEW/.test(h.logs[1].summary), '18_AUTOMATION_LOG START + decision END');
  assert(JSON.parse(h.props['THE_REV_DAILY_GATE_2026-10-03'] || 'null')?.action === 'CREATE_NEW', 'decision persisted for watchdog');
  const otherRows = h.sheets['26_DAILY_EDITORIAL_QUEUE'].data.filter((r) => r.content_id !== OXY02);
  assert(otherRows.every((r, i) => r.queue_status === queueRows.filter((q) => q.content_id !== OXY02)[i].queue_status), 'no other Queue row mutated');

  const rerun = h.sandbox.scheduledDailyEditorialGateV069();
  assert(rerun.status === 'CREATE_NEW' && rerun.applied.length === 0, 'gate is idempotent (second run applies nothing)');

  // Watchdog at 08:xx: nothing was created for today → ERROR_BLOCKED + LINE once.
  const w1 = h.sandbox.scheduledDailyEditorialWatchdogV069();
  assert(w1.status === 'ERROR_BLOCKED' && h.line.length === 1 && /開始されていません/.test(h.line[0]), 'missed creation → ERROR_BLOCKED + LINE');
  const w2 = h.sandbox.scheduledDailyEditorialWatchdogV069();
  assert(w2.notification.status === 'ALREADY_SENT' && h.line.length === 1, 'watchdog notification is sent once');
  h.sheets['26_DAILY_EDITORIAL_QUEUE'].data.push({ run_date: '2026/10/03', content_id: 'BLOG-20261003-x', queue_status: 'DRAFTING' });
  assert(h.sandbox.scheduledDailyEditorialWatchdogV069().status === 'CREATED', 'watchdog clears once today row exists');

  const noEvidence = harness({ now: at('2026-10-02T04:20:00+09:00'), queueRows });
  noEvidence.sandbox.scheduledDailyEditorialGateV069();
  assert(noEvidence.sheets['26_DAILY_EDITORIAL_QUEUE'].data.find((r) => r.content_id === OXY02).queue_status === 'REVIEW_READY', 'no Supabase evidence → Queue stays REVIEW_READY');

  const lineDown = harness({ now: at('2026-10-02T08:10:00+09:00'), queueRows, lineOk: false });
  lineDown.props['THE_REV_DAILY_GATE_2026-10-03'] = JSON.stringify({ action: 'CREATE_NEW', active: 1, cap: 5 });
  const wd = lineDown.sandbox.scheduledDailyEditorialWatchdogV069();
  const lastLog = lineDown.logs[lineDown.logs.length - 1];
  assert(wd.status === 'ERROR_BLOCKED' && /unverified/.test(lastLog.error), 'LINE failure is logged as unverified, not as SENT');
  assert(lineDown.sheets['26_DAILY_EDITORIAL_QUEUE'].data.every((r, i) => r.queue_status === queueRows[i].queue_status), 'notification failure does not mutate Queue');

  const down = harness({ now: at('2026-10-02T04:20:00+09:00'), queueRows, planFails: true });
  const failed = down.sandbox.scheduledDailyEditorialGateV069();
  assert(failed.status === 'ERROR_BLOCKED' && down.logs[1].status === 'ERROR_BLOCKED' && down.line.length === 1, 'Bridge outage → ERROR_BLOCKED log + LINE, never silent');

  const friday = harness({ now: at('2026-10-01T04:20:00+09:00'), queueRows });
  assert(friday.sandbox.scheduledDailyEditorialGateV069().status === 'NO_ACTION' && friday.sandbox.scheduledDailyEditorialWatchdogV069().status === 'NO_WATCH', 'closed day: gate NO_ACTION, watchdog silent');
}

console.log('\n──────────────────────────────');
console.log(`  PASS ${passed} / FAIL ${failures.length}`);
if (failures.length) {
  console.log('  FAILED:\n   - ' + failures.join('\n   - '));
  process.exit(1);
}
console.log('  Daily Editorial zero-to-ten state machine: PASS');
