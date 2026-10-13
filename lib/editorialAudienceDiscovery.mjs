// Phase 6B | Audience Discovery v0.8 | pure, side-effect-free ranking and audit.
// Actual impressions and search volume are NOT inferred. No extra model call.
import { evaluateArticleOverlap, articleHistoryFromRows } from './editorialArticleOverlap.mjs';

const STAGES=new Set(['PROBLEM_AWARE','EXPLORING_OPTIONS','CATEGORY_AWARE','READY_TO_VISIT','EXISTING_USER']);
const HOOKS=new Set(['RECOGNITION','MISCONCEPTION','DISCOVERY','COMPARISON','SITUATION','UNCERTAINTY']);
const ACTIONS=new Set(['NEW_ARTICLE','UPDATE_EXISTING','HOLD_FOR_FACTS','REJECT']);
const MAX={reader_relevance:25,novelty:25,seo_intent:20,service_fit:15,evidence_readiness:15};
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const clean=s=>String(s??'').trim();

export function audienceMode(mode=process.env.THE_REV_AUDIENCE_DISCOVERY_MODE){
  const v=clean(mode).toUpperCase();return v==='SHADOW'||v==='ENFORCE'?v:'OFF';
}

export function audienceMetadata(candidate={}){
  if(candidate.audience_v08&&typeof candidate.audience_v08==='object'&&!Array.isArray(candidate.audience_v08))return candidate.audience_v08;
  const note=clean(candidate.notes);
  // Preserve canonical Sheet's notes column, no schema migration required.
  const line=note.split(/\r?\n/).find(x=>x.startsWith('AUDIENCE_V08:'));
  if(!line)return null;
  try{const value=JSON.parse(line.slice('AUDIENCE_V08:'.length));return value&&!Array.isArray(value)&&typeof value==='object'?value:null;}catch{return null;}
}

export function auditAudienceScores(scores){
  const errors=[];let total=0;
  for(const [key,cap] of Object.entries(MAX)){
    const n=scores?.[key];
    if(!Number.isInteger(n)||n<0||n>cap)errors.push('SCORE_INVALID:'+key);
    else total+=n;
  }
  if(scores&&Object.hasOwn(scores,'total_score')&&scores.total_score!==total)errors.push('SCORE_INVALID:total_score');
  return {pass:errors.length===0,total,errors};
}

function nearArticles(candidate,history){
  const direct=evaluateArticleOverlap(candidate,history);
  const ids=(audienceMetadata(candidate)?.nearest_content_ids||[]);
  const matched=ids.filter(id=>history.some(row=>[row.content_id,row.editorial_content_id,row.slug].includes(id)));
  return {direct,matched_ids:matched};
}

