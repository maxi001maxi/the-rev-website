import { getAuthedContext, sendError } from '../../lib/supabaseAdmin.mjs';
import {
  CTA_EVENTS,
  parseServiceAccount,
  resolveDateRange,
  getServiceAccountAccessToken,
  runGa4Report,
  normalizeSummary,
  normalizeTopPages,
  normalizeTraffic,
  normalizeDevice,
  normalizeNewReturning,
  normalizeEvents,
  normalizeRealtime,
  percentChange
} from '../../lib/ga4Data.mjs';

function directConfig() {
  const propertyId = String(process.env.GA4_PROPERTY_ID || '').trim();
  const serviceAccountRaw = String(process.env.GA4_SERVICE_ACCOUNT_JSON || '').trim();
  return {
    propertyId,
    serviceAccountRaw,
    configured: Boolean(propertyId && serviceAccountRaw)
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

  const cfg = directConfig();
  if (!cfg.configured) {
    return sendError(
      res,
      503,
      'ga4_direct_not_configured',
      'GA4の直接読み取り接続が未設定です。'
    );
  }

  const range = resolveDateRange(String(req.query?.range || '7d'));

  try {
    const serviceAccount = parseServiceAccount(cfg.serviceAccountRaw);
    const accessToken = await getServiceAccountAccessToken(serviceAccount);

    const summaryBody = (dateRange) => ({
      dateRanges: [dateRange],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'newUsers' },
        { name: 'totalUsers' }
      ]
    });

    const [
      currentSummaryReport,
      previousSummaryReport,
      topPagesReport,
      trafficReport,
      deviceReport,
      newReturningReport,
      eventReport
    ] = await Promise.all([
      runGa4Report({ propertyId: cfg.propertyId, accessToken, body: summaryBody(range.current) }),
      runGa4Report({ propertyId: cfg.propertyId, accessToken, body: summaryBody(range.previous) }),
      runGa4Report({
        propertyId: cfg.propertyId,
        accessToken,
        body: {
          dateRanges: [range.current],
          dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 10
        }
      }),
      runGa4Report({
        propertyId: cfg.propertyId,
        accessToken,
        body: {
          dateRanges: [range.current],
          dimensions: [{ name: 'sessionSourceMedium' }],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10
        }
      }),
      runGa4Report({
        propertyId: cfg.propertyId,
        accessToken,
        body: {
          dateRanges: [range.current],
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 10
        }
      }),
      runGa4Report({
        propertyId: cfg.propertyId,
        accessToken,
        body: {
          dateRanges: [range.current],
          dimensions: [{ name: 'newVsReturning' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 10
        }
      }),
      runGa4Report({
        propertyId: cfg.propertyId,
        accessToken,
        body: {
          dateRanges: [range.current],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              inListFilter: { values: CTA_EVENTS }
            }
          },
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
          limit: 50
        }
      })
    ]);

    const current = normalizeSummary(currentSummaryReport);
    const previous = normalizeSummary(previousSummaryReport);

    let realtime = null;
    let realtimeStatus = 'VALUE';
    try {
      realtime = normalizeRealtime(await runGa4Report({
        propertyId: cfg.propertyId,
        accessToken,
        realtime: true,
        body: {
          metrics: [
            { name: 'activeUsers' },
            { name: 'eventCount' },
            { name: 'screenPageViews' }
          ]
        }
      }));
    } catch {
      realtimeStatus = 'DELAYED';
    }

    return res.status(200).json({
      range: { key: range.key, label: range.label },
      generatedAt: new Date().toISOString(),
      provider: 'google-analytics-data-api-direct',
      propertyId: cfg.propertyId,
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
      realtime,
      realtimeStatus,
      topPages: normalizeTopPages(topPagesReport),
      traffic: normalizeTraffic(trafficReport),
      devices: normalizeDevice(deviceReport),
      audience: normalizeNewReturning(newReturningReport),
      events: normalizeEvents(eventReport)
    });
  } catch (error) {
    console.error('[admin/analytics] direct GA4 request failed:', error?.message || 'unknown');
    return sendError(
      res,
      502,
      'ga4_direct_api_error',
      'GA4 Data APIからデータを取得できませんでした。直接読み取り接続をご確認ください。'
    );
  }
}
