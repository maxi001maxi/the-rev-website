import fs from 'node:fs';
import vm from 'node:vm';

const SOURCE = fs.readFileSync(
  new URL('../editorial/gas/DailyEditorialSupervisorRecovery_v0.7.1.gs', import.meta.url),
  'utf8'
);

let passed = 0;
const failures = [];
function assert(cond, name, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✕ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function harness({ queue, blogs = [], settings = {}, original }) {
  const props = {};
  const sheets = {
    '26_DAILY_EDITORIAL_QUEUE': { name: '26_DAILY_EDITORIAL_QUEUE', data: queue },
    '21_WEB_BLOG_OUTPUT': { name: '21_WEB_BLOG_OUTPUT', data: blogs }
  };
  const context = {
    console,
    Date,
    isFinite,
    ss_: () => ({ getSheetByName: (name) => sheets[name] || null }),
    getObjectsWithRow_: (sheet) => sheet.data,
    setObjectRow_: (sheet, rowNumber, patch) => {
      const row = sheet.data.find((x) => x.__row === rowNumber);
      if (!row) throw new Error('row not found');
      Object.assign(row, patch);
    },
    getSettings_: () => settings,
    errorText_: (e) => String(e?.message || e),
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => props[key] ?? null,
        setProperty: (key, value) => { props[key] = String(value); },
        deleteProperty: (key) => { delete props[key]; }
      })
    },
    v065GeneratePendingArticle_: original
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: 'DailyEditorialSupervisorRecovery_v0.7.1.gs' });
  return { context, props };
}

console.log('\n[Supervisor QC self-recovery]');

{
  const queue = [{ __row: 2, content_id: 'A', queue_status: 'DRAFTING', draft_status: 'NOT_STARTED', updated_at: new Date() }];
  const h = harness({
    queue,
    original: () => {
      Object.assign(queue[0], { queue_status: 'QC', draft_status: 'QC', updated_at: new Date() });
      return { status: 'LEGACY_BRIDGE_FAILED_AFTER_DRAFT', content_id: 'A', error: 'editor exploded' };
    }
  });
  const result = h.context.v065GeneratePendingArticle_();
  assert(result.status === 'QC_CRASH_RECOVERED', 'caught Supervisor failure is converted into a recovery result', JSON.stringify(result));
  assert(queue[0].queue_status === 'PATCHING' && queue[0].draft_status === 'NOT_STARTED', 'false QC/QC rewinds to a selector-visible retry state', JSON.stringify(queue[0]));
  assert(queue[0].failed_stage === 'BLOG_QC' && queue[0].next_stage === 'BLOG_DRAFT', 'recovery records the failed and next stages');
}

{
  const queue = [{ __row: 2, content_id: 'B', queue_status: 'DRAFTING', draft_status: 'NOT_STARTED', updated_at: new Date() }];
  const blogs = [{ __row: 2, content_id: 'B', status: 'READY', fact_check_status: 'PASS' }];
  const h = harness({
    queue,
    blogs,
    original: () => {
      Object.assign(queue[0], { queue_status: 'QC', draft_status: 'QC' });
      return { status: 'LEGACY_BRIDGE_FAILED_AFTER_DRAFT', content_id: 'B', error: 'after blog write' };
    }
  });
  const result = h.context.v065GeneratePendingArticle_();
  assert(result.qc_recovery?.status === 'QC_RECOVERED_TO_BRIDGE', 'existing READY/PASS blog is preserved instead of regenerated', JSON.stringify(result));
  assert(queue[0].queue_status === 'BRIDGE_ERROR' && queue[0].draft_status === 'READY', 'READY blog is handed to the existing Bridge recovery path', JSON.stringify(queue[0]));
}

{
  const queue = [{
    __row: 2,
    content_id: 'C',
    queue_status: 'QC',
    draft_status: 'QC',
    updated_at: new Date(Date.now() - 10 * 60_000)
  }];
  const h = harness({
    queue,
    settings: { daily_no_interview_resume_stale_minutes: 5 },
    original: () => ({ status: 'NO_DAILY_ACTION' })
  });
  const result = h.context.v065GeneratePendingArticle_();
  assert(result.status === 'QC_STALE_RECOVERED', 'stale QC from a hard timeout is repaired on a later tick', JSON.stringify(result));
  assert(queue[0].queue_status === 'PATCHING' && queue[0].draft_status === 'NOT_STARTED', 'stale QC returns to automatic retry');
}

{
  const queue = [{ __row: 2, content_id: 'D', queue_status: 'QC', draft_status: 'QC', updated_at: new Date() }];
  const h = harness({
    queue,
    settings: { daily_editorial_qc_recovery_max_attempts: 3 },
    original: () => ({ status: 'NO_DAILY_ACTION' })
  });
  h.props.THE_REV_QC_RECOVERY_COUNT_D = '3';
  const result = h.context.v071QcRecoverContent_('D', 'again');
  assert(result.status === 'QC_RECOVERY_EXHAUSTED' && result.recovered === false, 'automatic QC recovery is bounded', JSON.stringify(result));
  assert(queue[0].queue_status === 'ERROR' && queue[0].human_action_required === 'REVIEW_ERROR', 'exhaustion fails closed and becomes visible', JSON.stringify(queue[0]));
}

{
  const queue = [{ __row: 2, content_id: 'E', queue_status: 'REVIEW_REQUIRED', draft_status: 'REVIEW_REQUIRED', updated_at: new Date() }];
  const h = harness({
    queue,
    original: () => ({ status: 'LEGACY_BRIDGE_FAILED_AFTER_DRAFT', content_id: 'E', error: 'x' })
  });
  const result = h.context.v065GeneratePendingArticle_();
  assert(result.status === 'LEGACY_BRIDGE_FAILED_AFTER_DRAFT', 'legitimate non-QC state is not overwritten', JSON.stringify(result));
  assert(queue[0].queue_status === 'REVIEW_REQUIRED', 'REVIEW_REQUIRED remains untouched');
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('Failures:', failures.join(', '));
  process.exit(1);
}