export function evaluateAudienceCandidate(candidate={}, {history=[],gscEvidenceByQuery={}}={}){
  const meta=audienceMetadata(candidate),errors=[],notices=[];
  if(!meta)return {eligible:false,errors:['INCOMPLETE_READER_CONTRACT:METADATA_MISSING'],score:0,meta:null,notices};
  const stage=clean(meta.audience_stage).toUpperCase(),hook=clean(meta.psychological_hook).toUpperCase();
  const scene=clean(meta.reader_scene),job=clean(meta.reader_job),question=clean(meta.reader_question||candidate.audience_question);
  const takeaway=clean(meta.new_reader_takeaway),incremental=clean(meta.incremental_answer);
  const fit=clean(meta.natural_service_fit),action=clean(meta.content_action).toUpperCase();
  const signal=clean(meta.search_signal_type).toUpperCase(), query=clean(candidate.primary_query);
  if(!STAGES.has(stage)||!HOOKS.has(hook)||!scene||!job||!question)errors.push('NO_CLEAR_READER');
  if(!takeaway||!incremental)errors.push('INCOMPLETE_READER_CONTRACT');
  if(!ACTIONS.has(action))errors.push('CONTENT_ACTION_MISSING');
  if(action==='UPDATE_EXISTING')errors.push('ANSWER_ALREADY_EXISTS:UPDATE_EXISTING');
  if(action==='REJECT')errors.push('ANSWER_ALREADY_EXISTS:REJECT');
  if(action==='HOLD_FOR_FACTS')errors.push('NO_EVIDENCE_PLAN:HOLD_FOR_FACTS');
  if(!fit)errors.push('SERVICE_MISFIT:FIT_UNEXPLAINED');
  if(meta.unverified_health_claim===true||meta.unverified_therapeutic_promise===true)errors.push('UNVERIFIED_HEALTH_CLAIM');
  if(!query||!signal)errors.push('SEARCH_INTENT_UNCLEAR');
  const evidence=Array.isArray(meta.evidence_items)?meta.evidence_items:[];
  if(evidence.length===0)errors.push('NO_EVIDENCE_PLAN');
  if(evidence.some(e=>!clean(e.kind)||!clean(e.source)||!['FIRST_PARTY_VERIFIED','EXTERNAL_VERIFIED','RESEARCH_INTERPRETATION','HYPOTHESIS','UNKNOWN'].includes(e.kind)))errors.push('NO_EVIDENCE_PLAN:BAD_PROVENANCE');
  const archived=nearArticles(candidate,history);
  if(archived.direct.overlap)errors.push('ANSWER_ALREADY_EXISTS:ARTICLE_OVERLAP');
  // A model's duplicate judgment is informative, never authority to ignore the mechanical gate.
  if(meta.same_answer_as_existing===true)errors.push('ANSWER_ALREADY_EXISTS:SELF_REPORTED');
  const existingNotes=Array.isArray(meta.nearest_content_ids)?meta.nearest_content_ids:[];
  if(existingNotes.length>0&&archived.matched_ids.length===0)notices.push('NEAREST_ARTICLE_IDS_NOT_IN_HISTORY');
  if(!incremental||/^(同じ|言い換え|別の表現|一般論)$/u.test(incremental))errors.push('ANGLE_ONLY_REPHRASE');
  if(/(必ず治る|絶対治る|確実に治る|肩こりが治る|病気が治る)/u.test(candidate.title_candidate||candidate.topic||''))errors.push('UNVERIFIED_HEALTH_CLAIM:TITLE');
  const actual=gscEvidenceByQuery[query];
  const measured=Boolean(actual&&actual.verified===true&&actual.source==='GOOGLE_SEARCH_CONSOLE'&&Number.isFinite(actual.impressions)&&actual.impressions>=0);
  if(!measured)notices.push('SEARCH_VOLUME_UNVERIFIED');
  // Heuristic editorial priority, not audience preference measured in experiments.
  const scores={
    reader_relevance:(STAGES.has(stage)?5:0)+(HOOKS.has(hook)?5:0)+(scene.length>=12?5:0)+(job.length>=6?5:0)+(question.length>=8?5:0),
    novelty:(takeaway.length>=15?10:0)+(incremental.length>=12?10:0)+(!archived.direct.overlap&&meta.same_answer_as_existing!==true?5:0),
    seo_intent:(query.length>=5?7:0)+(question.length>=8?5:0)+(measured?8:0),
    service_fit:fit.length>=14?15:fit.length>=6?8:0,
    evidence_readiness:evidence.some(e=>e.kind==='FIRST_PARTY_VERIFIED'||e.kind==='EXTERNAL_VERIFIED')?15:evidence.some(e=>e.kind==='RESEARCH_INTERPRETATION')?12:evidence.some(e=>e.kind==='HYPOTHESIS')?8:0
  };
  const audit=auditAudienceScores(scores);
  if(!audit.pass)errors.push(...audit.errors);
  if(audit.total<70||scores.reader_relevance<15||scores.novelty<15)errors.push('BELOW_AUDIENCE_GATE');
  return {eligible:errors.length===0,errors,notices,score:audit.total,scores,meta:{...meta,audience_stage:stage,psychological_hook:hook,content_action:action},nearest_articles:archived.matched_ids,search_measured:measured,measured_impressions:measured?actual.impressions:null};
}

export function selectAudienceCandidates(evaluated, {history=[],gscEvidenceByQuery={},count=3}={}){
  // evaluateCandidates has already validated ownership, topic-age and article overlap.
  const audited=evaluated.map(entry=>({...entry,audience:evaluateAudienceCandidate(entry.candidate,{history,gscEvidenceByQuery})}));
  const eligible=audited.filter(entry=>entry.eligible&&entry.audience.eligible);
  eligible.sort((a,b)=>b.audience.score-a.audience.score||b.score-a.score||a.candidate_id.localeCompare(b.candidate_id));
  const chosen=[],stages=new Set(),jobs=new Set();
  for(const e of eligible){
    const stage=e.audience.meta.audience_stage,job=normalize(e.audience.meta.reader_job);
    if((!stages.has(stage)||!jobs.has(job))&&chosen.length<count){
      chosen.push(e);stages.add(stage);jobs.add(job);
    }
  }
  for(const e of eligible)if(chosen.length<count&&!chosen.includes(e))chosen.push(e);
  return {selected:chosen,audited,eligible_count:eligible.length,required_count:count};
}

export const AUDIENCE_SCORE_MAXIMA=Object.freeze(MAX);
