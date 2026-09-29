import { createClient } from '@supabase/supabase-js';
import { getAuthedContext, sendError } from '../../lib/supabaseAdmin.mjs';
import { buildDailyManagerSnapshot, jstDateKey, validBusinessDate } from '../../lib/dailyManager.mjs';

function optionalInt(value, field) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 1000) {
    const error = new Error(`invalid_${field}`);
    error.code = 'validation_error';
    throw error;
  }
  return n;
}

function serviceClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function requireActiveAdmin(req, res) {
  const ctx = await getAuthedContext(req);
  if (ctx.error) {
    sendError(res, ctx.status, ctx.error, ctx.error === 'unauthorized' ? 'ログインが必要です。' : 'Admin認証が未設定です。');
    return null;
  }
  const { data: member, error } = await ctx.supabase
    .from('admin_members').select('active').eq('user_id', ctx.user.id).maybeSingle();
  if (error || !member?.active) {
    sendError(res, 403, 'forbidden', 'Daily Managerの利用権限がありません。');
    return null;
  }
  return ctx;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const ctx = await requireActiveAdmin(req, res);
  if (!ctx) return;

  const queryDate = String(req.query?.date || jstDateKey());
  if (!validBusinessDate(queryDate)) return sendError(res, 400, 'invalid_date', '日付が不正です。');

  if (req.method === 'GET') {
    const [{ data: input, error: inputError }, { data: snapshot, error: snapshotError }] = await Promise.all([
      ctx.supabase.from('daily_manager_inputs').select('*').eq('business_date', queryDate).maybeSingle(),
      ctx.supabase.from('daily_manager_snapshots').select('*').eq('business_date', queryDate).maybeSingle()
    ]);
    if (inputError || snapshotError) return sendError(res, 500, 'read_failed', 'Daily Managerデータを取得できませんでした。');
    return res.status(200).json({ businessDate: queryDate, input, snapshot });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'method_not_allowed', 'GET / POSTのみ利用できます。');
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return sendError(res, 400, 'invalid_json', '入力形式が不正です。'); }
  }
  const action = String(body?.action || 'save_input');
  const businessDate = String(body?.business_date || queryDate);
  if (!validBusinessDate(businessDate)) return sendError(res, 400, 'invalid_date', '日付が不正です。');

  if (action === 'save_input') {
    try {
      const payload = {
        business_date: businessDate,
        planned_sessions: optionalInt(body?.planned_sessions, 'planned_sessions'),
        cancel_count: optionalInt(body?.cancel_count, 'cancel_count') ?? 0,
        same_day_additions: optionalInt(body?.same_day_additions, 'same_day_additions') ?? 0,
        actual_sessions: optionalInt(body?.actual_sessions, 'actual_sessions'),
        trial_sessions: optionalInt(body?.trial_sessions, 'trial_sessions'),
        notes: body?.notes ? String(body.notes).slice(0, 1000) : null,
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await ctx.supabase
        .from('daily_manager_inputs')
        .upsert(payload, { onConflict: 'business_date' })
        .select('*').single();
      if (error) throw error;
      return res.status(200).json({ input: data });
    } catch (error) {
      if (error?.code === 'validation_error') return sendError(res, 422, 'validation_error', '0以上の整数で入力してください。');
      console.error('[daily-manager] input save failed:', error?.message || 'unknown');
      return sendError(res, 500, 'write_failed', '日次入力を保存できませんでした。');
    }
  }

  if (action === 'run' || action === 'finalize') {
    const service = serviceClient();
    if (!service) return sendError(res, 503, 'service_not_configured', 'Daily Managerのサーバー設定が未完了です。');
    try {
      const snapshot = await buildDailyManagerSnapshot({
        supabase: service,
        businessDate,
        finalize: action === 'finalize'
      });
      return res.status(200).json({ snapshot });
    } catch (error) {
      console.error('[daily-manager] snapshot failed:', error?.code || error?.message || 'unknown');
      return sendError(res, 502, 'snapshot_failed', 'Daily Managerの集計に失敗しました。');
    }
  }

  return sendError(res, 400, 'invalid_action', 'actionが不正です。');
}
