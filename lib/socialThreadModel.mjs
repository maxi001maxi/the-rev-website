const t=(v,n=8000)=>String(v??'').trim().slice(0,n);
const arr=v=>Array.isArray(v)?v:[];

export const THREAD_CONTENT_JOBS=new Set([
  'PERSPECTIVE_JUDGMENT','FIELD_NOTE_OBSERVATION','MINI_KNOWLEDGE_THROUGH_JUDGMENT',
  'HUMAN_TEXTURE','CONVERSATION','LOCAL_CONTEXT','STORE_PROCESS_EXPERIENCE','LIGHT_PROMOTION'
]);
export const THREAD_EVIDENCE_TYPES=new Set([
  'CUSTOMER_SIGNAL','PERFORMANCE','OPERATOR_FIRST_PARTY','STORE_EVENT',
  'FACT_REGISTRY','RESEARCH_CANON','RAW_RESEARCH','TREND_SIGNAL','PRODUCTION_LEARNING'
]);
export const THREAD_EVIDENCE_ROLES=new Set(['PRIMARY','CORROBORATING','COUNTEREVIDENCE']);

const AUTHORITY={CUSTOMER_SIGNAL:6,PERFORMANCE:5,OPERATOR_FIRST_PARTY:6,STORE_EVENT:6,FACT_REGISTRY:6,RESEARCH_CANON:4,RAW_RESEARCH:3,TREND_SIGNAL:2,PRODUCTION_LEARNING:4};
const bounded=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
const texts=(v,max=30,n=500)=>arr(v).map(x=>t(x,n)).filter(Boolean).slice(0,max);

export function normalizeThreadEvidence(input={}){
  const evidence_key=t(input.evidence_key||input.key,300);
  const source_type=t(input.source_type,80).toUpperCase();
  const evidence_text=t(input.evidence_text||input.summary||input.text,8000);
  if(!evidence_key)throw new Error('SOCIAL_THREAD_EVIDENCE_KEY_REQUIRED');
  if(!THREAD_EVIDENCE_TYPES.has(source_type))throw new Error('SOCIAL_THREAD_EVIDENCE_SOURCE_INVALID');
  if(!evidence_text)throw new Error('SOCIAL_THREAD_EVIDENCE_TEXT_REQUIRED');
  const privacy_scope=t(input.privacy_scope||'INTERNAL',40).toUpperCase();
  const allowed_use=t(input.allowed_use||'INTERNAL_REASONING',80).toUpperCase();
  if(!['PUBLIC','INTERNAL','CONFIDENTIAL'].includes(privacy_scope))throw new Error('SOCIAL_THREAD_EVIDENCE_PRIVACY_INVALID');
  if(!['INTERNAL_REASONING','PARAPHRASE_OK','PUBLIC_QUOTE_OK'].includes(allowed_use))throw new Error('SOCIAL_THREAD_EVIDENCE_USE_INVALID');
  return {
    evidence_key,source_type,evidence_text,
    source_ref:t(input.source_ref,1200)||null,
    source_date:input.source_date||null,
    freshness:t(input.freshness,80)||null,
    audience_state:t(input.audience_state,120)||null,
    topic:t(input.topic,500)||null,
    signal:t(input.signal,2000)||null,
    truth_authority:bounded(input.truth_authority,1,6,AUTHORITY[source_type]||3),
    decision_relevance:bounded(input.decision_relevance,1,8,4),
    confidence:bounded(input.confidence,0,1,0.5),
    privacy_scope,allowed_use,
    tags:texts(input.tags,30,120),
    metadata:input.metadata&&typeof input.metadata==='object'&&!Array.isArray(input.metadata)?input.metadata:{}
  };
}

