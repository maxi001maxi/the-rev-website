import {searchAnchor,searchRaw,searchDaily,searchTotal,searchDimension} from './providers/search.mjs';
import {ga4Dataset,ga4Day} from './providers/ga4.mjs';
import {blend} from './providers/blended.mjs';
import {annotations} from './providers/annotations.mjs';
import {dateShift,dateList,ga4Rate} from './normalize.mjs';
import {metric,unavailable,delta,overallStatus} from './status.mjs';
import {insightRules,anomalies} from './rules.mjs';
const START='2026-09-27';
const errorStatus=e=>e?.code==='not_configured'?'NOT_CONFIGURED':e?.code==='unsettled'?'DELAYED':e?.code==='stale'?'STALE':'ERROR';
const failure=(e,source,unit='count')=>unavailable(errorStatus(e),unit,source,e?.code==='not_configured'?'credentials_missing':'provider_unavailable');
const m=(v,unit,source,asOf)=>metric(v,unit,source,{asOf});
function ctaMetric(data,event,start,end,asOf){
  if(end<START)return unavailable('NOT_CONFIGURED','count','ga4','before_instrumentation');
  if(start<START)return unavailable('UNKNOWN','count','ga4','partial_instrumentation');
  return m(data?.events?.[event]??(data?0:null),'count','ga4',asOf);
}
function withComparison(current,previous){const d=delta(current,previous);return {...current,previous,deltaAbsolute:d.absolute,deltaPercent:d.percent};}
export async function assemble(rangeKey='28d',options={}) {
  const days=Number.parseInt(rangeKey,10),generatedAt=new Date().toISOString();
  let anchor,anchorError;
  try{anchor=await searchAnchor();}catch(e){anchorError=e; anchor=dateShift(new Date().toISOString().slice(0,10),-4);}
  const start=dateShift(anchor,1-days),prevEnd=dateShift(start,-1),prevStart=dateShift(start,-days);
  const range={key:rangeKey,startDate:start,endDate:anchor,comparisonStartDate:prevStart,comparisonEndDate:prevEnd,anchor:anchorError?'fallback_unverified':'gsc_settled',completeDays:anchorError?null:days};
  const [gCurrent,gPrevious,gQueries,gPreviousQueries,gPages,aCurrent,aPrevious,ann]=await Promise.allSettled([
    anchorError?Promise.reject(anchorError):searchRaw(start,anchor),anchorError?Promise.reject(anchorError):searchRaw(prevStart,prevEnd),
    anchorError?Promise.reject(anchorError):searchRaw(start,anchor,'query',20),anchorError?Promise.reject(anchorError):searchRaw(prevStart,prevEnd,'query',100),anchorError?Promise.reject(anchorError):searchRaw(start,anchor,'page',100),
    ga4Dataset({startDate:start,endDate:anchor}),ga4Dataset({startDate:prevStart,endDate:prevEnd}),annotations({startDate:start,endDate:anchor})
  ]);
  // Upstream observation time is not provided consistently; do not substitute response generation time.
  const asOf=null,get=x=>x.status==='fulfilled'?x.value:null;
  let gc,gp,queries,previousQueries,pages,ac=get(aCurrent),ap=get(aPrevious);
  try{gc=searchDaily(get(gCurrent),start,anchor);}catch{gc=null;}
  try{gp=searchDaily(get(gPrevious),prevStart,prevEnd);}catch{gp=null;}
  try{queries=searchDimension(get(gQueries),'query');}catch{queries=null;}
  try{previousQueries=searchDimension(get(gPreviousQueries),'query');}catch{previousQueries=null;}
  try{pages=searchDimension(get(gPages),'page');}catch{pages=null;}
  if(days===90 && get(gCurrent)?.rows?.[0]?.keys?.[0]>start)gc=null;
  const gt=gc?searchTotal(gc):null,pt=gp?searchTotal(gp):null;
  const gError=gCurrent.status==='rejected'?gCurrent.reason:null;
  const gMetric=(key,unit)=>withComparison(gt?m(gt[key],unit,'gsc',asOf):get(gCurrent)?unavailable('UNKNOWN',unit,'gsc','incomplete_history'):failure(gError,'gsc',unit),pt?m(pt[key],unit,'gsc',asOf):unavailable('UNKNOWN',unit,'gsc','comparison_unavailable'));
  const aMetric=(key,unit='count')=>withComparison(ac?m(unit==='ratio'?ga4Rate(ac.total[key]):ac.total[key],unit,'ga4',asOf):failure(aCurrent.reason,'ga4',unit),ap?m(unit==='ratio'?ga4Rate(ap.total[key]):ap.total[key],unit,'ga4',asOf):unavailable('UNKNOWN',unit,'ga4','comparison_unavailable'));
  const ev=event=>withComparison(ac?ctaMetric(ac,event,start,anchor,asOf):failure(aCurrent.reason,'ga4'),ap?ctaMetric(ap,event,prevStart,prevEnd,asOf):unavailable('UNKNOWN','count','ga4','comparison_unavailable'));
  const summary={searchClicks:gMetric('clicks','count'),searchImpressions:gMetric('impressions','count'),searchCtr:gMetric('ctr','ratio'),averagePosition:gMetric('position','position'),sessions:aMetric('sessions'),activeUsers:aMetric('activeUsers'),pageViews:aMetric('screenPageViews'),newUsers:aMetric('newUsers'),engagementRate:aMetric('engagementRate','ratio'),bounceRate:aMetric('bounceRate','ratio'),bookingIntent:ev('reserve_click'),lineIntent:ev('line_click'),priceIntent:ev('price_click'),articleCtaIntent:ev('article_cta_click')};
  const gd=new Map(gc?.map(x=>[x.date,x])||[]),ad=new Map(ac?.days.map(x=>[x.date,x])||[]);
  const trend=dateList(start,anchor).map(date=>{const g=gd.get(date),a=ad.get(date);return {date,searchClicks:g?m(g.clicks,'count','gsc',asOf):failure(gError,'gsc'),searchImpressions:g?m(g.impressions,'count','gsc',asOf):failure(gError,'gsc'),sessions:a?m(a.sessions,'count','ga4',asOf):ac?unavailable('UNKNOWN','count','ga4','missing_date'):failure(aCurrent.reason,'ga4'),bookingIntent:date<START?unavailable('NOT_CONFIGURED','count','ga4','before_instrumentation'):unavailable('UNKNOWN','count','ga4','daily_event_unavailable'),lineIntent:date<START?unavailable('NOT_CONFIGURED','count','ga4','before_instrumentation'):unavailable('UNKNOWN','count','ga4','daily_event_unavailable')};});
  const health={search:{status:gc?'VALUE':get(gCurrent)?'UNKNOWN':failure(gError,'gsc').status,settledThrough:anchorError?null:anchor,timezone:'America/Los_Angeles'},ga4:{status:ac?'VALUE':failure(aCurrent.reason,'ga4').status,settledThrough:ac?anchor:null,timezone:'Asia/Tokyo'},blended:{status:pages&&ac?'VALUE':'UNKNOWN'},annotations:{status:get(ann)?.status||'ERROR'}};
  const blended=pages&&ac?blend(pages,ac.landing):[];
  const status=overallStatus(health);
  const {header,insights}=insightRules(summary,days,health);
  if(queries&&insights.length<3)for(const row of queries){if(row.impressions>=50&&row.position>=4&&row.position<=20&&row.ctr!==null&&row.ctr<=.02){insights.push({ruleId:'I_QUERY_OPPORTUNITY',ruleVersion:'1',headline:`検索語「${row.key}」は表示されていますがクリックが少ない状態です`,confidence:'low',periods:{days},thresholds:{impressions:50,ctr:.02,position:[4,20]},inputMetricPaths:['search.queries'],evidence:{query:row.key,clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.position},evidenceRef:'#search-detail'});break;}}
  const anomalyList=[...anomalies(trend,'searchClicks'),...anomalies(trend,'searchImpressions'),...anomalies(trend,'sessions')].slice(0,5);
  const countNames={reserve_click:summary.bookingIntent,line_click:summary.lineIntent,price_click:summary.priceIntent,article_cta_click:summary.articleCtaIntent};
  const stage=(key,label,value)=>({key,label,metric:value});
  const funnel={stages:[stage('impressions','検索結果の表示',summary.searchImpressions),stage('clicks','検索クリック',summary.searchClicks),stage('sessions','訪問',summary.sessions),stage('price','料金を見る',summary.priceIntent),stage('article','記事下の次の行動',summary.articleCtaIntent),stage('line','LINEを開いた',summary.lineIntent),stage('reserve','予約画面クリック',summary.bookingIntent)],edges:[{from:'clicks',to:'sessions',comparable:false,reason:'異なる計測元・直接の転換率なし'}]};
  const pageType=p=>p==='/blog'?'blog_index':p.startsWith('/blog/')?'blog_article':'page';
  const content=ac?.pages.map(p=>({...p,type:pageType(p.path),search:pages?.find(x=>x.key===p.path)||null,ctaAttribution:unavailable('UNKNOWN','count','ga4','event_page_unvalidated')}))||[];
  let day=null;
  if(options.date && options.date>=start && options.date<=anchor) {
    day={...trend.find(x=>x.date===options.date),pages:[],sources:[],queries:[],events:{},annotations:[]};
    const [ga4Detail,queryDetail]=await Promise.allSettled([ga4Day(options.date),anchorError?Promise.reject(anchorError):searchRaw(options.date,options.date,'query',10)]);
    if(ga4Detail.status==='fulfilled') {
      day.pages=ga4Detail.value.pages;day.sources=ga4Detail.value.sources;day.events=ga4Detail.value.events;
      for(const [name,key] of [['reserve_click','bookingIntent'],['line_click','lineIntent']]) if(options.date>=START)day[key]=m(day.events[name]??0,'count','ga4',asOf);
    }
    if(queryDetail.status==='fulfilled')day.queries=searchDimension(queryDetail.value,'query');
  }
  const comparison=queries&&previousQueries?queries.map(q=>{const prior=previousQueries.find(p=>p.key===q.key);return {...q,previousClicks:prior?.clicks??null,clickDelta:prior?q.clicks-prior.clicks:null};}).filter(q=>q.clickDelta!==null).sort((a,b)=>b.clickDelta-a.clickDelta):[];
  return {schemaVersion:'2.0',status,range,generatedAt,health,header,summary,trend,anomalies:anomalyList,funnel,search:{queries:{status:queries?(queries.length?'VALUE':'ZERO'):health.search.status,rows:queries||[],nextCursor:null},pages:{status:pages?(pages.length?'VALUE':'ZERO'):health.search.status,rows:pages||[],nextCursor:null},comparison:{status:queries&&previousQueries?(comparison.length?'VALUE':'ZERO'):'UNKNOWN',rows:comparison}},content:{pages:{status:ac?(content.length?'VALUE':'ZERO'):health.ga4.status,rows:content,nextCursor:null},landing:{status:pages&&ac?(blended.length?'VALUE':'ZERO'):health.blended.status,rows:blended,nextCursor:null}},acquisition:{channels:{status:ac?(ac.sources.length?'VALUE':'ZERO'):health.ga4.status,rows:ac?.sources||[]},devices:{status:ac?(ac.devices.length?'VALUE':'ZERO'):health.ga4.status,rows:ac?.devices||[]}},events:{counts:countNames},insights,annotations:get(ann)||{status:'ERROR',rows:[]},technical:{indexing:{status:'NOT_CONFIGURED'},errors404:{status:'UNKNOWN'}},day};
}
