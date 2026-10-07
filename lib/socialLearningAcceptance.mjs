import {evaluateSocialDirectorOutputs} from './socialDirector.mjs';

const t=(v,n=12000)=>String(v??'').trim().slice(0,n);
const nt=(v,n)=>{const s=t(v,n);return s||null;};
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const bounded=(v,min,max,fallback)=>{
  const n=Number(v);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
};

const CHANNELS=new Set(['REEL','STORIES','THREADS']);
const LEARNING_TYPES=new Set(['USER_PREFERENCE','CREATIVE','EDITORIAL','QC','PERFORMANCE','BRAND']);
const LEARNING_SCOPES=new Set(['SHARED','STRATEGIST','CREATIVE_DIRECTOR','EDITOR','QC']);
const DIRECTIONS=new Set(['SUPPORT','COUNTER','NEUTRAL']);

function metricSnapshot(row){
  if(!row)return {};
  const out={};
  for(const key of ['reach','views','likes','saves','shares','comments','profile_visits','website_clicks','follows']){
    if(row[key]!==null&&row[key]!==undefined)out[key]=Number(row[key]);
  }
  if(row.observed_at)out.observed_at=row.observed_at;
  if(row.source)out.source=row.source;
  return out;
}

async function loadDirectorAssignment({supabase,id,channel,opportunityId}){
  if(!id)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_REQUIRED');
  const a=await supabase.from('social_director_channel_assignments').select('*').eq('id',id).maybeSingle();
  if(a.error)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_READ_FAILED');
  if(!a.data)throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_REQUIRED');
  if(a.data.channel!==channel||a.data.opportunity_id!==opportunityId){
    throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_LINEAGE_INVALID');
  }
  if(['BLOCKED','HOLD'].includes(a.data.qc_decision))throw new Error('SOCIAL_DIRECTOR_ASSIGNMENT_NOT_APPROVABLE');
  return a.data;
}

