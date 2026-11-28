import {wizard} from './wizard.mjs';
import {strictNumber,canonicalPath} from '../normalize.mjs';
import {cached} from '../cache.mjs';

export const P0=['reserve_click','line_click','price_click','article_cta_click'];
const SITE='https://therev-lab.com/';
const PROPERTY='properties/552679302';

const fail=(code='invalid_response')=>Object.assign(new Error(code),{code});
const n=(value,field)=>{const parsed=strictNumber(value);if(parsed===null)throw fail(`invalid_${field}`);return parsed;};
const args=(range,extra={})=>({siteUrl:SITE,startDate:range.startDate,endDate:range.endDate,...extra});
const call=(name,request,ttl=15*60000)=>cached(`wizard:${name}:${JSON.stringify(request)}`,ttl,()=>wizard(name,request));

function validateSource(data) {
  if(data?.notConfigured)throw fail('not_configured');
  if(data?.propertyId!==PROPERTY)throw fail('property_mismatch');
  if(data?.timeZone && data.timeZone!=='Asia/Tokyo')throw fail('timezone_mismatch');
  return data;
}
function normalizeOverview(data) {
  validateSource(data);
  if(!data?.summary||!Array.isArray(data?.timeseries))throw fail();
  const total={};
  for(const key of ['sessions','activeUsers','screenPageViews','newUsers','engagementRate','bounceRate'])total[key]=n(data.summary[key],key);
  const days=data.timeseries.map(row=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(row?.date||''))throw fail('invalid_date');
    return {date:row.date,sessions:n(row.sessions,'sessions'),screenPageViews:n(row.screenPageViews,'screenPageViews')};
  });
  return {total,days,timeZone:data.timeZone||'Asia/Tokyo'};
}
function normalizeReport(data,dimension) {
  validateSource(data);
  if(data?.dimension!==dimension||!Array.isArray(data?.rows))throw fail();
  return data.rows;
}
const report=(range,dimension,extra={})=>call('query_ga4_report',args(range,{dimension,...extra}));

export async function ga4Dataset(range,{details=true}={}) {
  const requests=[
    call('get_ga4_overview',args(range,{includeTimeseries:true})),
    report(range,'event',{filters:{event:P0},limit:20})
  ];
  if(details)requests.push(
    report(range,'page',{limit:100}),
    report(range,'landingPage',{filters:{sourceMedium:['google / organic']},limit:100}),
    report(range,'sourceMedium',{limit:20}),
    report(range,'device',{limit:10})
  );
  const [overview,eventReport,pageReport,landingReport,sourceReport,deviceReport]=await Promise.all(requests);
  const normalized=normalizeOverview(overview);
  const events=Object.fromEntries(normalizeReport(eventReport,'event').map(row=>[row.key,n(row.eventCount,'eventCount')]));
  if(!details)return {...normalized,events,pages:[],landing:[],sources:[],devices:[]};
  const pages=normalizeReport(pageReport,'page').map(row=>({path:canonicalPath(row.key),screenPageViews:n(row.screenPageViews,'screenPageViews'),activeUsers:n(row.activeUsers,'activeUsers')})).filter(row=>row.path);
  const landing=normalizeReport(landingReport,'landingPage').map(row=>({path:canonicalPath(row.key),sessions:n(row.sessions,'sessions')})).filter(row=>row.path);
  const sources=normalizeReport(sourceReport,'sourceMedium').map(row=>({name:String(row.key||''),sessions:n(row.sessions,'sessions'),activeUsers:n(row.activeUsers,'activeUsers')})).filter(row=>row.name);
  const devices=normalizeReport(deviceReport,'device').map(row=>({name:String(row.key||''),sessions:n(row.sessions,'sessions'),activeUsers:n(row.activeUsers,'activeUsers')})).filter(row=>row.name);
  return {...normalized,events,pages,landing,sources,devices};
}

export async function ga4Day(date) {
  const range={startDate:date,endDate:date};
  const [pages,sources,events]=await Promise.all([
    report(range,'page',{limit:10}),report(range,'sourceMedium',{limit:10}),report(range,'event',{filters:{event:P0},limit:10})
  ]);
  return {
    pages:normalizeReport(pages,'page').map(row=>({path:canonicalPath(row.key),views:n(row.screenPageViews,'screenPageViews')})).filter(row=>row.path),
    sources:normalizeReport(sources,'sourceMedium').map(row=>({name:String(row.key||''),sessions:n(row.sessions,'sessions')})).filter(row=>row.name),
    events:Object.fromEntries(normalizeReport(events,'event').map(row=>[row.key,n(row.eventCount,'eventCount')]))
  };
}
