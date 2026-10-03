// THE REV. Daily Creator integration tests (Gate CREATE_NEW -> Queue row -> Review Ready).
// node scripts/test-daily-creator-integration.mjs
//
// Closes the gap the Gate alone left open: after CREATE_NEW, something must
// actually start today's article. These tests run the versioned GAS sources
// (Gate + Creator) in a sandbox against the real Bridge planning code and the
// live 2026-10-03 Queue / shortlist snapshots.

import fs from 'node:fs';
import {
  CREATION_STATUS,
  buildQueueRow,
  detectStuckRows,
  planDailyCreation,
  selectDailyCandidate,
  toEpochMs
} from '../lib/dailyEditorialCreator.mjs';
import { knowledgeDecisionFor } from '../lib/dailyEditorialKnowledge.mjs';
import { toJstDateKey } from '../lib/dailyEditorialStateMachine.mjs';
import { createGasSandbox } from './helpers/gas-sandbox.mjs';
import { resolveEditorialPublishedDate } from '../lib/editorialBridge.mjs';
import { AUTO_PUBLISH_REASON, autoPublishGate } from '../lib/editorialAutoPublishGate.mjs';
import { computeDailyPayload } from '../api/integrations/editorial-status.mjs';

let passed = 0;
const failures = [];
function assert(cond, name, detail = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✕ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(name) { console.log(`\n[${name}]`); }
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));

const QUEUE_FX = read('../editorial/fixtures/daily-queue-2026-10-03-snapshot.json');
const SHORTLIST_FX = read('../editorial/fixtures/blog-shortlist-2026-10-03-snapshot.json');
const OXY02 = 'BLOG-20260930-oxy02';
const EVIDENCE = {
  [OXY02]: {
    publish_status: 'PUBLISHED',
    published_url: 'https://therev-lab.com/blog/oxygen-room-how-to-spend-time/',
    publish_verified_at: '2026-10-01T02:06:00.000Z',
    publish_commit_sha: '16482afe30ea75434988ed93b5c63679619a00a6'
  }
};
const SETTINGS = {
  daily_editorial_enabled: 1,
  daily_editorial_days: 'TU,WE,TH,SA,SU',
  daily_editorial_hour: 5,
  daily_editorial_max_active_queue: 5,
  daily_editorial_max_new_topics: 1,
  daily_editorial_topic_threshold: 65,
  daily_editorial_stuck_timeout_minutes: 10
};
const at = (iso) => new Date(iso);
const clone = (o) => JSON.parse(JSON.stringify(o));
// The content day of a Queue row (legacy rows: run_date is the target).
const targetOf = (x) => toJstDateKey(x.target_date) || toJstDateKey(x.run_date);
const queueRows = () => clone(QUEUE_FX.rows);
const shortlistRows = () => clone(SHORTLIST_FX.rows);

function sandbox(opts = {}) {
  return createGasSandbox({
    now: '2026-10-02T05:00:00+09:00',
    queueColumns: QUEUE_FX.columns,
    queueRows: queueRows(),
    shortlistColumns: SHORTLIST_FX.columns,
    shortlistRows: shortlistRows(),
    settings: SETTINGS,
    evidence: EVIDENCE,
    ...opts
  });
}

// Verbatim selector from the deployed GAS v0.6.5.2 Supervisor
// (Drive doc 19_PATCH_v0.6.5.2_RELATIVE_REDIRECT_FIX_CODE_ONLY,
//  v065GeneratePendingArticle_ no-interview branch).
function v065Token(v) {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (v === null || v === undefined) return '';
  return String(v).trim().toUpperCase();
}
function v0652NoInterviewSelector(r) {
  const qs = v065Token(r.queue_status);
  const kg = v065Token(r.knowledge_gate);
  const req = v065Token(r.interview_required);
  const ist = v065Token(r.interview_status);
  const ds = v065Token(r.draft_status);
  return kg === 'SUFFICIENT'
    && ['FALSE', 'NO', '0'].includes(req)
    && ['NOT_REQUIRED', ''].includes(ist)
    && ['DRAFTING', 'PATCHING', 'TOPIC_SELECTED'].includes(qs)
    && (!ds || ['NOT_STARTED', 'DRAFTING'].includes(ds));
}

// Model of the Supervisor's contract transitions for one tick, driven by the
// created row's own fields (state contract: draft_to_image, image_to_review).
const LEGAL_EDGES = new Set([
  'DRAFTING>QC', 'QC>BRIDGE_SYNCING', 'BRIDGE_SYNCING>IMAGE_PREPARING', 'IMAGE_PREPARING>REVIEW_READY'
]);
function supervisorModel(h, { imageReady }) {
  const transitions = [];
  const set = (row, status) => {
    const edge = `${v065Token(row.queue_status)}>${status}`;
    if (!LEGAL_EDGES.has(edge)) throw new Error(`illegal transition ${edge}`);
    transitions.push(edge);
    row.queue_status = status;
  };
  const rows = h.queue.data;
  let target = rows.filter(v0652NoInterviewSelector)
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))[0];
  if (target) {
    JSON.parse(target.topic_gate_json);
    const knowledge = JSON.parse(target.knowledge_context_json);
    if (knowledge.decision !== 'SUFFICIENT') throw new Error('knowledge context not SUFFICIENT');
    set(target, 'QC');
    h.gbp.data.push({ content_id: `GBP-${target.content_id}`, parent_blog_id: target.content_id, blog_url_placeholder: '[BLOG_URL]', status: 'READY' });
    target.gbp_id = `GBP-${target.content_id}`;
    set(target, 'BRIDGE_SYNCING');
    set(target, 'IMAGE_PREPARING');
    target.draft_status = 'READY';
    target.web_bridge_status = 'IMAGE_PREPARING';
  }
  const preparing = rows.find((r) => v065Token(r.queue_status) === 'IMAGE_PREPARING' && r.content_id);
  if (preparing && imageReady) {
    const hasGbp = h.gbp.data.some((g) => g.parent_blog_id === preparing.content_id);
    if (!hasGbp) throw new Error('REVIEW_READY requires a GBP row');
    set(preparing, 'REVIEW_READY');
    preparing.image_status = 'READY';
    preparing.web_bridge_status = 'PREVIEW_READY';
    preparing.review_url = `https://the-rev-website.vercel.app/admin/articles/review/?id=${preparing.content_id}`;
  }
  // v065NotifyReviewReady_: only rows whose run_date is today, once per content_id.
  for (const r of rows) {
    const key = `THE_REV_DAILY_FINAL_LINE_NOTIFIED_${r.content_id}`;
    if (v065Token(r.queue_status) === 'REVIEW_READY' && toJstDateKey(r.run_date) === toJstDateKey(h.state.now) && h.props[key] !== 'TRUE') {
      h.line.push(`SUPERVISOR_REVIEW_READY ${r.content_id}`);
      h.props[key] = 'TRUE';
    }
  }
  return transitions;
}

