// 外部サービス（Supabase / Google Sheets / Search Console / GitHub Issue / LINE）。
// 秘密情報は環境変数からだけ読む。ログに値を出さない。
import { parseGoogleServiceAccount, getGoogleAccessToken, queryGscSearchAnalytics } from '../gscDirect.mjs';
import { SHEET_ID, DELIVERY_REPO } from './config.mjs';

const env = (k) => String(process.env[k] || '').trim();
export const has = (k) => env(k) !== '';

// ---------- Supabase (PostgREST, service role) ----------
async function sb(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw Object.assign(new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です'), { kind: 'TERMINAL' });
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Supabase ${method} ${pathAndQuery.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`), { status: res.status, kind: res.status >= 500 ? 'TRANSIENT' : 'TERMINAL' });
  return text ? JSON.parse(text) : null;
}

export const db = {
  async getRun(runDate) { return (await sb(`column_auto_runs?run_date=eq.${runDate}&select=*`))[0] || null; },
  async insertRun(row) { return (await sb('column_auto_runs', { method: 'POST', body: row, prefer: 'return=representation' }))[0]; },
  async updateRun(runDate, patch) {
    return (await sb(`column_auto_runs?run_date=eq.${runDate}`, { method: 'PATCH', body: { ...patch, updated_at: new Date().toISOString() }, prefer: 'return=representation' }))[0];
  },
  async monthSpendJpy(monthPrefix) {
    const rows = await sb(`column_auto_runs?run_date=gte.${monthPrefix}-01&run_date=lte.${monthPrefix}-31&select=cost_jpy`);
    return rows.reduce((s, r) => s + Number(r.cost_jpy || 0), 0);
  },
  async recentRuns(limit = 40) { return sb(`column_auto_runs?select=run_date,slug,status,topic&order=run_date.desc&limit=${limit}`); },
  async getState(key) { return (await sb(`column_auto_state?key=eq.${encodeURIComponent(key)}&select=value`))[0]?.value ?? null; },
  async setState(key, value) {
    return sb('column_auto_state?on_conflict=key', { method: 'POST', body: { key, value, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
  },
  async draftsBrief() { return sb('admin_article_drafts?select=slug,title,category,publish_status,published,created_at&order=created_at.desc&limit=300'); },
  async draftBySlug(slug) { return (await sb(`admin_article_drafts?slug=eq.${encodeURIComponent(slug)}&select=id,slug,publish_status,source_path,source_sha,editorial_source,editorial_content_id`))[0] || null; },
  async draftByContentId(id) { return (await sb(`admin_article_drafts?editorial_source=eq.column-auto-v1&editorial_content_id=eq.${encodeURIComponent(id)}&select=id,slug,publish_status,source_path,source_sha`))[0] || null; },
  async insertDraft(row) { return (await sb('admin_article_drafts', { method: 'POST', body: row, prefer: 'return=representation' }))[0]; }
};

// ---------- Google (service account) ----------
let googleSa = null;
function serviceAccount() {
  googleSa ||= parseGoogleServiceAccount(env('GOOGLE_SERVICE_ACCOUNT_JSON'));
  return googleSa;
}
const tokens = {};
async function googleToken(scope) {
  tokens[scope] ||= await getGoogleAccessToken(serviceAccount(), scope);
  return tokens[scope];
}

export const sheets = {
  available: () => has('GOOGLE_SERVICE_ACCOUNT_JSON'),
  async get(range) {
    const t = await googleToken('https://www.googleapis.com/auth/spreadsheets');
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`, { headers: { authorization: `Bearer ${t}` } });
    if (!res.ok) throw new Error(`Sheets GET ${range.split('!')[0]} HTTP ${res.status}`);
    return (await res.json()).values || [];
  },
  async append(range, rows) {
    const t = await googleToken('https://www.googleapis.com/auth/spreadsheets');
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: JSON.stringify({ values: rows })
    });
    if (!res.ok) throw new Error(`Sheets APPEND ${range.split('!')[0]} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  },
  async update(range, rows) {
    const t = await googleToken('https://www.googleapis.com/auth/spreadsheets');
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: JSON.stringify({ values: rows })
    });
    if (!res.ok) throw new Error(`Sheets UPDATE ${range.split('!')[0]} HTTP ${res.status}`);
    return res.json();
  },
  // 見出し行の名前で列を合わせて1行追加する（列の並びが変わっても壊れない）
  async appendByHeader(tab, obj) {
    const header = (await this.get(`${tab}!1:1`))[0] || [];
    if (!header.length) throw new Error(`${tab} の見出し行が読めません`);
    const row = header.map((h) => (obj[h] === undefined || obj[h] === null ? '' : String(obj[h])));
    await this.append(`${tab}!A1`, [row]);
    return row;
  }
};

export const gsc = {
  available: () => has('GOOGLE_SERVICE_ACCOUNT_JSON'),
  async query({ startDate, endDate, dimensions, rowLimit = 1000 }) {
    const t = await googleToken('https://www.googleapis.com/auth/webmasters.readonly');
    const siteUrl = env('GSC_SITE_URL') || 'sc-domain:therev-lab.com';
    const r = await queryGscSearchAnalytics({ siteUrl, startDate, endDate, dimensions, rowLimit, accessToken: t });
    return r.rows || [];
  }
};

// ---------- GitHub Issue（受け渡し） ----------
export const delivery = {
  available: () => has('COLUMN_DELIVERY_TOKEN'),
  async createIssue({ title, body, labels = ['column-daily'] }) {
    const res = await fetch(`https://api.github.com/repos/${DELIVERY_REPO}/issues`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env('COLUMN_DELIVERY_TOKEN')}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
      body: JSON.stringify({ title, body, labels })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Issue 作成に失敗 HTTP ${res.status}: ${String(json.message || '').slice(0, 200)}`);
    return { url: json.html_url, number: json.number };
  }
};

// ---------- LINE（店長しか知らない事実を聞くときだけ） ----------
export const line = {
  available: () => has('LINE_CHANNEL_ACCESS_TOKEN') && has('LINE_USER_ID'),
  async askOwner(text) {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('LINE_CHANNEL_ACCESS_TOKEN')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to: env('LINE_USER_ID'), messages: [{ type: 'text', text: text.slice(0, 4900) }] })
    });
    if (!res.ok) throw new Error(`LINE 送信に失敗 HTTP ${res.status}`);
    return true;
  }
};