async function getEvidenceOutput({supabase,channel,targetDate,outputNo,outputId,runMode='SHADOW'}){
  const ch=t(channel,40).toUpperCase();
  if(!CHANNELS.has(ch))throw new Error('SOCIAL_OUTPUT_CHANNEL_INVALID');
  if(outputId){
    if(ch==='REEL'){
      const row=await supabase.from('social_reel_evidence_candidates').select('*').eq('id',outputId).maybeSingle();
      if(row.error)throw new Error('SOCIAL_REEL_EVIDENCE_READ_FAILED');
      if(!row.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
      return {channel:ch,output:row.data};
    }
    if(ch==='STORIES'){
      const row=await supabase.from('social_story_evidence_items').select('*').eq('id',outputId).maybeSingle();
      if(row.error)throw new Error('SOCIAL_STORY_EVIDENCE_READ_FAILED');
      if(!row.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
      return {channel:ch,output:row.data};
    }
    const row=await supabase.from('social_thread_candidates').select('*').eq('id',outputId).maybeSingle();
    if(row.error)throw new Error('SOCIAL_THREAD_CANDIDATE_READ_FAILED');
    if(!row.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
    return {channel:ch,output:row.data};
  }

  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const no=Number(outputNo);
  if(!Number.isFinite(no))throw new Error('SOCIAL_OUTPUT_NUMBER_REQUIRED');

  if(ch==='REEL'){
    const run=await supabase.from('social_reel_evidence_runs').select('*')
      .eq('target_date',targetDate).eq('run_mode',t(runMode,40).toUpperCase()).maybeSingle();
    if(run.error)throw new Error('SOCIAL_REEL_EVIDENCE_RUN_READ_FAILED');
    if(!run.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
    const row=await supabase.from('social_reel_evidence_candidates').select('*')
      .eq('run_id',run.data.id).eq('candidate_no',no).maybeSingle();
    if(row.error)throw new Error('SOCIAL_REEL_EVIDENCE_READ_FAILED');
    if(!row.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
    return {channel:ch,output:row.data,run:run.data};
  }

  if(ch==='STORIES'){
    const run=await supabase.from('social_story_evidence_runs').select('*')
      .eq('target_date',targetDate).eq('run_mode',t(runMode,40).toUpperCase()).maybeSingle();
    if(run.error)throw new Error('SOCIAL_STORY_EVIDENCE_RUN_READ_FAILED');
    if(!run.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
    const row=await supabase.from('social_story_evidence_items').select('*')
      .eq('run_id',run.data.id).eq('slot_no',no).maybeSingle();
    if(row.error)throw new Error('SOCIAL_STORY_EVIDENCE_READ_FAILED');
    if(!row.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
    return {channel:ch,output:row.data,run:run.data};
  }

  const plan=await supabase.from('social_thread_daily_plans').select('*')
    .eq('target_date',targetDate).maybeSingle();
  if(plan.error)throw new Error('SOCIAL_THREAD_PLAN_READ_FAILED');
  if(!plan.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
  const row=await supabase.from('social_thread_candidates').select('*')
    .eq('plan_id',plan.data.id).eq('candidate_no',no).maybeSingle();
  if(row.error)throw new Error('SOCIAL_THREAD_CANDIDATE_READ_FAILED');
  if(!row.data)throw new Error('SOCIAL_OUTPUT_NOT_FOUND');
  return {channel:ch,output:row.data,run:plan.data};
}

async function validateOutputLineage({supabase,channel,output}){
  if(!output.opportunity_id)throw new Error('SOCIAL_OUTPUT_OPPORTUNITY_REQUIRED');
  const assignment=await loadDirectorAssignment({
    supabase,id:output.director_assignment_id,channel,opportunityId:output.opportunity_id
  });
  return assignment;
}

export async function chooseEvidenceReelCandidate({
  supabase,targetDate,candidateNo,candidateId,runMode='SHADOW'
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const current=await getEvidenceOutput({
    supabase,channel:'REEL',targetDate,outputNo:candidateNo,outputId:candidateId,runMode
  });
  const candidate=current.output;
  if(candidate.qc_decision!=='READY_FOR_APPROVAL')throw new Error('SOCIAL_REEL_EVIDENCE_NOT_APPROVABLE');
  await validateOutputLineage({supabase,channel:'REEL',output:candidate});

  let run=current.run;
  if(!run){
    const r=await supabase.from('social_reel_evidence_runs').select('*').eq('id',candidate.run_id).maybeSingle();
    if(r.error||!r.data)throw new Error('SOCIAL_REEL_EVIDENCE_RUN_READ_FAILED');
    run=r.data;
  }
  const now=new Date().toISOString();
  const reject=await supabase.from('social_reel_evidence_candidates').update({status:'REJECTED'})
    .eq('run_id',run.id).neq('id',candidate.id).in('status',['CANDIDATE','REJECTED']);
  if(reject.error)throw new Error('SOCIAL_REEL_EVIDENCE_REJECT_FAILED');

  const selected=await supabase.from('social_reel_evidence_candidates').update({
    status:'SELECTED',selected_at:now
  }).eq('id',candidate.id).select('*').single();
  if(selected.error)throw new Error('SOCIAL_REEL_EVIDENCE_SELECT_FAILED');

  const runUp=await supabase.from('social_reel_evidence_runs').update({
    status:'SELECTED',selected_candidate_id:candidate.id,updated_at:now
  }).eq('id',run.id).select('*').single();
  if(runUp.error)throw new Error('SOCIAL_REEL_EVIDENCE_RUN_UPDATE_FAILED');
  return {run:runUp.data,selected:selected.data};
}

export async function approveEvidenceStory({
  supabase,targetDate,slotNo,itemId,runMode='SHADOW'
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const current=await getEvidenceOutput({
    supabase,channel:'STORIES',targetDate,outputNo:slotNo,outputId:itemId,runMode
  });
  const item=current.output;
  if(item.qc_decision!=='READY_FOR_APPROVAL')throw new Error('SOCIAL_STORY_EVIDENCE_NOT_APPROVABLE');
  await validateOutputLineage({supabase,channel:'STORIES',output:item});
  const up=await supabase.from('social_story_evidence_items').update({status:'APPROVED'})
    .eq('id',item.id).select('*').single();
  if(up.error)throw new Error('SOCIAL_STORY_EVIDENCE_APPROVE_FAILED');
  return up.data;
}

export async function markEvidenceOutputCreated({
  supabase,channel,targetDate,outputNo,outputId,runMode='SHADOW'
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const current=await getEvidenceOutput({supabase,channel,targetDate,outputNo,outputId,runMode});
  const ch=current.channel;
  const output=current.output;
  await validateOutputLineage({supabase,channel:ch,output});

  if(ch==='REEL'){
    if(output.status!=='SELECTED')throw new Error('SOCIAL_REEL_EVIDENCE_MUST_BE_SELECTED');
    const up=await supabase.from('social_reel_evidence_candidates').update({status:'CREATED'})
      .eq('id',output.id).select('*').single();
    if(up.error)throw new Error('SOCIAL_REEL_EVIDENCE_STATUS_UPDATE_FAILED');
    return {channel:ch,output:up.data};
  }
  if(ch==='STORIES'){
    if(output.status!=='APPROVED')throw new Error('SOCIAL_STORY_EVIDENCE_MUST_BE_APPROVED');
    const up=await supabase.from('social_story_evidence_items').update({status:'CREATED'})
      .eq('id',output.id).select('*').single();
    if(up.error)throw new Error('SOCIAL_STORY_EVIDENCE_STATUS_UPDATE_FAILED');
    return {channel:ch,output:up.data};
  }
  if(output.status!=='SELECTED')throw new Error('SOCIAL_THREAD_CANDIDATE_NOT_APPROVED');
  return {channel:ch,output};
}

export async function linkVerifiedDirectorPublication({
  supabase,channel,targetDate,outputNo,outputId,runMode='SHADOW',
  platform,platformMediaId
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const media=t(platformMediaId,300);
  if(!media)throw new Error('SOCIAL_MEDIA_ID_REQUIRED');
  const current=await getEvidenceOutput({supabase,channel,targetDate,outputNo,outputId,runMode});
  const ch=current.channel;
  const output=current.output;
  const assignment=await validateOutputLineage({supabase,channel:ch,output});

  if(ch==='REEL'&&!['SELECTED','CREATED'].includes(output.status))throw new Error('SOCIAL_REEL_EVIDENCE_NOT_APPROVED');
  if(ch==='STORIES'&&!['APPROVED','CREATED'].includes(output.status))throw new Error('SOCIAL_STORY_EVIDENCE_NOT_APPROVED');
  if(ch==='THREADS'&&output.status!=='SELECTED')throw new Error('SOCIAL_THREAD_CANDIDATE_NOT_APPROVED');

  const platformName=t(platform||(ch==='THREADS'?'THREADS':'INSTAGRAM'),40).toUpperCase();
  const post=await supabase.from('social_published_posts').select('*')
    .eq('platform',platformName).eq('platform_media_id',media).maybeSingle();
  if(post.error)throw new Error('SOCIAL_HISTORY_READ_FAILED');
  if(!post.data)throw new Error('SOCIAL_PUBLISHED_EVIDENCE_REQUIRED');

  const linkage={
    director_assignment_id:assignment.id,
    opportunity_id:output.opportunity_id,
    last_synced_at:new Date().toISOString()
  };
  if(ch==='REEL')linkage.reel_evidence_candidate_id=output.id;
  if(ch==='STORIES')linkage.story_evidence_item_id=output.id;
  if(ch==='THREADS')linkage.thread_candidate_id=output.id;

  const linked=await supabase.from('social_published_posts').update(linkage)
    .eq('id',post.data.id).select('*').single();
  if(linked.error)throw new Error('SOCIAL_PUBLICATION_LINEAGE_LINK_FAILED');

  const now=new Date().toISOString();
  if(ch==='REEL'){
    const up=await supabase.from('social_reel_evidence_candidates').update({
      status:'PUBLISHED_VERIFIED',published_post_id:post.data.id,published_verified_at:now
    }).eq('id',output.id).select('*').single();
    if(up.error)throw new Error('SOCIAL_REEL_EVIDENCE_STATUS_UPDATE_FAILED');
    return {channel:ch,output:up.data,post:linked.data};
  }
  if(ch==='STORIES'){
    const up=await supabase.from('social_story_evidence_items').update({
      status:'PUBLISHED_VERIFIED',published_post_id:post.data.id,published_verified_at:now
    }).eq('id',output.id).select('*').single();
    if(up.error)throw new Error('SOCIAL_STORY_EVIDENCE_STATUS_UPDATE_FAILED');
    return {channel:ch,output:up.data,post:linked.data};
  }

  const up=await supabase.from('social_thread_candidates').update({
    status:'PUBLISHED_VERIFIED'
  }).eq('id',output.id).select('*').single();
  if(up.error)throw new Error('SOCIAL_THREAD_STATUS_UPDATE_FAILED');
  if(current.run?.id){
    const p=await supabase.from('social_thread_daily_plans').update({
      status:'PUBLISHED_VERIFIED',selected_candidate_id:output.id,updated_at:now
    }).eq('id',current.run.id);
    if(p.error)throw new Error('SOCIAL_THREAD_PLAN_UPDATE_FAILED');
  }
  return {channel:ch,output:up.data,post:linked.data};
}

function normalizeLearningInput(input={}){
  const key=t(input.learning_key||input.key,300);
  const type=t(input.learning_type||input.type||'PERFORMANCE',80).toUpperCase();
  const scope=t(input.scope||'SHARED',80).toUpperCase();
  const statement=t(input.statement,8000);
  if(!key)throw new Error('SOCIAL_LEARNING_KEY_REQUIRED');
  if(!LEARNING_TYPES.has(type))throw new Error('SOCIAL_LEARNING_TYPE_INVALID');
  if(!LEARNING_SCOPES.has(scope))throw new Error('SOCIAL_LEARNING_SCOPE_INVALID');
  if(!statement)throw new Error('SOCIAL_LEARNING_STATEMENT_REQUIRED');
  return {
    learning_key:key,learning_type:type,scope,statement,
    reuse_weight:bounded(input.reuse_weight,0,1,0.5)
  };
}

async function findLinkedPost({supabase,postId,platform,platformMediaId}){
  let q=supabase.from('social_published_posts').select('*');
  if(postId)q=q.eq('id',postId);
  else{
    const media=t(platformMediaId,300);
    if(!media)throw new Error('SOCIAL_PUBLISHED_EVIDENCE_REQUIRED');
    q=q.eq('platform',t(platform,40).toUpperCase()).eq('platform_media_id',media);
  }
  const r=await q.maybeSingle();
  if(r.error)throw new Error('SOCIAL_HISTORY_READ_FAILED');
  if(!r.data)throw new Error('SOCIAL_PUBLISHED_EVIDENCE_REQUIRED');
  if(!r.data.director_assignment_id||!r.data.opportunity_id){
    throw new Error('SOCIAL_PUBLISHED_DIRECTOR_LINEAGE_REQUIRED');
  }
  return r.data;
}

function postChannel(post){
  if(post.thread_candidate_id)return 'THREADS';
  if(post.story_evidence_item_id)return 'STORIES';
  if(post.reel_evidence_candidate_id)return 'REEL';
  throw new Error('SOCIAL_PUBLISHED_CHANNEL_LINEAGE_REQUIRED');
}

export function computeLearningActivation({currentStatus='CANDIDATE',learningType='PERFORMANCE',observations=[]}){
  const rows=arr(observations);
  const support=rows.filter(x=>t(x.direction,40).toUpperCase()==='SUPPORT').length;
  const counter=rows.filter(x=>t(x.direction,40).toUpperCase()==='COUNTER').length;
  const neutral=rows.filter(x=>t(x.direction,40).toUpperCase()==='NEUTRAL').length;
  const avgConfidence=rows.length
    ?rows.reduce((s,x)=>s+bounded(x.confidence,0,1,0),0)/rows.length
    :0;
  let status=t(currentStatus||'CANDIDATE',40).toUpperCase();
  if(!['ACTIVE','SUPERSEDED','RETIRED'].includes(status)){
    status='CANDIDATE';
    if(
      t(learningType,80).toUpperCase()==='PERFORMANCE' &&
      support>=2 &&
      counter===0 &&
      avgConfidence>=0.65
    ) status='ACTIVE';
  }
  return {status,support,counter,neutral,distinct_posts:rows.length,average_confidence:avgConfidence};
}

export async function recordDirectorLearningObservation({
  supabase,learning,direction='NEUTRAL',rationale,confidence=0.5,
  postId,platform,platformMediaId,comparisonContext={}
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const normalized=normalizeLearningInput(learning);
  const dir=t(direction,40).toUpperCase();
  if(!DIRECTIONS.has(dir))throw new Error('SOCIAL_LEARNING_DIRECTION_INVALID');
  const reason=t(rationale,5000);
  if(!reason)throw new Error('SOCIAL_LEARNING_RATIONALE_REQUIRED');

  const post=await findLinkedPost({supabase,postId,platform,platformMediaId});
  const channel=postChannel(post);

  const duplicate=await supabase.from('social_learning_observations').select('*')
    .eq('learning_key',normalized.learning_key).eq('source_post_id',post.id).maybeSingle();
  if(duplicate.error)throw new Error('SOCIAL_LEARNING_OBSERVATION_READ_FAILED');
  if(duplicate.data){
    const existing=await supabase.from('social_production_learnings').select('*')
      .eq('id',duplicate.data.learning_id).maybeSingle();
    if(existing.error)throw new Error('SOCIAL_LEARNING_READ_FAILED');
    return {learning:existing.data,observation:duplicate.data,idempotent:true};
  }

  let latestMetric=null;
  const metrics=await supabase.from('social_post_metrics').select('*')
    .eq('post_id',post.id).order('observed_at',{ascending:false}).limit(1).maybeSingle();
  if(metrics.error)throw new Error('SOCIAL_METRIC_READ_FAILED');
  latestMetric=metrics.data||null;
  if(normalized.learning_type==='PERFORMANCE'&&!latestMetric){
    throw new Error('SOCIAL_PERFORMANCE_LEARNING_REQUIRES_METRIC');
  }

  let current=await supabase.from('social_production_learnings').select('*')
    .eq('learning_key',normalized.learning_key).maybeSingle();
  if(current.error)throw new Error('SOCIAL_LEARNING_READ_FAILED');

  const now=new Date().toISOString();
  if(!current.data){
    const created=await supabase.from('social_production_learnings').insert({
      ...normalized,status:'CANDIDATE',confidence:bounded(confidence,0,1,0.5),
      source_candidate_id:null,source_post_id:post.id,
      evidence:{origin:'DIRECTOR_LEARNING_LOOP'},
      observation_count:0,first_observed_at:now,last_observed_at:now,updated_at:now
    }).select('*').single();
    if(created.error)throw new Error('SOCIAL_LEARNING_INSERT_FAILED');
    current={data:created.data};
  }

  const observation=await supabase.from('social_learning_observations').insert({
    learning_id:current.data.id,
    learning_key:normalized.learning_key,
    source_post_id:post.id,
    opportunity_id:post.opportunity_id,
    director_assignment_id:post.director_assignment_id,
    channel, direction:dir,rationale:reason,
    confidence:bounded(confidence,0,1,0.5),
    performance_snapshot:metricSnapshot(latestMetric),
    comparison_context:obj(comparisonContext),
    observed_at:latestMetric?.observed_at||now
  }).select('*').single();
  if(observation.error)throw new Error('SOCIAL_LEARNING_OBSERVATION_INSERT_FAILED');

  const observations=await supabase.from('social_learning_observations').select('*')
    .eq('learning_id',current.data.id).order('observed_at',{ascending:true});
  if(observations.error)throw new Error('SOCIAL_LEARNING_OBSERVATION_READ_FAILED');
  const rows=observations.data||[];
  const activation=computeLearningActivation({
    currentStatus:current.data.status,
    learningType:normalized.learning_type,
    observations:rows
  });
  const {
    status:nextStatus,support,counter,neutral,
    average_confidence:avgConfidence
  }=activation;

  const updated=await supabase.from('social_production_learnings').update({
    statement:normalized.statement,
    learning_type:normalized.learning_type,
    scope:normalized.scope,
    status:nextStatus,
    confidence:avgConfidence,
    reuse_weight:Math.max(Number(current.data.reuse_weight||0),normalized.reuse_weight),
    source_post_id:post.id,
    evidence:{
      ...obj(current.data.evidence),
      origin:'DIRECTOR_LEARNING_LOOP',
      independent_post_observations:rows.length,
      support_count:support,
      counter_count:counter,
      neutral_count:neutral,
      activation_rule:'PERFORMANCE requires >=2 distinct supporting verified posts, zero counter observations, avg confidence >=0.65',
      latest_observation_id:observation.data.id
    },
    observation_count:rows.length,
    first_observed_at:rows[0]?.observed_at||now,
    last_observed_at:rows[rows.length-1]?.observed_at||now,
    updated_at:now
  }).eq('id',current.data.id).select('*').single();
  if(updated.error)throw new Error('SOCIAL_LEARNING_UPDATE_FAILED');

  return {
    learning:updated.data,
    observation:observation.data,
    idempotent:false,
    summary:{support,counter,neutral,distinct_posts:rows.length,average_confidence:avgConfidence}
  };
}

export async function getDirectorLearningLoopContext({supabase,limit=100}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  const l=Math.max(1,Math.min(Number(limit)||100,300));
  const learnings=await supabase.from('social_production_learnings').select('*')
    .in('status',['ACTIVE','CANDIDATE'])
    .order('status',{ascending:true}).order('reuse_weight',{ascending:false}).limit(l);
  if(learnings.error)throw new Error('SOCIAL_LEARNING_READ_FAILED');

  const ids=(learnings.data||[]).map(x=>x.id);
  const observationsByLearning={};
  if(ids.length){
    const observations=await supabase.from('social_learning_observations').select('*')
      .in('learning_id',ids).order('observed_at',{ascending:false});
    if(observations.error)throw new Error('SOCIAL_LEARNING_OBSERVATION_READ_FAILED');
    for(const row of observations.data||[]){
      if(!observationsByLearning[row.learning_id])observationsByLearning[row.learning_id]=[];
      observationsByLearning[row.learning_id].push(row);
    }
  }

  const shape=row=>({
    ...row,
    observations:observationsByLearning[row.id]||[]
  });
  return {
    active_learnings:(learnings.data||[]).filter(x=>x.status==='ACTIVE').map(shape),
    candidate_learnings:(learnings.data||[]).filter(x=>x.status==='CANDIDATE').map(shape),
    rule:'Candidate learnings are evidence inputs with lower decision weight; only ACTIVE learnings may behave as reusable operating priors.'
  };
}

export function buildProductionAcceptanceDecision({
  acceptanceStage='PRE_CUTOVER',deploymentReady=false,bridgeLive=false,
  directorPass=false,learningLoopReady=false,humanApprovalVerified=false,
  taskPromptReady=false,versionMatches=false,firstLiveRunPass=false
}={}){
  const stage=t(acceptanceStage||'PRE_CUTOVER',40).toUpperCase();
  if(!['PRE_CUTOVER','POST_CUTOVER'].includes(stage))throw new Error('SOCIAL_ACCEPTANCE_STAGE_INVALID');
  const liveRunRequired=stage==='POST_CUTOVER';
  const gates={
    acceptance_stage:stage,
    deployment_ready:deploymentReady===true,
    bridge_live:bridgeLive===true,
    director_cross_channel_qc_pass:directorPass===true,
    learning_loop_schema_ready:learningLoopReady===true,
    human_approval_gate_verified:humanApprovalVerified===true,
    task_prompt_ready:taskPromptReady===true,
    scheduled_task_version_matches:liveRunRequired?versionMatches===true:null,
    first_live_run_pass:liveRunRequired?firstLiveRunPass===true:null,
    no_auto_publish:true
  };
  const blockers=[];
  if(!gates.deployment_ready)blockers.push('DEPLOYMENT_NOT_READY');
  if(!gates.bridge_live)blockers.push('LIVE_BRIDGE_NOT_VERIFIED');
  if(!gates.director_cross_channel_qc_pass)blockers.push('DIRECTOR_QC_NOT_PASS');
  if(!gates.learning_loop_schema_ready)blockers.push('LEARNING_LOOP_NOT_READY');
  if(!gates.human_approval_gate_verified)blockers.push('HUMAN_APPROVAL_GATE_NOT_VERIFIED');
  if(!gates.task_prompt_ready)blockers.push('TASK_PROMPT_NOT_READY');
  if(liveRunRequired&&gates.scheduled_task_version_matches!==true)blockers.push('SCHEDULED_TASK_VERSION_MISMATCH');
  if(liveRunRequired&&gates.first_live_run_pass!==true)blockers.push('FIRST_LIVE_RUN_NOT_PASS');
  return {
    gates,blockers,
    status:blockers.length?'BLOCKED':liveRunRequired?'ACCEPTED':'READY_FOR_CUTOVER'
  };
}

export async function evaluateSocialProductionAcceptance({
  supabase,targetDate,plannerVersion='v1.0',runMode='SHADOW',
  deployment={},bridgeLive=false,humanApprovalVerified=false,
  taskPromptReady=false,scheduledTaskVersion=null,firstLiveRunPass=false,
  stage='PRE_CUTOVER',evidenceRefs=[],notes
}){
  if(!supabase)throw new Error('SUPABASE_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate||'')))throw new Error('SOCIAL_TARGET_DATE_INVALID');
  const mode=t(runMode||'SHADOW',40).toUpperCase();
  const acceptanceStage=t(stage||'PRE_CUTOVER',40).toUpperCase();
  if(!['PRE_CUTOVER','POST_CUTOVER'].includes(acceptanceStage))throw new Error('SOCIAL_ACCEPTANCE_STAGE_INVALID');

  let directorValidation=null;
  try{
    directorValidation=await evaluateSocialDirectorOutputs({supabase,targetDate,runMode:mode});
  }catch(error){
    directorValidation={validation:{decision:'FAIL',findings:[{code:String(error?.message||error)}]}};
  }

  const learningProbe=await supabase.from('social_learning_observations').select('id').limit(1);
  const acceptanceProbe=await supabase.from('social_production_acceptance_runs').select('id').limit(1);
  const learningLoopReady=!learningProbe.error&&!acceptanceProbe.error;

  const deploymentState=t(deployment.state,40).toUpperCase();
  const deploymentReady=deploymentState==='READY'&&Boolean(t(deployment.commit_sha,100));
  const directorPass=directorValidation?.validation?.decision==='PASS';
  const decision=buildProductionAcceptanceDecision({
    acceptanceStage,
    deploymentReady,
    bridgeLive:bridgeLive===true,
    directorPass,
    learningLoopReady,
    humanApprovalVerified:humanApprovalVerified===true,
    taskPromptReady:taskPromptReady===true,
    versionMatches:t(scheduledTaskVersion,80)===t(plannerVersion,80),
    firstLiveRunPass:firstLiveRunPass===true
  });
  const {gates,blockers,status}=decision;

  const now=new Date().toISOString();
  const row=await supabase.from('social_production_acceptance_runs').upsert({
    target_date:targetDate,
    planner_version:t(plannerVersion,80),
    run_mode:mode,
    status,
    deployment_commit_sha:nt(deployment.commit_sha,100),
    deployment_id:nt(deployment.id,300),
    deployment_state:deploymentState||null,
    scheduled_task_version:nt(scheduledTaskVersion,80),
    gates,
    blockers,
    evidence_refs:arr(evidenceRefs).map(x=>t(x,1200)).filter(Boolean).slice(0,50),
    notes:nt(notes,5000),
    accepted_at:status==='ACCEPTED'?now:null,
    updated_at:now
  },{onConflict:'target_date,planner_version,run_mode'}).select('*').single();
  if(row.error)throw new Error('SOCIAL_PRODUCTION_ACCEPTANCE_WRITE_FAILED');

  return {acceptance:row.data,director_validation:directorValidation?.validation||null};
}