section('1. Candidate selection on the live 2026-10-03 shortlist');
{
  const now = at('2026-10-02T05:00:00+09:00');
  const sel = selectDailyCandidate({ shortlist: shortlistRows(), queueRows: queueRows(), now, settings: SETTINGS });
  assert(sel.selected?.candidate_id === 'BT-20260930-FAC-01', 'top eligible candidate is FAC-01 (portfolio 92)', sel.selected?.candidate_id);
  assert(sel.sufficient_pool === 4, '4 Interview-free candidates remain', String(sel.sufficient_pool));
  const by = Object.fromEntries(sel.evaluated.map((e) => [e.candidate_id, e]));
  assert(by['BT-20260930-OXY-02'].reasons.includes('STATUS_SELECTED') && by['BT-20260930-OXY-02'].reasons.includes('ALREADY_QUEUED'), 'already used candidate excluded');
  assert(by['BT-20260921-01'].reasons.includes('STATUS_SKIPPED_USER_REJECTED'), 'user-rejected candidate never returns');
  assert(by['BT-20260914-03'].reasons.includes('STALE_CANDIDATE'), 'candidates older than 14 days are stale');
  assert(by['BT-20260914-04'].reasons.includes('NOT_WEB_BLOG') && by['BT-20260914-04'].reasons.includes('NOT_PUBLISH_DECISION'), 'non-Blog routes excluded');
  assert(by['BT-20260928-04'].reasons.includes('STATUS_SKIPPED_USER_REPLACED'), 'replaced candidate excluded');
  const low = selectDailyCandidate({ shortlist: shortlistRows().map((r) => ({ ...r, total_score: 60 })), queueRows: queueRows(), now, settings: SETTINGS });
  assert(low.selected === null && low.evaluated.every((e) => e.reasons.includes('BELOW_RAW_GATE')), 'raw score gate (65) is enforced before any bonus');
  const tie = selectDailyCandidate({
    shortlist: [
      { candidate_id: 'T-B', week_start: '2026/09/28', status: 'CANDIDATE', decision: 'PUBLISH', route_lane: 'WEB_BLOG', total_score: 80, portfolio_final_score: 90, rank: 2, editorial_lane: 'DENBA', primary_query: 'q2' },
      { candidate_id: 'T-A', week_start: '2026/09/28', status: 'CANDIDATE', decision: 'PUBLISH', route_lane: 'WEB_BLOG', total_score: 80, portfolio_final_score: 90, rank: 1, editorial_lane: 'DENBA', primary_query: 'q1' }
    ], queueRows: [], now, settings: SETTINGS
  });
  assert(tie.selected.candidate_id === 'T-A', 'ties break by rank then id (deterministic)');
}

section('2. Knowledge sufficiency registry');
{
  assert(knowledgeDecisionFor({ editorial_lane: 'OXYGEN_ROOM' }).sufficient === true, 'oxygen-room lane has registered manuals');
  assert(knowledgeDecisionFor({ editorial_lane: 'FACILITY_THE_REV', content_pillar: 'GYM_LOCAL' }).source_id === 'FACILITY_THE_REV', 'lane wins over pillar');
  assert(knowledgeDecisionFor({ content_pillar: 'TRAINING', editorial_lane: 'TRAINING' }).source_id === 'TRAINING', 'training pillar uses its Interview');
  const perf = knowledgeDecisionFor({ content_pillar: 'PERFORMANCE', editorial_lane: 'PERFORMANCE' });
  assert(perf.sufficient === false && perf.decision === 'INTERVIEW_REQUIRED', 'unregistered pillar never assumed sufficient');
}

