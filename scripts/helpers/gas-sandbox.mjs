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

function sheet(name, columns, objects) {
  return { name, header: [...columns], data: objects.map((o) => ({ ...o })) };
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

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(state.now.getTime()); }
    static now() { return state.now.getTime(); }
  }

  const supervisorStubs = {};
  if (supervisorWired) SUPERVISOR_FNS.forEach((n) => { supervisorStubs[n] = () => ({}); });

  const sandbox = {
    Date: FakeDate,
    JSON, Math, Object, String, Number, Array, isNaN, Error,
    ...supervisorStubs,
    ss_: () => ({ getSheetByName: (n) => sheets[n] || null }),
    getObjectsWithRow_: (sh) => sh.data.map((o, i) => ({ ...o, __row: i + 2 })),
    setObjectRow_: (sh, row, obj) => {
      Object.keys(obj).forEach((k) => {
        if (!sh.header.includes(k)) throw new Error(`Unknown column "${k}" in ${sh.name}`);
      });
      Object.assign(sh.data[row - 2], obj);
    },
    appendObjectRow_: (sh, obj) => {
      Object.keys(obj).forEach((k) => {
        if (!sh.header.includes(k)) throw new Error(`Unknown column "${k}" in ${sh.name}`);
      });
      if (dropAppends && sh.name === queue.name) return;
      sh.data.push({ ...obj });
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
      getProjectTriggers: () => (supervisorWired ? [{ getHandlerFunction: () => 'scheduledDailyEditorialSupervisorV065' }] : [])
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
    sandbox, sheets, queue, shortlist, bridge, gbp, logs, line, props, bridgeCalls, state,
    setNow(iso) { state.now = new RealDate(iso); },
    tick(fnName) { return sandbox[fnName](); }
  };
}
