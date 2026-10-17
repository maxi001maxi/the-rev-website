import { parseServiceAccount, getServiceAccountAccessToken, runGa4Report } from './ga4Data.mjs';

const DAY = 86400000;
export const CONTROL_EXPERIMENT = Object.freeze({
  id: 'REV-EXP-2026-001',
  variant: 'control',
  surface: 'pricing_trial',
  path: '/price.html',
  exposureEvent: 'section_view'
});

const shift = (date, n) =>
  new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

const exact = (fieldName, value) => ({
  filter: { fieldName, stringFilter: { matchType: 'EXACT', value, caseSensitive: true } }
});

function count(row, i) {
  const raw = row?.metricValues?.[i]?.value;
  if (!/^\d+$/.test(raw || '') || !Number.isSafeInteger(Number(raw))) {
    throw new Error('EXPERIMENT_INVALID_METRIC');
  }
  return Number(raw);
}

function assertReport(report, expectedMetrics) {
  if (!report || !Array.isArray(report.metricHeaders)) {
    throw new Error('EXPERIMENT_REPORT_INVALID');
  }
  if (report.metadata?.subjectToThresholding ||
      report.metadata?.samplingMetadatas?.length ||
      report.metadata?.dataLossFromOtherRow ||
      (report.rowCount || 0) > (report.rows || []).length) {
    throw new Error('EXPERIMENT_REPORT_INCOMPLETE');
  }
  if (report.metadata?.timeZone !== 'Asia/Tokyo') {
    throw new Error('EXPERIMENT_TIMEZONE_INVALID');
  }
  const actual = report.metricHeaders.map(x => x.name);
  if (actual.join() !== expectedMetrics.join()) {
    throw new Error('EXPERIMENT_METRIC_HEADERS_INVALID');
  }
}

export function normalizeExperimentReports({ exposure, reserve, startDate, endDate, today }) {
  assertReport(exposure, ['sessions', 'eventCount']);
  assertReport(reserve, ['eventCount']);

  const byDate = new Map();
  for (let d = startDate; d <= endDate; d = shift(d, 1)) {
    byDate.set(d, {
      experiment_id: CONTROL_EXPERIMENT.id,
      variant: CONTROL_EXPERIMENT.variant,
      metric_date: d,
      // A complete-day zero is valid only after both filtered GA4 reports
      // completed successfully. Today remains unsettled when no row exists.
      eligible_sessions: d === today ? null : 0,
      exposure_event_count: d === today ? null : 0,
      reserve_click: d === today ? null : 0,
      data_status: d === today ? 'DELAYED' : 'VALUE',
      source: 'google-analytics-data-api-direct'
    });
  }

  for (const row of exposure.rows || []) {
    const raw = row.dimensionValues?.[0]?.value;
    if (!/^\d{8}$/.test(raw || '')) throw new Error('EXPERIMENT_DATE_INVALID');
    const d = raw.slice(0,4) + '-' + raw.slice(4,6) + '-' + raw.slice(6,8);
    if (!byDate.has(d)) throw new Error('EXPERIMENT_DATE_OUTSIDE_RANGE');
    byDate.get(d).eligible_sessions = count(row, 0);
    byDate.get(d).exposure_event_count = count(row, 1);
  }

  for (const row of reserve.rows || []) {
    const raw = row.dimensionValues?.[0]?.value;
    if (!/^\d{8}$/.test(raw || '')) throw new Error('EXPERIMENT_DATE_INVALID');
    const d = raw.slice(0,4) + '-' + raw.slice(4,6) + '-' + raw.slice(6,8);
    if (!byDate.has(d)) throw new Error('EXPERIMENT_DATE_OUTSIDE_RANGE');
    byDate.get(d).reserve_click = count(row, 0);
  }

  return [...byDate.values()];
}

export async function syncGa4ExperimentCapture({
  supabase,
  env,
  config,
  today,
  fetchImpl = fetch
}) {
  // Activation is recorded only after Production Acceptance.
  if (!config?.production_accepted_at) return { status: 'NOT_STARTED', rows: 0 };
  if (config.experiment_id !== CONTROL_EXPERIMENT.id ||
      config.variant !== CONTROL_EXPERIMENT.variant ||
      config.surface !== CONTROL_EXPERIMENT.surface) {
    throw new Error('EXPERIMENT_CONFIG_INVALID');
  }

  const startDate = config.instrumentation_date;
  const endDate = today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') ||
      startDate > endDate) {
    throw new Error('EXPERIMENT_RANGE_INVALID');
  }

  const token = await getServiceAccountAccessToken(
    parseServiceAccount(env.GA4_SERVICE_ACCOUNT_JSON),
    fetchImpl
  );

  const baseFilters = eventName => ({
    andGroup: {
      expressions: [
        exact('eventName', eventName),
        exact('pagePath', CONTROL_EXPERIMENT.path),
        {
          filter: {
            fieldName: 'hostName',
            inListFilter: { values: ['therev-lab.com', 'www.therev-lab.com'] }
          }
        }
      ]
    }
  });

  const report = (eventName, metricNames) =>
    runGa4Report({
      propertyId: env.GA4_PROPERTY_ID,
      accessToken: token,
      fetchImpl,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: metricNames.map(name => ({ name })),
        dimensionFilter: baseFilters(eventName),
        limit: 10000
      }
    });

  // price.html emits section_view only for #cat-trial, at >=25% visibility,
  // once per page lifecycle. Therefore filtered sessions are the canonical
  // Eligible Trial Sessions denominator without a new GTM event or custom
  // dimension registration.
  const [exposure, reserve] = await Promise.all([
    report(CONTROL_EXPERIMENT.exposureEvent, ['sessions', 'eventCount']),
    report('reserve_click', ['eventCount'])
  ]);

  const observedAt = new Date().toISOString();
  const rows = normalizeExperimentReports({
    exposure,
    reserve,
    startDate,
    endDate,
    today
  }).map(row => ({
    ...row,
    observed_at: observedAt,
    updated_at: observedAt
  }));

  // Omitted booking fields remain untouched on conflict. This prevents GA4
  // sync from overwriting a future authoritative Gym's aggregate.
  const saved = await supabase
    .from('company_os_experiment_daily_metrics')
    .upsert(rows, { onConflict: 'experiment_id,metric_date,variant' });
  if (saved.error) throw new Error('EXPERIMENT_UPSERT_FAILED');

  console.log(
    `[ga4-experiment] PASS rows=${rows.length} today=DELAYED booking=UNKNOWN`
  );
  return {
    status: 'PASS',
    rows: rows.length,
    observed_at: observedAt,
    eligible_sessions_semantics:
      'sessions_with_section_view_on_price_page_trial_surface'
  };
}