section('3. Queue row matches the state contract and the live sheet');
{
  const now = at('2026-10-02T05:00:00+09:00');
  const out = planDailyCreation({ rows: queueRows(), shortlist: shortlistRows(), now, settings: SETTINGS, evidenceByContentId: EVIDENCE });
  const row = out.creation.queue_row;
  assert(out.creation.status === CREATION_STATUS.READY_TO_CREATE, 'READY_TO_CREATE');
  assert(Object.keys(row).filter((k) => !QUEUE_FX.columns.includes(k)).join(',') === 'target_date', 'only target_date is new versus the live 26_DAILY_EDITORIAL_QUEUE header', Object.keys(row).filter((k) => !QUEUE_FX.columns.includes(k)).join(','));
  assert(row.queue_status === 'DRAFTING' && row.knowledge_gate === 'SUFFICIENT' && row.interview_required === false && row.interview_status === 'NOT_REQUIRED', 'no-interview DRAFTING contract');
  assert(row.draft_status === 'NOT_STARTED' && row.image_status === 'NOT_STARTED' && row.draft_status !== 'PENDING', 'draft NOT_STARTED, never PENDING');
  assert(row.run_date === '2026/10/02' && row.target_date === '2026/10/03' && row.weekday === 'FR' && out.plan.run_date === '2026-10-02' && out.plan.target_date === '2026-10-03', 'run_date 10/02 (run day) and target_date 10/03 (content day) are separate');
  assert(/^BLOG-20261003-[0-9a-f]{6}$/.test(row.content_id) && row.queue_id === 'DQ-20261002-001', 'content_id carries the target day, queue_id the run day');
  const again = buildQueueRow({ evaluated: selectDailyCandidate({ shortlist: shortlistRows(), queueRows: queueRows(), now, settings: SETTINGS }).selected, now, queueRows: queueRows(), targetDate: '2026-10-03' });
  assert(again.content_id === row.content_id, 'content_id is stable for the same candidate/day');
  const gate = JSON.parse(row.topic_gate_json);
  const kc = JSON.parse(row.knowledge_context_json);
  assert(gate.candidate_id === 'BT-20260930-FAC-01' && gate.decision === 'PUBLISH' && gate.route_lane === 'WEB_BLOG' && gate.article_type === 'STANDARD', 'topic_gate_json carries the Writer inputs');
  assert(kc.decision === 'SUFFICIENT' && kc.fact_ids.includes('F005'), 'knowledge_context_json cites verified facts');
  assert(v0652NoInterviewSelector({ ...row, created_at: new Date(row.created_at) }), 'deployed v0.6.5.2 selector picks the new row up');
  assert(row.week_start === '2026/09/28', 'week_start is the candidate week as a JST date', String(row.week_start));
  const isoWeek = buildQueueRow({
    evaluated: { ...selectDailyCandidate({ shortlist: shortlistRows(), queueRows: queueRows(), now, settings: SETTINGS }).selected, candidate: { ...shortlistRows().find((x) => x.candidate_id === 'BT-20260930-FAC-01'), week_start: '2026-09-27T15:00:00.000Z' } },
    now,
    queueRows: queueRows(),
    targetDate: '2026-10-03'
  });
  assert(isoWeek.week_start === '2026/09/28', 'GAS ISO week_start (UTC) maps to the JST week, not one day early', String(isoWeek.week_start));
  const second = buildQueueRow({ evaluated: selectDailyCandidate({ shortlist: shortlistRows(), queueRows: queueRows(), now, settings: SETTINGS }).selected, now, targetDate: '2026-10-03', queueRows: [...queueRows(), { queue_id: 'DQ-20261002-001', run_date: '2026/10/02', queue_status: 'SKIPPED' }] });
  assert(second.queue_id === 'DQ-20261002-002', 'queue_id sequence skips existing ids');
}

section('4. INCIDENT: 10/01 05:00 — REVIEW_READY 1/5 must still create');
{
  const h = sandbox({ now: '2026-09-30T05:00:00+09:00', evidence: {} });
  const before = h.queue.data.length;
  const r = h.tick('scheduledDailyEditorialCreatorV069');
  assert(r.status === 'CREATED', 'creator creates despite REVIEW_READY', JSON.stringify(r).slice(0, 200));
  assert(h.queue.data.length === before + 1, 'exactly one Queue row appended');
  const oxy = h.queue.data.find((x) => x.content_id === OXY02);
  assert(oxy.queue_status === 'REVIEW_READY', 'no evidence -> oxy02 untouched (no guess)');
  assert(h.queue.data.filter((x) => targetOf(x) === '2026-10-01' && toJstDateKey(x.run_date) === '2026-09-30' && x.queue_status === 'DRAFTING').length === 1, 'the 10/01 row is DRAFTING, created on run day 9/30');
}

section('5. INCIDENT: 10/03 05:00 — full creation with publish reconciliation');
const day1 = sandbox();
{
  const h = day1;
  const r = h.tick('scheduledDailyEditorialCreatorV069');
  const created = h.queue.data.find((x) => x.content_id === r.content_id);
  assert(r.status === 'CREATED' && r.candidate_id === 'BT-20260930-FAC-01', 'CREATED from FAC-01', JSON.stringify(r).slice(0, 200));
  assert(created && created.queue_status === 'DRAFTING' && targetOf(created) === '2026-10-03' && toJstDateKey(created.run_date) === '2026-10-02', 'target 10/03 Queue row exists, DRAFTING, run_date 10/02');
  assert(h.queue.header.includes('target_date') && h.queue.header.indexOf('target_date') === QUEUE_FX.columns.length, 'target_date column is appended to the live header (existing columns untouched)');
  assert(created.created_at instanceof Date && created.updated_at instanceof Date, 'timestamps written as Dates');
  const oxy = h.queue.data.find((x) => x.content_id === OXY02);
  assert(oxy.queue_status === 'PUBLISHED' && oxy.web_bridge_status === 'PUBLISHED', 'stale REVIEW_READY oxy02 reconciled to PUBLISHED in the same tick');
  assert(h.shortlist.data.find((x) => x.candidate_id === 'BT-20260930-FAC-01').status === 'SELECTED', 'shortlist candidate marked SELECTED');
  const end = h.logs.filter((l) => l.job === 'DAILY_EDITORIAL_CREATE').pop();
  assert(end.status === 'CREATED' && /verified=true/.test(end.summary) && !end.error, '18_AUTOMATION_LOG: CREATED only after read-back');
  assert(h.props['THE_REV_DAILY_CREATED_2026-10-03'] === r.content_id, 'creation recorded for the Watchdog');
  assert(h.line.length === 0, 'no alert on the happy path');
  assert(h.queue.data.filter((x) => targetOf(x) === '2026-10-03').length === 1, 'single row for the day');
}

