import { getAuthedContext, sendError } from '../../lib/supabaseAdmin.mjs';
import { ga4Dataset } from '../../lib/siteInsights/providers/ga4.mjs';

const JST = 'Asia/Tokyo';

function jstDateKey(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: JST,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

function resolveDateRange(input) {
  const key = ['today', '7d', '28d'].includes(input) ? input : '7d';
  const days = key === 'today' ? 1 : key === '28d' ? 28 : 7;
  const endDate = jstDateKey();
  const startDate = shiftDate(endDate, -(days - 1));
  const previousEnd = shiftDate(startDate, -1);
  const previousStart = shiftDate(previousEnd, -(days - 1));
  return {
    key,
    label: key === 'today' ? '今日' : key === '28d' ? '過去28日' : '過去7日',
    current: { startDate, endDate },
    previous: { startDate: previousStart, endDate: previousEnd }
  };
}

function percentChange(current, previous) {
  if (typeof current !== 'number' || typeof previous !== 'number') return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function summaryOf(dataset) {
  return {
    users: dataset.total.activeUsers,
    sessions: dataset.total.sessions,
    views: dataset.total.screenPageViews,
    newUsers: dataset.total.newUsers
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'method_not_allowed', 'GETのみ利用できます。');
  }

  const ctx = await getAuthedContext(req);
  if (ctx.error) {
    return sendError(
      res,
      ctx.status,
      ctx.error,
      ctx.error === 'not_configured'
        ? 'Admin認証の環境変数が設定されていません。'
        : 'ログインが必要です。'
    );
  }

  const { data: member, error: memberError } = await ctx.supabase
    .from('admin_members')
    .select('active')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (memberError || !member?.active) {
    return sendError(res, 403, 'forbidden', 'Analyticsの閲覧権限がありません。');
  }

  if (!String(process.env.GSC_WIZARD_API_KEY || '').trim()) {
    return sendError(
      res,
      503,
      'analytics_not_configured',
      'Site Insightsと共通のGA4接続が未設定です。'
    );
  }

  const range = resolveDateRange(String(req.query?.range || '7d'));

  try {
    const [currentDataset, previousDataset] = await Promise.all([
      ga4Dataset(range.current, { details: true }),
      ga4Dataset(range.previous, { details: false })
    ]);

    const current = summaryOf(currentDataset);
    const previous = summaryOf(previousDataset);

    return res.status(200).json({
      range: { key: range.key, label: range.label, ...range.current },
      generatedAt: new Date().toISOString(),
      provider: 'gsc-wizard-ga4',
      summary: {
        current,
        previous,
        change: {
          users: percentChange(current.users, previous.users),
          sessions: percentChange(current.sessions, previous.sessions),
          views: percentChange(current.views, previous.views),
          newUsers: percentChange(current.newUsers, previous.newUsers)
        }
      },
      realtime: null,
      realtimeStatus: 'NOT_SUPPORTED_BY_PROVIDER',
      topPages: currentDataset.pages.slice(0, 10).map((item) => ({
        path: item.path,
        title: item.path,
        views: item.screenPageViews,
        users: item.activeUsers
      })),
      traffic: currentDataset.sources.slice(0, 10).map((item) => ({
        sourceMedium: item.name,
        sessions: item.sessions,
        users: item.activeUsers
      })),
      devices: currentDataset.devices.slice(0, 10).map((item) => ({
        device: item.name,
        users: item.activeUsers,
        sessions: item.sessions
      })),
      audience: {
        new: current.newUsers,
        active: current.users
      },
      events: Object.entries(currentDataset.events).map(([event, count]) => ({ event, count }))
    });
  } catch (error) {
    console.error('[admin/analytics] GSC Wizard GA4 request failed:', error?.code || error?.message || 'unknown');
    return sendError(
      res,
      502,
      'ga4_api_error',
      'GA4データを取得できませんでした。Site Insightsの接続状態をご確認ください。'
    );
  }
}
