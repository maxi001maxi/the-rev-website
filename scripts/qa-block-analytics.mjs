// Test isolation only. Never import this into the public site.
export async function blockQaAnalytics(context) {
  const report = {collectionIntercepted: 0, otherWritesBlocked: 0, externalAnalyticsTransmitted: 0, ga4Receipt: 'UNVERIFIED'};
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (/google-analytics\.com$|analytics\.google\.com$/.test(url.hostname) || /\/(?:g\/)?collect(?:\/|$)/.test(url.pathname)) {
      report.collectionIntercepted++;
      await route.fulfill({status: 204, headers: {'access-control-allow-origin': '*'}, body: ''});
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method()) || /clarity\.ms$|doubleclick\.net$/.test(url.hostname)) {
      report.otherWritesBlocked++;
      await route.abort();
      return;
    }
    await route.continue();
  });
  return report;
}