section('6. Hourly retries are idempotent and a missed 05:00 self-heals');
{
  const h = day1;
  h.setNow('2026-10-02T06:00:00+09:00');
  const again = h.tick('scheduledDailyEditorialCreatorV069');
  assert(again.status === 'NO_ACTION' && h.queue.data.filter((x) => targetOf(x) === '2026-10-03').length === 1, '06:00 retry creates nothing');
  const late = sandbox({ now: '2026-10-02T10:40:00+09:00' });
  assert(late.tick('scheduledDailyEditorialCreatorV069').status === 'CREATED', 'creator started at 10:40 still creates (05:00 trigger was missed)');
  const early = sandbox({ now: '2026-10-02T04:30:00+09:00' });
  assert(early.tick('scheduledDailyEditorialCreatorV069').status === 'OUTSIDE_WINDOW' && early.queue.data.length === queueRows().length, 'before 05:00 the Creator waits');
  const after = sandbox({ now: '2026-10-02T12:00:00+09:00' });
  assert(after.tick('scheduledDailyEditorialCreatorV069').status === 'OUTSIDE_WINDOW', 'after 11:59 the Creator stops');
  const manual = after.tick('runDailyEditorialCreatorV069Once');
  assert(manual.status === 'CREATED' && after.queue.data.filter((x) => targetOf(x) === '2026-10-03').length === 1, 'manual Once run prepares the target day outside the window');
  assert(after.tick('runDailyEditorialCreatorV069Once').status === 'NO_ACTION', 'manual run stays idempotent');
}

section('6b. Concurrent writer (manual entry / ChatGPT fallback) between plan and write');
{
  const racer = sandbox({
    afterBridge: ({ queue }) => {
      queue.data.push({ queue_id: 'DQ-20261002-009', run_date: '2026/10/02', target_date: '2026/10/03', content_id: 'BLOG-20261003-manual', queue_status: 'DRAFTING', topic_candidate_id: 'BT-MANUAL' });
    }
  });
  const r = racer.tick('scheduledDailyEditorialCreatorV069');
  assert(r.status === 'ALREADY_CREATED' && racer.queue.data.filter((x) => targetOf(x) === '2026-10-03').length === 1, 'a row that appears after the plan is never duplicated');
  assert(racer.shortlist.data.find((x) => x.candidate_id === 'BT-20260930-FAC-01').status === 'CANDIDATE', 'shortlist candidate untouched when someone else created the row');
}

section('7. Supervisor hand-off: Queue row -> Review Ready, then the next business day');
{
  const h = day1;
  h.setNow('2026-10-02T05:02:00+09:00');
  const t1 = supervisorModel(h, { imageReady: false });
  assert(t1.join(',') === 'DRAFTING>QC,QC>BRIDGE_SYNCING,BRIDGE_SYNCING>IMAGE_PREPARING', 'Draft/QC -> GBP -> Bridge -> IMAGE_PREPARING with legal transitions');
  assert(h.gbp.data.some((g) => g.parent_blog_id.startsWith('BLOG-20261003-')), '22_GBP_POST row linked by parent_blog_id');
  h.setNow('2026-10-02T07:30:00+09:00');
  const t2 = supervisorModel(h, { imageReady: true });
  const today = h.queue.data.find((x) => targetOf(x) === '2026-10-03');
  assert(t2.join(',') === 'IMAGE_PREPARING>REVIEW_READY' && today.queue_status === 'REVIEW_READY' && today.review_url, 'REVIEW_READY with review_url after image READY');
  assert(h.line.filter((l) => l.startsWith('SUPERVISOR_REVIEW_READY')).length === 1, 'run_date is the run day, so the deployed Supervisor announces Review Ready natively');
  h.setNow('2026-10-02T15:00:00+09:00');
  h.tick('scheduledDailyEditorialCreatorV069');
  assert(!h.line.some((l) => l.includes('分の記事が出来上がりました')), 'Creator does not announce what the Supervisor already announced');

  // Nobody publishes 10/03's article. 10/04 (Sunday) must still produce a new one.
  h.setNow('2026-10-03T05:00:00+09:00');
  const next = h.tick('scheduledDailyEditorialCreatorV069');
  assert(next.status === 'CREATED' && next.candidate_id !== 'BT-20260930-FAC-01', 'next business day creates again while 10/03 waits in REVIEW_READY', JSON.stringify(next).slice(0, 160));
  assert(h.queue.data.filter((x) => x.queue_status === 'REVIEW_READY').length === 1 && h.queue.data.filter((x) => x.queue_status === 'DRAFTING').length === 1, 'REVIEW_READY and DRAFTING work in parallel');
}

section('7a. Article that becomes ready after its run day ended');
{
  const late = sandbox();
  const made = late.tick('scheduledDailyEditorialCreatorV069');
  late.setNow('2026-10-02T05:02:00+09:00');
  supervisorModel(late, { imageReady: false });
  late.setNow('2026-10-03T00:20:00+09:00');
  supervisorModel(late, { imageReady: true });
  assert(late.queue.data.find((x) => x.content_id === made.content_id).queue_status === 'REVIEW_READY' && !late.line.some((l) => l.startsWith('SUPERVISOR_REVIEW_READY')), 'images finishing after midnight: the Supervisor stays silent (run_date is yesterday)');
  late.setNow('2026-10-03T01:00:00+09:00');
  const tick = late.tick('scheduledDailyEditorialCreatorV069');
  const ready = () => late.line.filter((l) => l.includes('分の記事が出来上がりました'));
  assert(tick.status === 'OUTSIDE_WINDOW' && ready().length === 1 && ready()[0].includes('2026-10-03'), 'Creator announces it on the next hourly tick, even outside the creation window');
  late.setNow('2026-10-03T02:00:00+09:00');
  late.tick('scheduledDailyEditorialCreatorV069');
  assert(ready().length === 1, 'announced once');
  const stale = late.queue.data.find((x) => x.content_id === 'BLOG-20260930-oxy02');
  assert(stale.queue_status === 'PUBLISHED' || !late.line.some((l) => l.includes('2026-09-30')), 'old REVIEW_READY rows are never re-announced');
}

