// Fresh daily selection: never backfill a new LINE notification with last week's
// high-scoring shortlist or the fixed v0.7 technical topic idea bank.
// Intentional exclusions are editorial decisions, not a fabricated SEO signal.
import {toJstDateKey} from './dailyEditorialStateMachine.mjs';
import {audienceMetadata} from './editorialAudienceDiscovery.mjs';

export const DISMISSED_TOPICS = Object.freeze([
  'パーソナルジムは何で選ぶ？初心者が「きつさ」より先に確認したい5つのこと',
  'パーソナルジムは何で選ぶ？結果の前に確認したい「無理をさせない」5つのポイント',
  'ミット打ちで肩に力が入るとき、最初に見直すこと',
  'DENBA Healthで説明できること・まだ断定できないこと',
  'DENBA Healthの機器とマット、それぞれ何をするもの？'
]);
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const banned=new Set(DISMISSED_TOPICS.map(norm));
export function isDismissedTopic(c){
 return banned.has(norm(c?.title_candidate||c?.topic)) ||
   // Prevent yesterday's dismissed 'gym-selection tips' article from
   // sneaking back by changing a few words and a number.
   /パーソナルジム.*(?:何で選ぶ|選び方|選ぶポイント|体験で何を確認)/u.test(c?.title_candidate||'');
}
export function freshDailyShortlist(shortlist=[],now=new Date()){
 const today=toJstDateKey(now).replaceAll('-','');
 const isDaily=c=>/^BT-\d{8}-(?:DAILY|AUD08)-\d+$/.test(String(c?.candidate_id||''));
 const hasDaily=shortlist.some(isDaily);
 // Test fixtures and non-daily manual selection are not silently discarded.
 if(!hasDaily)return {source:'LEGACY_NO_DAILY_POOL',strict:false,candidates:shortlist.filter(c=>!isDismissedTopic(c))};
 const hasAudience08=shortlist.some(c=>String(c.candidate_id||'').startsWith('BT-'+today+'-AUD08-'));
 const prefix='BT-'+today+'-'+(hasAudience08?'AUD08':'DAILY')+'-';
 const candidates=shortlist.filter(c=>{
   if(!String(c.candidate_id||'').startsWith(prefix)||isDismissedTopic(c))return false;
   const m=audienceMetadata(c);
   return m&&m.reader_scene&&m.reader_job&&m.reader_question&&m.new_reader_takeaway&&m.incremental_answer
     &&m.content_action==='NEW_ARTICLE'&&Array.isArray(m.evidence_items)&&m.evidence_items.length>0;
 });
 return {source:hasAudience08?'TODAY_AUDIENCE08_ONLY':'TODAY_DAILY_AUDIENCE_CONTRACT_REQUIRED',strict:true,candidates};
}
export function shouldReplaceWaitingProposal(proposal, pool, evaluation=[]){
 const options=proposal?.options||[];
 if(!Array.isArray(options)||options.length!==3)return true;
 if(options.some(o=>isDismissedTopic(o.candidate||{title_candidate:o.title})))return true;
 if(pool.strict){
  const ids=new Set(pool.candidates.map(c=>c.candidate_id));
  if(options.some(o=>!ids.has(o.candidate_id)))return true;
 }
 return evaluation.length!==options.length||evaluation.some(e=>!e.eligible);
}
