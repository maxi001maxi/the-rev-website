// In-memory Apps Script sandbox for the Daily Editorial GAS sources.
//
// Loads the versioned GAS files into a vm context with mocked Sheets, Script
// Properties, triggers, LINE and the Vercel Bridge. The Bridge mock runs the
// REAL computeDailyPayload() (Gate -> Creator) on the exact request GAS sends,
// with publication evidence injected, so tests exercise
// the same planning code as production without network access.

import fs from 'node:fs';
import vm from 'node:vm';
import { toJstDateKey } from '../../lib/dailyEditorialStateMachine.mjs';
import { computeDailyPayload } from '../../api/integrations/editorial-status.mjs';

const GAS_DIR = new URL('../../editorial/gas/', import.meta.url);
export const GAS_FILES = ['DailyEditorialGate_v0.6.9.gs', 'DailyEditorialCreator_v0.6.9.gs'];

// Minimal Sheet double: header row + object rows, with the few Range calls the
// GAS sources use directly (reading / extending the header row).
function sheet(name, columns, objects) {
  const sh = { name, header: [...columns], data: objects.map((o) => ({ ...o })) };
  sh.getLastColumn = () => sh.header.length;
  sh.getMaxColumns = () => sh.header.length;
  sh.insertColumnsAfter = () => {};
  sh.getRange = (row, col, _rows, cols) => ({
    getValues: () => [sh.header.slice(col - 1, col - 1 + (cols || 1))],
    setValue: (v) => { if (row === 1) sh.header[col - 1] = v; }
  });
  return sh;
}

function jstParts(ms) {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  return { hour: d.getUTCHours() };
}

export const SUPERVISOR_FNS = [
  'v065ResumeNoInterviewSelf_', 'v065PollImage_', 'v065NotifyReviewReady_',
  'generateWebBlogDraft_', 'finalizeWebBlog_', 'generateGBPFromBlog_', 'v065SyncBridgeDirect_'
];

export function createGasSandbox({
  now,
  queueColumns,
  queueRows,
  shortlistColumns,
  shortlistRows,
  settings = {},
  evidence = {},
  supervisorWired = true,
  supervisorTrigger = 'scheduledDailyEditorialSupervisorV065',
  lineOk = true,
  bridgeDown = false,
  dropAppends = false,
  afterBridge = null,
  extraGbpRows = []
}) {
  const state = { now: new Date(now) };
  const queue = sheet('26_DAILY_EDITORIAL_QUEUE', queueColumns, queueRows);
  const shortlist = sheet('23_BLOG_TOPIC_SHORTLIST', [...new Set([...shortlistColumns, 'notes'])], shortlistRows);
  const bridge = sheet('25_WEB_PUBLISH_BRIDGE', ['content_id', 'bridge_status', 'published_url', 'action', 'synced_at', 'notes'], []);
  const gbp = sheet('22_GBP_POST', ['content_id', 'parent_blog_id', 'blog_url_placeholder', 'body_copy_paste', 'post_ready', 'status', 'notes'], extraGbpRows);
  const sheets = { [queue.name]: queue, [shortlist.name]: shortlist, [bridge.name]: bridge, [gbp.name]: gbp };
  const logs = [];
  const line = [];
  const props = {
    EDITORIAL_BRIDGE_SECRET: 'test-secret',
    THE_REV_LINE_CHANNEL_ACCESS_TOKEN: 't',
    THE_REV_LINE_USER_ID: 'u'
  };
  const bridgeCalls = [];
  const installedTriggers = [];

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(state.now.getTime()); }
    static now() { return state.now.getTime(); }
  }

  const supervisorStubs = {};
  if (supervisorWired) SUPERVISOR_FNS.forEach((n) => { supervisorStubs[n] = () => ({}); });

  const sandbox = {
    Date: FakeDate,
    JSON, Math, Object, String, Number, Array, isNaN, Error, RegExp, console: { log: () => {} },
    ...supervisorStubs,
    ss_: () => ({ getSheetByName: (n) => sheets[n] || null }),
    getObjectsWithRow_: (sh) => sh.data.map((o, i) => ({ ...o, __row: i + 2 })),
    // Same semantics as the production helpers (GAS v0.3.3 source): keys that
    // are not in the header row are silently dropped.
    setObjectRow_: (sh, row, obj) => {
      Object.keys(obj).forEach((k) => { if (sh.header.includes(k)) sh.data[row - 2][k] = obj[k]; });
    },
    appendObjectRow_: (sh, obj) => {
      if (dropAppends && sh.name === queue.name) return;
      const out = {};
      sh.header.forEach((k) => { if (k) out[k] = obj[k] === undefined || obj[k] === null ? '' : obj[k]; });
      sh.data.push(out);
    },
    getSettings_: () => settings,
    startAutomationLog_: (job, trigger) => { logs.push({ job, trigger, status: 'START' }); return `run-${logs.length}`; },
    finishAutomationLog_: (runId, status, count, summary, error) => {
      const start = logs.find((l) => l.status === 'START' && `run-${logs.indexOf(l) + 1}` === runId);
      logs.push({ job: start?.job, runId, status, count, summary, error });
    },
    errorText_: (e) => String((e && e.message) || e),
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      formatDate: (d, _tz, fmt) => (fmt === 'H' ? String(jstParts(d.getTime()).hour) : toJstDateKey(d))
    },
    ScriptApp: {
      getProjectTriggers: () => [
        ...(supervisorWired ? [supervisorTrigger] : []),
        'scheduledEditorialAssetLedgerSyncV068',
        ...installedTriggers
      ].map((h) => ({ getHandlerFunction: () => h })),
      deleteTrigger: (t) => { const i = installedTriggers.indexOf(t.getHandlerFunction()); if (i >= 0) installedTriggers.splice(i, 1); },
      newTrigger: (handler) => {
        const b = { timeBased: () => b, atHour: () => b, everyDays: () => b, everyHours: () => b, inTimezone: () => b, create: () => { installedTriggers.push(handler); return b; } };
        return b;
      }
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => body, getAllHeaders: () => ({}) });
        if (url.includes('api.line.me')) {
          line.push(JSON.parse(opts.payload).messages[0].text);
          return res(lineOk ? 200 : 500, '');
        }
        if (bridgeDown) return res(503, '{"message":"down"}');
        if (opts.headers.Authorization !== 'Bearer test-secret') return res(401, '{}');
        const body = JSON.parse(opts.payload);
        bridgeCalls.push(body.action);
        // The exact request GAS built runs through the real Gate + Creator.
        const payload = JSON.stringify(computeDailyPayload({ body, evidenceByContentId: evidence }));
        if (afterBridge) afterBridge({ queue, state });
        return res(200, payload);
      }
    }
  };

  vm.createContext(sandbox);
  GAS_FILES.forEach((f) => vm.runInContext(fs.readFileSync(new URL(f, GAS_DIR), 'utf8'), sandbox, { filename: f }));

  return {
    sandbox, sheets, queue, shortlist, bridge, gbp, logs, line, props, bridgeCalls, state, installedTriggers,
    setNow(iso) { state.now = new RealDate(iso); },
    tick(fnName) { return sandbox[fnName](); }
  };
}