section('7b. Weekly rhythm: every daily run prepares the next business day');
{
  const week = sandbox({ now: '2026-10-05T05:00:00+09:00', evidence: {} });
  const made = [];
  for (const d of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) {
    week.setNow(`${d}T05:00:00+09:00`);
    week.shortlist.data.forEach((c) => { if (c.status !== 'SELECTED' && !String(c.status).startsWith('SKIPPED')) c.week_start = d.replace(/-/g, '/'); });
    const r = week.tick('scheduledDailyEditorialCreatorV069');
    made.push(`${d.slice(8)}:${r.status}${r.reason ? '/' + r.reason : ''}${r.kind ? '/' + r.kind : ''}`);
  }
  assert(made.join(' ') === '05:CREATED 06:CREATED 07:CREATED 08:NO_ACTION/CLOSED_DAY 09:CREATED', 'Mon..Fri runs -> Tue, Wed, Thu, (Fri closed), Sat articles', made.join(' '));
  const dates = week.queue.data.filter((x) => String(x.content_id).startsWith('BLOG-202610')).map((x) => `${toJstDateKey(x.run_date).slice(8)}>${targetOf(x).slice(8)}`).sort();
  assert(dates.join(',') === '05>06,06>07,07>08,09>10', 'each row: run_date = run day, target_date = next day', dates.join(','));
  const sameDay = sandbox({ now: '2026-10-03T05:00:00+09:00', settings: { ...SETTINGS, daily_editorial_lead_days: 0 } });
  const sd = sameDay.tick('scheduledDailyEditorialCreatorV069');
  {
    const r0 = sameDay.queue.data.find((x) => x.content_id === sd.content_id);
    assert(sd.status === 'CREATED' && toJstDateKey(r0.run_date) === '2026-10-03' && targetOf(r0) === '2026-10-03', 'lead_days=0 creates the same-day article (GAS and engine agree)');
  }
  // DAILY cadence: shop closed days still get an article; Editorial runs every day.
  const daily = sandbox({ now: '2026-10-01T05:00:00+09:00', settings: { ...SETTINGS, daily_editorial_cadence: 'DAILY' }, evidence: {} });
  const fri = daily.tick('scheduledDailyEditorialCreatorV069');
  assert(fri.status === 'CREATED' && targetOf(daily.queue.data.find((x) => x.content_id === fri.content_id)) === '2026-10-02', 'cadence=DAILY prepares Friday (shop closed) content');
  const closedRun = sandbox({ now: '2026-10-05T05:00:00+09:00', evidence: {} });
  closedRun.shortlist.data.forEach((c) => { if (c.status === 'CANDIDATE') c.week_start = '2026/10/05'; });
  const mon = closedRun.tick('scheduledDailyEditorialCreatorV069');
  assert(mon.status === 'CREATED' && toJstDateKey(closedRun.queue.data.find((x) => x.content_id === mon.content_id).run_date) === '2026-10-05', 'Editorial runs on Monday (shop closed) to prepare Tuesday');
}

section('8. Capacity, closed days, disabled');
{
  const full = queueRows().filter((r) => r.content_id !== OXY02);
  for (let i = 0; i < 5; i += 1) full.push({ queue_id: `X${i}`, run_date: `2026/09/2${i}`, content_id: `BLOG-X${i}`, queue_status: 'REVIEW_READY', topic_candidate_id: `X${i}`, primary_query: `x${i}` });
  const capped = sandbox({ queueRows: full, evidence: {} });
  const r = capped.tick('scheduledDailyEditorialCreatorV069');
  assert(r.status === 'NO_ACTION' && r.reason === 'ACTIVE_CAP_REACHED' && capped.queue.data.length === full.length, '5/5 active -> no new row');
  const fri = sandbox({ now: '2026-10-01T06:00:00+09:00' });
  assert(fri.tick('scheduledDailyEditorialCreatorV069').reason === 'CLOSED_DAY' && fri.line.length === 0, 'Friday (closed) -> no row, no alert');
  const off = sandbox({ settings: { ...SETTINGS, daily_editorial_enabled: 0 } });
  assert(off.tick('scheduledDailyEditorialCreatorV069').reason === 'DISABLED', 'daily_editorial_enabled=0 respected');
}