export function normalizeThreadCandidate(input={},candidate_no,evidenceKeys=new Set()){
  const title=t(input.title,500);
  const content_job=t(input.content_job,120).toUpperCase();
  const confidence=t(input.confidence||'LOW',40).toUpperCase();
  const evidence_strength=t(input.evidence_strength||'UNGROUNDED',40).toUpperCase();
  const qc_decision=t(input.qc_decision||'REVIEW_REQUIRED',80).toUpperCase();
  const why_now=t(input.why_now,5000);
  if(!title)throw new Error('SOCIAL_THREAD_CANDIDATE_TITLE_REQUIRED');
  if(!THREAD_CONTENT_JOBS.has(content_job))throw new Error('SOCIAL_THREAD_CONTENT_JOB_INVALID');
  if(!['HIGH','MEDIUM','LOW'].includes(confidence))throw new Error('SOCIAL_THREAD_CONFIDENCE_INVALID');
  if(!['GROUNDED','EXPLORATORY','UNGROUNDED'].includes(evidence_strength))throw new Error('SOCIAL_THREAD_EVIDENCE_STRENGTH_INVALID');
  if(!['READY_FOR_APPROVAL','REVIEW_REQUIRED','BLOCKED','HOLD'].includes(qc_decision))throw new Error('SOCIAL_THREAD_QC_DECISION_INVALID');
  if(!why_now)throw new Error('SOCIAL_THREAD_WHY_NOW_REQUIRED');
  const links=arr(input.evidence_links||input.evidence_refs).map(x=>{
    const key=t(x?.evidence_key||x?.key,300);
    const role=t(x?.role||'CORROBORATING',40).toUpperCase();
    if(!key||!evidenceKeys.has(key)||!THREAD_EVIDENCE_ROLES.has(role))throw new Error('SOCIAL_THREAD_EVIDENCE_LINK_INVALID');
    return {key,role};
  });
  if(!links.some(x=>x.role==='PRIMARY'))throw new Error('SOCIAL_THREAD_PRIMARY_EVIDENCE_REQUIRED');
  if(evidence_strength==='UNGROUNDED'&&!['BLOCKED','HOLD'].includes(qc_decision))throw new Error('SOCIAL_THREAD_UNGROUNDED_MUST_BLOCK');
  return {
    row:{
      candidate_no,title,content_job,
      secondary_jobs:texts(input.secondary_jobs,8,120).map(x=>x.toUpperCase()).filter(x=>THREAD_CONTENT_JOBS.has(x)),
      draft_text:t(input.draft_text||input.text,12000)||null,
      why_now,
      audience_signal:t(input.audience_signal,4000)||null,
      observed_tension:t(input.observed_tension,4000)||null,
      interpretation:t(input.interpretation,6000)||null,
      hypothesis:t(input.hypothesis,6000)||null,
      expected_behavior:t(input.expected_behavior,4000)||null,
      confidence,evidence_strength,
      evidence_gaps:texts(input.evidence_gaps,20,1000),
      test_metrics:texts(input.test_metrics,20,200),
      counterevidence_summary:t(input.counterevidence_summary,5000)||null,
      generalization_flags:texts(input.generalization_flags,20,500),
      qc_decision,status:'CANDIDATE',
      evidence_packet:{
        ...(input.evidence_packet&&typeof input.evidence_packet==='object'&&!Array.isArray(input.evidence_packet)?input.evidence_packet:{}),
        primary_keys:links.filter(x=>x.role==='PRIMARY').map(x=>x.key),
        corroborating_keys:links.filter(x=>x.role==='CORROBORATING').map(x=>x.key),
        counterevidence_keys:links.filter(x=>x.role==='COUNTEREVIDENCE').map(x=>x.key)
      },
      source_refs:texts(input.source_refs,30,1200),
      research_refs:texts(input.research_refs,30,1200)
    },
    links
  };
}

export function normalizeCustomerSignal(input={}){
  for(const key of ['full_name','email','phone','customer_name']){
    if(t(input[key],500))throw new Error('SOCIAL_CUSTOMER_SIGNAL_PII_NOT_ALLOWED');
  }
  const source_type=t(input.source_type||input.source,80).toUpperCase();
  const consent_scope=t(input.consent_scope||'INTERNAL_ONLY',80).toUpperCase();
  if(!['TRIAL','INQUIRY','CONSULTATION','FEEDBACK','DM','LINE','IN_PERSON','SURVEY'].includes(source_type))throw new Error('SOCIAL_CUSTOMER_SIGNAL_SOURCE_INVALID');
  if(!['INTERNAL_ONLY','ANONYMIZED_SOCIAL','EXPLICIT_PUBLIC'].includes(consent_scope))throw new Error('SOCIAL_CUSTOMER_SIGNAL_CONSENT_INVALID');
  const row={
    observed_at:input.observed_at||new Date().toISOString(),source_type,
    audience_state:t(input.audience_state,120)||null,
    tension:t(input.tension,4000)||null,
    question:t(input.question,4000)||null,
    desired_outcome:t(input.desired_outcome,4000)||null,
    decision_barrier:t(input.decision_barrier,4000)||null,
    attraction:t(input.attraction,4000)||null,
    anonymized_quote:t(input.anonymized_quote,4000)||null,
    source_ref:t(input.source_ref,1000)||null,
    confidence:bounded(input.confidence,0,1,0.5),consent_scope,
    tags:texts(input.tags,30,120),
    metadata:input.metadata&&typeof input.metadata==='object'&&!Array.isArray(input.metadata)?input.metadata:{},
    updated_at:new Date().toISOString()
  };
  if(![row.tension,row.question,row.desired_outcome,row.decision_barrier,row.attraction,row.anonymized_quote].some(Boolean))throw new Error('SOCIAL_CUSTOMER_SIGNAL_CONTENT_REQUIRED');
  return row;
}
