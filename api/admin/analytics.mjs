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

  const propertyId = String(process.env.GA4_PROPERTY_ID || '').trim();
  const serviceAccountRaw = process.env.GA4_SERVICE_ACCOUNT_JSON || '';
  if (!propertyId || !serviceAccountRaw) {
    return sendError(
      res,
      503,
      'analytics_not_configured',
      'GA4 Data APIの環境変数が未設定です。'
    );
  }

  const range = resolveDateRange(String(req.query?.range || '7d'));

  try {
    const serviceAccount = parseServiceAccount(serviceAccountRaw);
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
      runGa4Report({ propertyId, accessToken, body: summaryBody(range.current) }),
      runGa4Report({ propertyId, accessToken, body: summaryBody(range.previous) }),
      runGa4Report({
        propertyId,
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
        propertyId,
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
        propertyId,
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
        propertyId,
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
        propertyId,
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
          limit: 20
        }
      })
    ]);

    const current = normalizeSummary(currentSummaryReport);
    const previous = normalizeSummary(previousSummaryReport);

    let realtime = null;
    try {
      realtime = normalizeRealtime(await runGa4Report({
        propertyId,
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
      // Realtimeが一時的に利用できなくても通常レポート全体は表示する。
    }

    return res.status(200).json({
      range: { key: range.key, label: range.label },
      generatedAt: new Date().toISOString(),
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
      topPages: normalizeTopPages(topPagesReport),
      traffic: normalizeTraffic(trafficReport),
      devices: normalizeDevice(deviceReport),
      audience: normalizeNewReturning(newReturningReport),
      events: normalizeEvents(eventReport)
    });
  } catch (error) {
    console.error('[admin/analytics] GA4 request failed:', error?.message || 'unknown');
    return sendError(
      res,
      502,
      'ga4_api_error',
      'GA4 Data APIからデータを取得できませんでした。設定・権限をご確認ください。'
    );
  }
}