section('9. Failures are loud, never silent, never "success"');
{
  const unwired = sandbox({ supervisorWired: false });
  const r = unwired.tick('scheduledDailyEditorialCreatorV069');
  const last = unwired.logs[unwired.logs.length - 1];
  assert(r.status === 'ERROR_BLOCKED' && r.kind === 'SUPERVISOR_NOT_WIRED' && unwired.queue.data.length === queueRows().length, 'Supervisor missing -> fail closed, no orphan row');
  assert(last.status === 'ERROR_BLOCKED' && unwired.line.length === 1 && /Supervisor/.test(unwired.line[0]), 'ERROR_BLOCKED logged + LINE');

  const exhausted = sandbox({ shortlistRows: shortlistRows().map((x) => ({ ...x, status: 'SELECTED' })) });
  const e = exhausted.tick('scheduledDailyEditorialCreatorV069');
  assert(e.status === 'ERROR_BLOCKED' && e.kind === 'NO_ELIGIBLE_CANDIDATE' && exhausted.line.length === 1, 'shortlist exhausted -> ERROR_BLOCKED + LINE');
  exhausted.setNow('2026-10-02T06:00:00+09:00');
  exhausted.tick('scheduledDailyEditorialCreatorV069');
  assert(exhausted.line.length === 1, 'blocked alert is sent once per day');
  exhausted.setNow('2026-10-02T08:10:00+09:00');
  exhausted.tick('scheduledDailyEditorialGateV069');
  const wd = exhausted.tick('scheduledDailyEditorialWatchdogV069');
  assert(wd.status === 'ERROR_BLOCKED' && wd.notification.status === 'ALREADY_SENT' && exhausted.line.length === 1, 'Watchdog still flags the missed day but does not send a second LINE');

  const onlyPerformance = sandbox({ shortlistRows: shortlistRows().map((x) => ({ ...x, status: 'CANDIDATE', week_start: '2026/09/28', content_pillar: 'PERFORMANCE', editorial_lane: 'PERFORMANCE', content_cluster: '', topic_candidate_id: undefined })).filter((x) => x.route_lane === 'WEB_BLOG' && x.decision === 'PUBLISH') });
  const p = onlyPerformance.tick('scheduledDailyEditorialCreatorV069');
  assert(p.kind === 'INTERVIEW_REQUIRED' && onlyPerformance.queue.data.length === queueRows().length, 'only Interview-needing candidates -> ERROR_BLOCKED, never guessed SUFFICIENT');

  const down = sandbox({ bridgeDown: true });
  const d = down.tick('scheduledDailyEditorialCreatorV069');
  assert(d.kind === 'CREATOR_PLAN_FAILED' && down.line.length === 1 && down.queue.data.length === queueRows().length, 'Bridge outage -> ERROR_BLOCKED + LINE, no partial row');

  const lost = sandbox({ dropAppends: true });
  const l = lost.tick('scheduledDailyEditorialCreatorV069');
  const lostLog = lost.logs.filter((x) => x.job === 'DAILY_EDITORIAL_CREATE').pop();
  assert(l.status === 'ERROR_BLOCKED' && lostLog.status === 'ERROR_BLOCKED' && !lost.props['THE_REV_DAILY_CREATED_2026-10-03'], 'append that does not persist is NOT reported as CREATED');
  assert(lost.shortlist.data.every((x) => x.status !== 'SELECTED' || x.candidate_id === 'BT-20260930-OXY-02' || x.candidate_id.startsWith('BT-2026092') || x.candidate_id.startsWith('BT-2026091') || x.candidate_id === 'BT-20260928-01'), 'candidate not consumed when the write failed');

  const lineDown = sandbox({ lineOk: false });
  const ld = lineDown.tick('scheduledDailyEditorialCreatorV069');
  assert(ld.status === 'CREATED' && lineDown.queue.data.length === queueRows().length + 1, 'LINE outage never blocks content creation');
}

section('9b. REVIEW_REQUIRED caused only by a near-miss STANDARD length gate self-heals');
{
  const h = sandbox({ now: '2026-10-03T18:40:00+09:00' });
  h.queue.header.push('target_date');
  h.queue.data.push({
    queue_id: 'DQ-20261003-002',
    run_date: '2026/10/03',
    target_date: '2026/10/04',
    content_id: 'BLOG-20261004-c44065',
    topic_candidate_id: 'BT-20260928-05',
    queue_status: 'REVIEW_REQUIRED',
    knowledge_gate: 'SUFFICIENT',
    interview_required: false,
    interview_status: 'NOT_REQUIRED',
    draft_status: 'REVIEW_REQUIRED',
    image_status: 'NOT_STARTED',
    last_error: 'STANDARD length gate failed: 1538 chars',
    notes: 'initial',
    updated_at: '2026-10-03T09:38:13.000Z'
  });
  const r = h.tick('runDailyEditorialCreatorV069Once');
  const row = h.queue.data.find((x) => x.content_id === 'BLOG-20261004-c44065');
  assert(r.length_recovery?.status === 'REQUEUED' && row.queue_status === 'PATCHING' && row.draft_status === 'NOT_STARTED', '1538/1600 near-miss is requeued automatically instead of waiting for a human');
  assert(/\[AUTO_LENGTH_RETRY:1\]/.test(row.notes) && row.last_error === '', 'requeue records the bounded retry and clears only the length error');
  row.queue_status = 'REVIEW_REQUIRED'; row.draft_status = 'REVIEW_REQUIRED'; row.last_error = 'STANDARD length gate failed: 1545 chars';
  h.tick('runDailyEditorialCreatorV069Once');
  assert(/\[AUTO_LENGTH_RETRY:2\]/.test(row.notes), 'second bounded length retry is allowed');
  row.queue_status = 'REVIEW_REQUIRED'; row.draft_status = 'REVIEW_REQUIRED'; row.last_error = 'STANDARD length gate failed: 1550 chars';
  const third = h.tick('runDailyEditorialCreatorV069Once');
  assert(third.length_recovery?.status === 'HUMAN_REVIEW_REQUIRED' && row.queue_status === 'REVIEW_REQUIRED', 'third length failure stops fail-closed for human review');
  const factual = sandbox({ now: '2026-10-03T18:40:00+09:00' });
  factual.queue.data.push({
    content_id: 'BLOG-fact',
    queue_status: 'REVIEW_REQUIRED',
    draft_status: 'REVIEW_REQUIRED',
    last_error: 'Final Editor / Fact / Topic Gate requires review',
    notes: ''
  });
  const fr = factual.tick('runDailyEditorialCreatorV069Once');
  assert(fr.length_recovery?.status === 'NO_LENGTH_RECOVERY' && factual.queue.data.find((x) => x.content_id === 'BLOG-fact').queue_status === 'REVIEW_REQUIRED', 'fact/editor review is never auto-bypassed');
}

