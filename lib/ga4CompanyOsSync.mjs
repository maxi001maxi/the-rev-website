import { syncGa4ExperimentCapture } from './ga4ExperimentCapture.mjs';
import { CTA_EVENTS, parseServiceAccount, getServiceAccountAccessToken, runGa4Report } from './ga4Data.mjs';
const CORE_EVENTS = ['reserve_click', 'line_click', 'price_click', 'article_cta_click'];
export const GA4_INSTRUMENTATION_START = '2026-09-25';
export const GA4_SYNC_EVENTS = [...CORE_EVENTS];
export const GA4_ALL_TRACKED_EVENTS = [...CTA_EVENTS];
const DAY = 86400000;
export function tokyoDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).format(now); }
function shift(date, days) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0,10); }
export function normalizeGa4Date(value) {
  const raw=String(value || '');
  if(!/^\d{8}$/.test(raw)) throw new Error('GA4_INVALID_DATE_DIMENSION');
  const date=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
  if(!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) throw new Error('GA4_INVALID_DATE_DIMENSION');
  return date;
}
function value(row, i) {
  const raw=row?.metricValues?.[i]?.value;
  if(raw===undefined || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('GA4_INVALID_METRIC');
  return Number(raw);
}
function assertReport(report) {
  if(!report || !Array.isArray(report.metricHeaders)) throw new Error('GA4_INVALID_REPORT');
  if(report.metadata?.subjectToThresholding || report.metadata?.samplingMetadatas?.length || report.metadata?.dataLossFromOtherRow) throw new Error('GA4_REPORT_INCOMPLETE');
  if((report.rowCount || 0) > (report.rows || []).length) throw new Error('GA4_REPORT_TRUNCATED');
  if(report.metadata?.timeZone && report.metadata.timeZone !== 'Asia/Tokyo') throw new Error('GA4_PROPERTY_TIMEZONE_MISMATCH');
}
export function normalizeDailyReports({dailyReport,eventReport,startDate,endDate,today,eventVerifiedFrom={}}) {
  assertReport(dailyReport); assertReport(eventReport);
  const first={...eventVerifiedFrom};
  for(const row of eventReport.rows || []) {
    const event=row.dimensionValues?.[1]?.value;
    const date=normalizeGa4Date(row.dimensionValues?.[0]?.value);
    if(CORE_EVENTS.includes(event) && value(row,0)>0 && (!first[event] || date<first[event])) first[event]=date;
  }
  const byDate=new Map();
  for(let date=startDate;date<=endDate;date=shift(date,1)) {
    byDate.set(date,{metric_date:date,property_id:null,sessions:0,active_users:0,page_views:0,new_users:0,
      ...Object.fromEntries(CORE_EVENTS.map(e=>[e,first[e] && date>=first[e] ? 0:null])),
      source:'google-analytics-data-api-direct',data_status:date===today?'DELAYED':'VALUE'});
  }
  for(const row of dailyReport.rows || []) {
    const date=normalizeGa4Date(row.dimensionValues?.[0]?.value);
    if(!byDate.has(date)) throw new Error('GA4_DATE_OUTSIDE_REQUEST');
    Object.assign(byDate.get(date),{sessions:value(row,0),active_users:value(row,1),page_views:value(row,2),new_users:value(row,3)});
  }
  for(const row of eventReport.rows || []) {
    const date=normalizeGa4Date(row.dimensionValues?.[0]?.value), event=row.dimensionValues?.[1]?.value;
    if(!byDate.has(date)) throw new Error('GA4_DATE_OUTSIDE_REQUEST');
    if(CORE_EVENTS.includes(event)) byDate.get(date)[event]=value(row,0);
  }
  return {rows:[...byDate.values()],eventVerifiedFrom:first};
}
export async function fetchDirectGa4Dataset({propertyId,serviceAccountRaw,startDate=GA4_INSTRUMENTATION_START,endDate,today=tokyoDate(),eventVerifiedFrom={},fetchImpl=fetch}) {
  if(!/^\d+$/.test(String(propertyId||'').trim())) throw new Error('GA4_PROPERTY_ID_INVALID');
  propertyId=String(propertyId).trim(); endDate=endDate || today;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||startDate<GA4_INSTRUMENTATION_START||startDate>endDate||endDate>today) throw new Error('GA4_SYNC_RANGE_INVALID');
  const accessToken=await getServiceAccountAccessToken(parseServiceAccount(serviceAccountRaw),fetchImpl);
  const report=body=>runGa4Report({propertyId,accessToken,fetchImpl,body});
  const [dailyReport,eventReport]=await Promise.all([
    report({dateRanges:[{startDate,endDate}],dimensions:[{name:'date'}],metrics:['sessions','activeUsers','screenPageViews','newUsers'].map(name=>({name})),limit:10000}),
    report({dateRanges:[{startDate,endDate}],dimensions:[{name:'date'},{name:'eventName'}],metrics:[{name:'eventCount'}],dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:CORE_EVENTS}}},limit:10000})
  ]);
  const normalized=normalizeDailyReports({dailyReport,eventReport,startDate,endDate,today,eventVerifiedFrom});
  for(const row of normalized.rows) row.property_id=propertyId;
  const windowMetrics={};
  await Promise.all([['recent_7_complete_days',-7,-1],['previous_7_complete_days',-14,-8],['recent_28_complete_days',-28,-1],['previous_28_complete_days',-56,-29]].map(async ([key,from,to]) => {
    const start=shift(today,from),end=shift(today,to);
    if(start<startDate || end>endDate) { windowMetrics[key]={start_date:start,end_date:end,status:'UNKNOWN',active_users:null}; return; }
    const r=await report({dateRanges:[{startDate:start,endDate:end}],metrics:[{name:'activeUsers'}]}); assertReport(r);
    windowMetrics[key]={start_date:start,end_date:end,status:'VALUE',active_users:r.rows?.length?value(r.rows[0],0):0,semantics:'period_unique_active_users'};
  }));
  return {...normalized,windowMetrics,today};
}
export async function fetchDirectGa4DailyMetrics(options) { return (await fetchDirectGa4Dataset(options)).rows; }
export async function syncDirectGa4ToCompanyOs({supabase,env=process.env,fetchImpl=fetch}) {
  const missing=['GA4_PROPERTY_ID','GA4_SERVICE_ACCOUNT_JSON'].filter(k=>!String(env[k]||'').trim());
  if(missing.length) return {ok:false,status:503,error:'ga4_direct_not_configured',missing};
  const propertyId=String(env.GA4_PROPERTY_ID).trim(),startedAt=new Date().toISOString();
  try {
    const prior=await supabase.from('company_os_source_registry').select('metadata').eq('source_id','ga4-direct-read').maybeSingle();
    if(prior.error) throw new Error('GA4_SOURCE_REGISTRY_READ_FAILED');
    const dataset=await fetchDirectGa4Dataset({propertyId,serviceAccountRaw:env.GA4_SERVICE_ACCOUNT_JSON,eventVerifiedFrom:prior.data?.metadata?.event_verified_from||{},fetchImpl});
    const observedAt=new Date().toISOString();
    const payload=dataset.rows.map(r=>({...r,observed_at:observedAt,updated_at:observedAt}));
    if(!payload.length) throw new Error('GA4_EMPTY_SYNC');
    const upsert=await supabase.from('company_os_ga4_daily_metrics').upsert(payload,{onConflict:'metric_date'});
    if(upsert.error) throw new Error('GA4_DAILY_UPSERT_FAILED');
    const metadata={...(prior.data?.metadata||{}),property_id:propertyId,provider:'google-analytics-data-api-direct',dependency_on_gsc_wizard:false,
      rows_upserted:payload.length,min_metric_date:payload[0].metric_date,max_metric_date:payload.at(-1).metric_date,started_at:startedAt,completed_at:observedAt,
      business_date:dataset.today,window_metrics:dataset.windowMetrics,event_verified_from:dataset.eventVerifiedFrom,
      instrumentation_start:GA4_INSTRUMENTATION_START,today_is_partial:true,reserve_click_semantics:'external_booking_page_open_intent',reservation_start:null,reservation_complete:null};
    // Experiment capture is isolated: a capture-query failure must not corrupt
    // the established GA4 website source or invent booking values.
    try {
      metadata.control_capture_sync = await syncGa4ExperimentCapture({
        supabase,
        env,
        config: metadata.control_capture,
        today: dataset.today,
        fetchImpl
      });
    } catch (captureError) {
      metadata.control_capture_sync = {
        status: 'ERROR',
        reason: String(captureError?.message || 'EXPERIMENT_CAPTURE_FAILED').slice(0, 100),
        observed_at: observedAt
      };
      console.error('[ga4-experiment] FAIL', metadata.control_capture_sync.reason);
    }
    const source=await supabase.from('company_os_source_registry').update({status:'ACTIVE',last_observed_at:observedAt,last_error:null,metadata,updated_at:observedAt}).eq('source_id','ga4-direct-read').select('source_id');
    if(source.error || source.data?.length!==1) throw new Error('GA4_SOURCE_REGISTRY_UPDATE_FAILED');
    console.log(`[ga4-sync] PASS rows=${payload.length} range=${payload[0].metric_date}..${payload.at(-1).metric_date}`);
    return {ok:true,status:200,provider:'google-analytics-data-api-direct',rowsUpserted:payload.length,minDate:payload[0].metric_date,maxDate:payload.at(-1).metric_date,observedAt};
  } catch(error) {
    const message=String(error?.message||'GA4_DIRECT_SYNC_FAILED').slice(0,200);
    await supabase.from('company_os_source_registry').update({status:'DEGRADED',last_error:message,updated_at:new Date().toISOString()}).eq('source_id','ga4-direct-read');
    console.error('[ga4-sync] FAIL',message);
    return {ok:false,status:502,error:'ga4_direct_sync_failed',reason:message};
  }
}
