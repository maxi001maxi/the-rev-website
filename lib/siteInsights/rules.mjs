import {ok} from './status.mjs';
const FLOOR={7:{click:[8,5],session:[8,5],impression:[250,100],cta:[8,5]},28:{click:[20,10],session:[20,10],impression:[800,300],cta:[12,8]},90:{click:[60,30],session:[60,30],impression:[2400,900],cta:[30,20]}};
const valid=(cur,prev,[base,abs],relative=.3)=>ok(cur)&&ok(prev)&&prev.value>=base&&Math.abs(cur.value-prev.value)>=abs&&Math.abs((cur.value-prev.value)/prev.value)>=relative;
export function insightRules(summary,days,health) {
  const f=FLOOR[days], s=summary, insights=[];
  const add=(ruleId,headline,paths,confidence='medium')=>insights.push({ruleId,ruleVersion:'1',headline,interpretation:headline,confidence,periods:{days},thresholds:f,inputMetricPaths:paths,evidence:paths.map(k=>({key:k,current:s[k]?.value,previous:s[k]?.previous?.value})),evidenceRef:'#evidence'});
  if(valid(s.sessions,s.sessions?.previous,f.session)) add(s.sessions.value>s.sessions.previous.value?'H_VISITS_UP':'H_VISITS_DOWN',s.sessions.value>s.sessions.previous.value?'訪問が増えています':'訪問が減っています',['sessions']);
  if(valid(s.searchClicks,s.searchClicks?.previous,f.click)) add(s.searchClicks.value>s.searchClicks.previous.value?'H_SEARCH_UP':'H_SEARCH_DOWN',s.searchClicks.value>s.searchClicks.previous.value?'Google検索からのクリックが増加':'Google検索からのクリックが減少',['searchClicks']);
  if(valid(s.bookingIntent,s.bookingIntent?.previous,f.cta,.4)) add(s.bookingIntent.value>s.bookingIntent.previous.value?'I_INTENT_UP':'I_INTENT_DOWN',s.bookingIntent.value>s.bookingIntent.previous.value?'予約画面クリックが増加':'予約画面クリックが減少',['bookingIntent']);
  if(valid(s.searchImpressions,s.searchImpressions?.previous,f.impression)&&ok(s.searchCtr)&&ok(s.searchCtr.previous)&&s.searchCtr.previous.value>=.02&&s.searchCtr.previous.value-s.searchCtr.value>=.02&&s.searchCtr.value<=s.searchCtr.previous.value*.8) add('I_SEARCH_CTR_DOWN','検索結果の表示が増え、クリック率は低下',['searchImpressions','searchCtr']);
  if(valid(s.searchClicks,s.searchClicks?.previous,f.click)&&s.searchClicks.value>s.searchClicks.previous.value&&ok(s.sessions)&&ok(s.sessions.previous)&&s.sessions.previous.value>=f.session[0]&&s.sessions.value-s.sessions.previous.value<f.session[1]&&s.sessions.value<s.sessions.previous.value*1.1) add('I_SEARCH_VISITS_DIVERGE','検索クリック増に対し訪問の伸びは確認できません',['searchClicks','sessions'],'low');
  if(valid(s.sessions,s.sessions?.previous,f.session)&&s.sessions.value>s.sessions.previous.value&&ok(s.bookingIntent)&&ok(s.bookingIntent.previous)&&s.bookingIntent.previous.value>=f.cta[0]&&s.bookingIntent.value-s.bookingIntent.previous.value<3) add('I_VISITS_INTENT_FLAT','訪問は増えていますが予約画面クリックは横ばい',['sessions','bookingIntent']);
  const unavailable=['search','ga4'].some(key=>!['VALUE','ZERO'].includes(health[key]?.status)) || ['bookingIntent','lineIntent'].some(key=>!ok(s[key]));
  const core=['sessions','searchClicks','bookingIntent','lineIntent'];
  const complete=core.every(k=>ok(s[k])&&ok(s[k].previous));
  const header=unavailable?{ruleId:'H_DATA',state:'partial',headline:'一部のデータを確認できません',confidence:'high'}:insights[0]?{...insights[0],state:insights[0].ruleId.includes('DOWN')?'declining':'improving'}:complete?{ruleId:'H_STABLE',state:'stable',headline:'大きな変化は確認されていません',confidence:'medium'}:{ruleId:'H_INSUFFICIENT',state:'insufficient_data',headline:'比較できるデータがまだ十分ではありません',confidence:'high'};
  return {header,insights:insights.slice(0,3)};
}
const median=a=>{const b=[...a].sort((x,y)=>x-y);return (b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2;};
export function anomalies(rows,key){
  const spec={searchClicks:{floor:1,minimum:10,delta:8,base:10},searchImpressions:{floor:10,minimum:30,delta:40,base:30},sessions:{floor:2,minimum:10,delta:8,base:10}}[key];
  if(!spec)return [];
  const out=[];
  for(let i=28;i<rows.length;i++) {
    const actual=rows[i]?.[key]; if(!ok(actual))continue;
    const previous=[7,14,21,28].map(n=>rows[i-n]?.[key]);if(previous.some(x=>!ok(x)))continue;
    const values=previous.map(x=>x.value),m=median(values),mad=median(values.map(x=>Math.abs(x-m))),diff=actual.value-m;
    if(Math.abs(.6745*diff/Math.max(mad,spec.floor))<3.5||Math.abs(diff)<spec.delta||Math.abs(diff)/Math.max(m,1)<.6)continue;
    if(diff>0&&actual.value<spec.minimum||diff<0&&m<spec.base)continue;
    out.push({id:`${key}:${rows[i].date}`,date:rows[i].date,metric:key,direction:diff>0?'up':'down',observed:actual.value,baseline:m,baselineDates:[7,14,21,28].map(n=>rows[i-n].date),severity:Math.abs(diff),confidence:'medium',evidenceRef:`?date=${rows[i].date}`});
  }
  return out.sort((a,b)=>b.severity-a.severity).slice(0,5).sort((a,b)=>a.date.localeCompare(b.date));
}