section('10. Stuck detection after creation');
{
  const h = sandbox();
  const created = h.tick('scheduledDailyEditorialCreatorV069');
  h.setNow('2026-10-02T06:00:00+09:00');
  const r = h.tick('scheduledDailyEditorialCreatorV069');
  assert(r.status === 'NO_ACTION' && r.stuck.some((s) => s.reason === 'SUPERVISOR_NOT_PICKING_UP' && s.content_id === created.content_id), 'new row not picked up by the Supervisor -> stuck alert', JSON.stringify(r.stuck));
  assert(h.line.some((l) => /進行が止まっています/.test(l)), 'stuck LINE sent');
  const n = h.line.length;
  h.setNow('2026-10-02T07:00:00+09:00');
  h.tick('scheduledDailyEditorialCreatorV069');
  assert(h.line.length === n, 'stuck alert is not repeated within the day');

  const now = at('2026-10-02T12:00:00+09:00');
  const old = (m) => new Date(now.getTime() - m * 60000).toISOString();
  const found = detectStuckRows({
    now,
    settings: SETTINGS,
    rows: [
      { content_id: 'a', queue_status: 'DRAFTING', draft_status: 'NOT_STARTED', updated_at: old(11) },
      { content_id: 'b', queue_status: 'DRAFTING', draft_status: 'NOT_STARTED', updated_at: old(5) },
      { content_id: 'c', queue_status: 'QC', draft_status: 'QC', updated_at: old(45) },
      { content_id: 'd', queue_status: 'QC', draft_status: 'QC', updated_at: old(20) },
      { content_id: 'e', queue_status: 'IMAGE_PREPARING', updated_at: old(60 * 7) },
      { content_id: 'f', queue_status: 'IMAGE_PREPARING', updated_at: old(60 * 3) },
      { content_id: 'g', queue_status: 'REVIEW_READY', updated_at: old(60 * 72) },
      { content_id: 'h', queue_status: 'INTERVIEW_WAITING', updated_at: old(60 * 72) },
      { content_id: 'i', queue_status: 'ERROR', updated_at: old(1) }
    ]
  });
  assert(found.map((s) => s.content_id).join(',') === 'a,c,e,i', 'stuck rules: pickup 10m, stage 30m, image 6h, ERROR; human waits never stuck', found.map((s) => s.content_id).join(','));
  assert(toEpochMs('2026/10/03 05:00') === Date.parse('2026-10-03T05:00:00+09:00') && toEpochMs(46298.25) === Date.parse('2026-10-03T06:00:00+09:00'), 'Sheets naive/serial timestamps are JST');
}

section('12. LIVE 2026-10-03 afternoon snapshot: prepare the 10/04 article');
{
  const q = read('../editorial/fixtures/daily-queue-2026-10-03-pm-snapshot.json');
  const sl = read('../editorial/fixtures/blog-shortlist-2026-10-03-pm-snapshot.json');
  const live = createGasSandbox({ now: '2026-10-03T16:30:00+09:00', queueColumns: q.columns, queueRows: clone(q.rows), shortlistColumns: sl.columns, shortlistRows: clone(sl.rows), settings: SETTINGS, evidence: {} });
  assert(!q.rows.some((r) => targetOf(r) === '2026-10-04') && q.rows.some((r) => r.content_id === 'BLOG-20261003-570c55'), 'precondition: 10/03 article exists, no 10/04 row');
  assert(live.tick('scheduledDailyEditorialCreatorV069').status === 'OUTSIDE_WINDOW', 'hourly trigger is outside its window at 16:30');
  const r = live.tick('runDailyEditorialCreatorV069Once');
  const row = live.queue.data.find((x) => x.content_id === r.content_id);
  assert(r.status === 'CREATED' && r.candidate_id === 'BT-20260928-05' && r.content_id === 'BLOG-20261004-c44065', 'Creator selects BT-20260928-05 by its own rules (FAC-01 is already used)', JSON.stringify(r).slice(0, 200));
  assert(toJstDateKey(row.run_date) === '2026-10-03' && targetOf(row) === '2026-10-04' && row.queue_id === 'DQ-20261003-002', 'run_date 10/03, target_date 10/04, queue_id does not collide with DQ-20261003-001');
  assert(live.queue.data.filter((x) => toJstDateKey(x.run_date) === '2026-10-03').length === 2 && live.queue.data.filter((x) => targetOf(x) === '2026-10-03').length === 1, "today's own article is not duplicated");
  assert(v0652NoInterviewSelector(row), 'deployed Supervisor selector accepts the live row');
  assert(live.tick('runDailyEditorialCreatorV069Once').status === 'NO_ACTION', 'second run is a no-op');
  live.setNow('2026-10-03T16:32:00+09:00');
  supervisorModel(live, { imageReady: false });
  live.setNow('2026-10-03T18:00:00+09:00');
  supervisorModel(live, { imageReady: true });
  assert(row.queue_status === 'REVIEW_READY' && live.line.some((l) => l === 'SUPERVISOR_REVIEW_READY BLOG-20261004-c44065'), '10/04 article reaches REVIEW_READY and is announced the same day');
}

