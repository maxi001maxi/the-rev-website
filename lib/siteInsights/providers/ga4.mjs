import {parseServiceAccount,getServiceAccountAccessToken,runGa4Report} from '../../ga4Data.mjs';
import {ga4Rows,canonicalPath} from '../normalize.mjs';
import {cached} from '../cache.mjs';
export const P0=['reserve_click','line_click','price_click','article_cta_click'];
const PROPERTY='552679302';
async function report(body) {
  if(String(process.env.GA4_PROPERTY_ID||'')!==PROPERTY || !process.env.GA4_SERVICE_ACCOUNT_JSON) throw Object.assign(new Error('not_configured'),{code:'not_configured'});
  const key=JSON.stringify(body);
  return cached(`ga4:${PROPERTY}:${key}`,15*60000,async()=>{
    const token=await cached('ga4:token',45*60000,()=>getServiceAccountAccessToken(parseServiceAccount(process.env.GA4_SERVICE_ACCOUNT_JSON)));
    return runGa4Report({propertyId:PROPERTY,accessToken:token,body});
  });
}
const metrics=names=>names.map(name=>({name}));
const dateRanges=r=>[{startDate:r.startDate,endDate:r.endDate}];
export async function ga4Dataset(r) {
  const ranges=dateRanges(r);
  const [aggregate,daily,events,pages,landing,acquisition,devices]=await Promise.all([
    report({dateRanges:ranges,metrics:metrics(['sessions','activeUsers','screenPageViews','newUsers','engagementRate','bounceRate'])}),
    report({dateRanges:ranges,dimensions:[{name:'date'}],metrics:metrics(['sessions','screenPageViews']),limit:100}),
    report({dateRanges:ranges,dimensions:[{name:'eventName'}],metrics:metrics(['eventCount']),dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:P0}}},limit:20}),
    report({dateRanges:ranges,dimensions:[{name:'pagePath'}],metrics:metrics(['screenPageViews','activeUsers']),orderBys:[{metric:{metricName:'screenPageViews'},desc:true}],limit:100}),
    report({dateRanges:ranges,dimensions:[{name:'landingPage'}],metrics:metrics(['sessions']),dimensionFilter:{filter:{fieldName:'sessionSourceMedium',stringFilter:{matchType:'EXACT',value:'google / organic'}}},orderBys:[{metric:{metricName:'sessions'},desc:true}],limit:100}),
    report({dateRanges:ranges,dimensions:[{name:'sessionSourceMedium'}],metrics:metrics(['sessions']),orderBys:[{metric:{metricName:'sessions'},desc:true}],limit:20}),
    report({dateRanges:ranges,dimensions:[{name:'deviceCategory'}],metrics:metrics(['sessions']),limit:10})
  ]);
  const total=ga4Rows(aggregate)?.[0]?.metrics;
  const days=ga4Rows(daily),ev=ga4Rows(events),pageRows=ga4Rows(pages),landingRows=ga4Rows(landing),sources=ga4Rows(acquisition),deviceRows=ga4Rows(devices);
  if(!total||!days||!ev||!pageRows||!landingRows||!sources||!deviceRows) throw new Error('invalid_ga4');
  return {total,days:days.map(x=>({date:x.key[0]?.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),...x.metrics})),events:Object.fromEntries(ev.map(x=>[x.key[0],x.metrics.eventCount])),pages:pageRows.map(x=>({path:canonicalPath(x.key[0]),...x.metrics})).filter(x=>x.path),landing:landingRows.map(x=>({path:canonicalPath(x.key[0]),...x.metrics})).filter(x=>x.path),sources:sources.map(x=>({name:x.key[0],...x.metrics})),devices:deviceRows.map(x=>({name:x.key[0],...x.metrics}))};
}
export async function ga4Day(date) {
  const dateRanges=[{startDate:date,endDate:date}];
  const [pages,sources,events]=await Promise.all([
    report({dateRanges,dimensions:[{name:'pagePath'}],metrics:metrics(['screenPageViews']),orderBys:[{metric:{metricName:'screenPageViews'},desc:true}],limit:10}),
    report({dateRanges,dimensions:[{name:'sessionSourceMedium'}],metrics:metrics(['sessions']),orderBys:[{metric:{metricName:'sessions'},desc:true}],limit:10}),
    report({dateRanges,dimensions:[{name:'eventName'}],metrics:metrics(['eventCount']),dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:P0}}},limit:10})
  ]);
  return {pages:ga4Rows(pages)?.map(x=>({path:canonicalPath(x.key[0]),views:x.metrics.screenPageViews}))||[],sources:ga4Rows(sources)?.map(x=>({name:x.key[0],sessions:x.metrics.sessions}))||[],events:Object.fromEntries((ga4Rows(events)||[]).map(x=>[x.key[0],x.metrics.eventCount]))};
}
