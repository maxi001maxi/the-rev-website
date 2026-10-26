import {parseServiceAccount,getServiceAccountAccessToken,runGa4Report} from '../../ga4Data.mjs';
import {strictNumber,canonicalPath} from '../normalize.mjs';

// Direct read uses the SAME GA4 credentials as /api/admin/analytics.
// No Wizard subscription is needed when this connection is configured.
export function directGa4Configured(env=process.env){
  return Boolean(String(env.GA4_PROPERTY_ID||'').trim()&&String(env.GA4_SERVICE_ACCOUNT_JSON||'').trim());
}
const fail=code=>Object.assign(new Error(code),{code});
function number(raw,field){
  const n=strictNumber(raw);
  if(n===null||n<0)throw fail('ga4_invalid_'+field);
  return n;
}
function rows(report,metrics,dimensions=[]){
  if(!report||!Array.isArray(report.metricHeaders))throw fail('ga4_invalid_report');
  if(report.metadata?.subjectToThresholding||report.metadata?.samplingMetadatas?.length||report.metadata?.dataLossFromOtherRow)throw fail('ga4_incomplete_report');
  if(report.metadata?.timeZone&&report.metadata.timeZone!=='Asia/Tokyo')throw fail('ga4_timezone_mismatch');
  const names=report.metricHeaders.map(x=>x.name);
  if(metrics.some(x=>!names.includes(x)))throw fail('ga4_metric_mismatch');
  const dimNames=(report.dimensionHeaders||[]).map(x=>x.name);
  if(dimensions.some(x=>!dimNames.includes(x)))throw fail('ga4_dimension_mismatch');
  if(report.rowCount>(report.rows||[]).length)throw fail('ga4_truncated_report');
  return (report.rows||[]).map(row=>({
    dimensions:Object.fromEntries(dimNames.map((name,i)=>[name,row.dimensionValues?.[i]?.value||''])),
    metrics:Object.fromEntries(metrics.map(name=>[name,number(row.metricValues?.[names.indexOf(name)]?.value,name)]))
  }));
}
const summaryMetrics=['sessions','activeUsers','screenPageViews','newUsers','engagementRate','bounceRate'];
const dailyMetrics=['sessions','screenPageViews'];
const cta=['reserve_click','line_click','price_click','article_cta_click'];
const report=(startDate,endDate,dimensions,metrics,other={})=>({
  dateRanges:[{startDate,endDate}],
  dimensions:dimensions.map(name=>({name})),
  metrics:metrics.map(name=>({name})),
  ...other
});

export async function directGa4Dataset(range,{details=true,executeReport=null,env=process.env}={}){
  if(!executeReport&&!directGa4Configured(env))throw fail('not_configured');
  let run=executeReport;
  if(!run){
    const propertyId=String(env.GA4_PROPERTY_ID).trim();
    if(!/^\d+$/.test(propertyId))throw fail('not_configured');
    const sa=parseServiceAccount(env.GA4_SERVICE_ACCOUNT_JSON);
    const token=await getServiceAccountAccessToken(sa);
    run=body=>runGa4Report({propertyId,accessToken:token,body});
  }
  const {startDate,endDate}=range;
  const operations=[
    run(report(startDate,endDate,[],summaryMetrics)),
    run(report(startDate,endDate,['date'],dailyMetrics,{limit:1000})),
    run(report(startDate,endDate,['eventName'],['eventCount'],{
      dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:cta}}},limit:50
    }))
  ];
  if(details){
    operations.push(
      run(report(startDate,endDate,['pagePath'],['screenPageViews','activeUsers'],{limit:100})),
      run(report(startDate,endDate,['landingPage'],['sessions'],{limit:100})),
      run(report(startDate,endDate,['sessionSourceMedium'],['sessions','activeUsers'],{limit:50})),
      run(report(startDate,endDate,['deviceCategory'],['sessions','activeUsers'],{limit:10}))
    );
  }
  const [summary,daily,events,pages,landings,sources,devices]=await Promise.all(operations);
  const totals=rows(summary,summaryMetrics);
  if(totals.length!==1)throw fail('ga4_summary_not_observed');
  const total=totals[0].metrics;
  const days=rows(daily,dailyMetrics,['date']).map(row=>{
    const raw=row.dimensions.date;
    if(!/^\d{8}$/.test(raw))throw fail('ga4_invalid_date');
    return {date:raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6),...row.metrics};
  });
  const eventRows=rows(events,['eventCount'],['eventName']);
  const eventCounts=Object.fromEntries(eventRows.filter(r=>cta.includes(r.dimensions.eventName)).map(r=>[r.dimensions.eventName,r.metrics.eventCount]));
  const result={total,days,events:eventCounts,pages:[],landing:[],sources:[],devices:[],timeZone:'Asia/Tokyo',provider:'google-analytics-data-api-direct'};
  if(!details)return result;
  result.pages=rows(pages,['screenPageViews','activeUsers'],['pagePath'])
    .map(r=>({path:canonicalPath(r.dimensions.pagePath),...r.metrics})).filter(r=>r.path);
  result.landing=rows(landings,['sessions'],['landingPage'])
    .map(r=>({path:canonicalPath(r.dimensions.landingPage),...r.metrics})).filter(r=>r.path);
  result.sources=rows(sources,['sessions','activeUsers'],['sessionSourceMedium'])
    .map(r=>({name:r.dimensions.sessionSourceMedium,...r.metrics})).filter(r=>r.name);
  result.devices=rows(devices,['sessions','activeUsers'],['deviceCategory'])
    .map(r=>({name:r.dimensions.deviceCategory,...r.metrics})).filter(r=>r.name);
  return result;
}