section('12b. Production trigger layout: v0.6.7 Supervisor + one-call start');
{
  const q = read('../editorial/fixtures/daily-queue-2026-10-03-pm-snapshot.json');
  const sl = read('../editorial/fixtures/blog-shortlist-2026-10-03-pm-snapshot.json');
  const mk = (extra) => createGasSandbox({ now: '2026-10-03T18:10:00+09:00', queueColumns: q.columns, queueRows: clone(q.rows), shortlistColumns: sl.columns, shortlistRows: clone(sl.rows), settings: SETTINGS, evidence: {}, ...extra });
  const v067 = mk({ supervisorTrigger: 'scheduledDailyEditorialSupervisorV067' });
  const started = v067.tick('startDailyEditorialAutonomyV069');
  assert(started.status === 'STARTED' && started.first_run.status === 'CREATED' && started.first_run.content_id === 'BLOG-20261004-c44065', 'Supervisor installed as V067 (v0.6.7 patch) is accepted; one call installs and prepares 10/04', JSON.stringify(started).slice(0, 300));
  assert(['scheduledDailyEditorialGateV069', 'scheduledDailyEditorialWatchdogV069', 'scheduledDailyEditorialCreatorV069'].every((t) => v067.installedTriggers.includes(t)) && v067.installedTriggers.length === 3, 'Gate, Watchdog and Creator triggers are installed exactly once');
  v067.tick('startDailyEditorialAutonomyV069');
  assert(v067.installedTriggers.length === 3 && v067.queue.data.filter((x) => targetOf(x) === '2026-10-04').length === 1, 're-running start is idempotent (no duplicate triggers, no duplicate row)');
  assert(v067.props.EDITORIAL_STATUS_BASE_URL === 'https://the-rev-website.vercel.app', 'installer pins the legacy v0.6.8 status base to production');
  const ledgerOnly = mk({ supervisorWired: false });
  let threw = '';
  try { ledgerOnly.tick('startDailyEditorialAutonomyV069'); } catch (e) { threw = String(e.message || e); }
  assert(/Supervisor is not wired/.test(threw) && ledgerOnly.queue.data.length === q.rows.length, 'the v0.6.8 ledger trigger alone is not a Supervisor: install refuses, nothing is created');
}

section('13. Bridge dates the article by its target day');
{
  const f = resolveEditorialPublishedDate;
  assert(f({ contentId: 'BLOG-20261004-c44065', published: '2026-10-03' }) === '2026-10-04', 'Supervisor sends run day 10/03 -> article dated target day 10/04');
  assert(f({ contentId: 'BLOG-20260930-oxy02', published: '2026-09-30' }) === '2026-09-30', 'same-day ids are unchanged');
  assert(f({ contentId: 'BLOG-20260914-b64a18', published: '2026-09-19' }) === '2026-09-19', 'never moves a date backwards');
  assert(f({ contentId: 'BLOG-20261104-abc123', published: '2026-10-03' }) === '2026-10-03', 'ignores ids more than 7 days ahead');
  assert(f({ contentId: 'manual-draft', published: '2026-10-03' }) === '2026-10-03' && f({ contentId: 'BLOG-20261004-a', published: undefined }) === undefined, 'non-Creator ids and empty dates pass through');
}

section('14. Auto-Publish Safety Gate (OFF)');
{
  const ready = { queue_status: 'REVIEW_READY', draft_status: 'READY', image_status: 'READY', web_bridge_status: 'PREVIEW_READY', review_url: 'https://x' };
  assert(autoPublishGate({ env: {}, settings: {} }).reason === AUTO_PUBLISH_REASON.DISABLED_ENV, 'default: env key off -> never publishes');
  assert(autoPublishGate({ env: { AUTO_PUBLISH_ENABLED: 'TRUE' }, settings: { auto_publish: true } }).allowed === false, "only the exact string 'true' enables the env key");
  assert(autoPublishGate({ env: { AUTO_PUBLISH_ENABLED: 'true' }, settings: { auto_publish: 0 } }).reason === AUTO_PUBLISH_REASON.DISABLED_SETTING, 'second key (08_SETTINGS auto_publish) is required');
  const both = autoPublishGate({ env: { AUTO_PUBLISH_ENABLED: 'true' }, settings: { auto_publish: 1 }, queueRow: ready, gbpRowExists: true });
  assert(both.allowed === false && both.reason === AUTO_PUBLISH_REASON.NO_EXECUTOR && both.mode === 'HUMAN_APPROVAL', 'both keys on: still human-only, no executor is installed');
  const future = (extra) => autoPublishGate({ env: { AUTO_PUBLISH_ENABLED: 'true' }, settings: { auto_publish: 1 }, executorInstalled: true, queueRow: ready, gbpRowExists: true, ...extra });
  assert(future({}).allowed === true && future({ queueRow: { ...ready, image_status: 'PREPARING' } }).reason === AUTO_PUBLISH_REASON.QUALITY_GATES_INCOMPLETE && future({ gbpRowExists: false }).allowed === false && future({ queueRow: { ...ready, queue_status: 'IMAGE_PREPARING' } }).reason === AUTO_PUBLISH_REASON.NOT_REVIEW_READY, 'a future executor would still need every quality gate');
  const payload = computeDailyPayload({ body: { action: 'daily_create', now: '2026-10-03T16:30:00+09:00', rows: [], shortlist: [], settings: { auto_publish: 0 } } });
  assert(payload.publish_gate.allowed === false && payload.publish_requires_human_approval === true, 'Bridge reports the gate; human approval required');
}

section('11. Contract and docs reference the Creator');
{
  const contract = read('../editorial/daily-editorial-state-contract.json');
  assert(contract.daily_creator?.executable === 'editorial/gas/DailyEditorialCreator_v0.6.9.gs', 'contract names the executable Creator');
  assert(fs.existsSync(new URL('../editorial/DAILY_CREATOR_RUNBOOK.md', import.meta.url)), 'Creator runbook exists');
}

console.log('\n──────────────────────────────');
console.log(`  PASS ${passed} / FAIL ${failures.length}`);
if (failures.length) {
  console.log('  FAILED:\n   - ' + failures.join('\n   - '));
  process.exit(1);
}
console.log('  Daily Creator integration: PASS');
