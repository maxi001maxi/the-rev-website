// Editorial Media Portfolio v1. Role and service topic are separate axes.
// Counts are soft editorial guidance, never quotas that bypass content quality.
import {audienceMetadata} from './editorialAudienceDiscovery.mjs';
export const EDITORIAL_ROLES=Object.freeze({
 KNOWLEDGE:{label:'知識・身近な疑問',target:5},
 SERVICE_EXPERIENCE:{label:'サービスの利用・体験',target:3},
 FACILITY_AND_TRUST:{label:'店舗・設備・人への信頼',target:2},
 COMPARISON_DECISION:{label:'比較・来店前の判断',target:2},
 COMMUNITY_STORY:{label:'地域・人物・企画',target:0}
});
const names=new Set(Object.keys(EDITORIAL_ROLES));
const clean=s=>String(s??'').trim();
const textOf=c=>clean(c?.title_candidate||c?.title||c?.topic);
const idOf=x=>clean(x?.editorial_content_id||x?.content_id||x?.slug);
export function classifyEditorialRole(candidate={}){
 const meta=audienceMetadata(candidate);
 const declared=clean(meta?.editorial_role||candidate.editorial_role).toUpperCase();
 if(names.has(declared))return {role:declared,source:'EXPLICIT'};
 const title=textOf(candidate),lane=clean(candidate.editorial_lane||candidate.content_cluster).toUpperCase();
 if(/地域の人|奈良の人|街歩き|新大宮の街|インタビュー|イベント|お客様の声|トレーナーの一日/u.test(title))
  return {role:'COMMUNITY_STORY',source:'TITLE_HEURISTIC'};
 if(/THE REV.*(?:設備|空間|施設|見学|スタッフ)|店内(?:を|紹介|の)|(?:施設|店舗|ジム)ツアー|更衣室|シャワー|トレーナー紹介|完全予約制.*(?:設備|過ごし方)/iu.test(title)||lane==='FACILITY_THE_REV')
  return {role:'FACILITY_AND_TRUST',source:'TITLE_HEURISTIC'};
 if(/新大宮で.*(?:ジムを選ぶ|ジムを探す|違い)|比較|どちらがいい|選び方|どこを選ぶ/u.test(title))
  return {role:'COMPARISON_DECISION',source:'TITLE_HEURISTIC'};
 if(/体験当日|当日の流れ|体験.*(?:何をする|流れ)|酸素ルームの中では何をする|ボクシングは怖そう|(?:初めて|初回).*(?:予約|利用|体験)|ミット打ちの前に知りたい/u.test(title))
  return {role:'SERVICE_EXPERIENCE',source:'TITLE_HEURISTIC'};
 return {role:'KNOWLEDGE',source:'TITLE_HEURISTIC'};
}
export function publishedMediaHistory(history=[],max=12){
 const latest=new Map();
 for(const row of history){
  if(row?.publish_status!=='PUBLISHED'||!idOf(row))continue;
  const key=idOf(row),previous=latest.get(key);
  if(!previous||clean(row.published_at||row.updated_at||row.created_at)>
    clean(previous.published_at||previous.updated_at||previous.created_at))latest.set(key,row);
 }
 return [...latest.values()].sort((a,b)=>
  clean(b.published_at||b.created_at).localeCompare(clean(a.published_at||a.created_at))
  ||clean(b.created_at).localeCompare(clean(a.created_at))
  ||idOf(a).localeCompare(idOf(b))).slice(0,max);
}
export function editorialPortfolioSnapshot(history=[],window=12){
 const rows=publishedMediaHistory(history,window);
 const counts=Object.fromEntries(Object.keys(EDITORIAL_ROLES).map(role=>[role,0]));
 const topics={},uncertain=[];
 const classified=rows.map(row=>{
  const c=classifyEditorialRole(row);counts[c.role]++;
  if(c.source!=='EXPLICIT')uncertain.push(idOf(row));
  const lane=clean(row.content_cluster||row.editorial_lane||row.category||'UNCLASSIFIED').toUpperCase();
  topics[lane]=(topics[lane]||0)+1;
  return {id:idOf(row),title:textOf(row),role:c.role,source:c.source,topic:lane};
 });
 const deficits=Object.fromEntries(Object.entries(EDITORIAL_ROLES).map(([role,v])=>[role,Math.max(0,v.target-counts[role])]));
 return {window,observed:rows.length,counts,deficits,topics,articles:classified,heuristic_ids:uncertain,source:'AUTHORITATIVE_PUBLISHED_CMS_ONLY',targets_are_soft:true};
}
export function portfolioRoleScore(role,portfolio){
 if(portfolio.observed<6)return 0; // Insufficient verified published history is not a proven deficit.
 const target=EDITORIAL_ROLES[role]?.target||0;
 if(!target)return 1; // Flexible community opportunity, not advertorial quota.
 return Math.min(12,Math.round((Math.max(0,target-(portfolio.counts[role]||0))/target)*12));
}
export function selectEditorialPortfolio(entries=[],{history=[],count=3}={}){
 const portfolio=editorialPortfolioSnapshot(history);
 const ranked=entries.map(entry=>{
  const classification=classifyEditorialRole(entry.candidate||entry);
  const base=entry.audience?.score??entry.score??0;
  // New reader acquisition remains primary: legacy specialist topics are
  // eligible but should not displace distinctly new earlier-stage questions.
  const stagePenalty=entry.audience?.meta?.audience_stage==='EXISTING_USER'?12:0;
  return {...entry,editorial_role:classification.role,role_source:classification.source,media_priority:base-stagePenalty+portfolioRoleScore(classification.role,portfolio)};
 }).sort((a,b)=>b.media_priority-a.media_priority||
  (b.audience?.score??b.score??0)-(a.audience?.score??a.score??0)||
  clean(a.candidate_id).localeCompare(clean(b.candidate_id)));
 const chosen=[],roles=new Set(),jobs=new Set();
 for(const e of ranked){
  const job=clean(audienceMetadata(e.candidate)?.reader_job||e.candidate?.audience_question).normalize('NFKC');
  if(!roles.has(e.editorial_role)&&(!job||!jobs.has(job))&&chosen.length<count){
   chosen.push(e);roles.add(e.editorial_role);if(job)jobs.add(job);
  }
 }
 for(const e of ranked)if(chosen.length<count&&!chosen.includes(e)){
  const job=clean(audienceMetadata(e.candidate)?.reader_job||e.candidate?.audience_question).normalize('NFKC');
  if(!job||!jobs.has(job)){chosen.push(e);roles.add(e.editorial_role);if(job)jobs.add(job);}
 }
 for(const e of ranked)if(chosen.length<count&&!chosen.includes(e))chosen.push(e);
 return {selected:chosen,ranked,portfolio,projected:projectMediaMix(portfolio,chosen)};
}
export function projectMediaMix(snapshot,selected=[]){
 const counts={...snapshot.counts};
 for(const e of selected)counts[e.editorial_role||classifyEditorialRole(e.candidate||e).role]++;
 return counts;
}
export function portfolioNotice(snapshot){
 if(snapshot.observed<6)return '公開済み記事の履歴がまだ少ないため、配分は仮判定です。記事の質と根拠を優先します。';
 const shortage=Object.entries(snapshot.deficits).filter(([role,n])=>n>=1&&role!=='KNOWLEDGE').sort((a,b)=>b[1]-a[1]);
 return shortage.length?'直近'+snapshot.observed+'本の編成で不足: '+shortage.map(([r,n])=>EDITORIAL_ROLES[r].label+' '+n+'本').join('、')+'（12本の柔軟な目安）':'公開済みの記事は主要な役割が概ね揃っています。配分は固定ではありません。';
}
