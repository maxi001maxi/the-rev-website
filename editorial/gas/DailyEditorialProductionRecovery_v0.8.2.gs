/** Autonomous Production Recovery v0.8.2. Install in generated bundle.
 * Opt-in property THE_REV_EDITORIAL_RECOVERY_V082_MODE=ENFORCE.
 * Existing Writer/Editor/Topic/Fact gates and human Publish stay authoritative.
 * One preservation repair + two independent QCs per topic/slug lifetime.
 * Explicit Owner-approved external extras are imported as spent calls, never new budget.
 * Script Properties reserve calls before API; ambiguous calls never auto-retry.
 */
var V082_ACTIVE_REPAIR = null;
// Durable external requests already consumed before GAS installation. This
// import prevents a fresh Script Properties journal from minting a new budget.
var V082_IMPORTED_QC_HISTORY = [
  {
    "identities": [
      "TP-20261021",
      "night-workout-sleep-timing-intensity"
    ],
    "calls": [
      {
        "request_id": "req_5132beae5d104cfb807c551661e7ae18",
        "model": "gpt-5.6-sol",
        "usage": {
          "input_tokens": 3398,
          "input_tokens_details": {
            "cache_write_tokens": 3395,
            "cached_tokens": 0
          },
          "output_tokens": 711,
          "output_tokens_details": {
            "reasoning_tokens": 356
          },
          "total_tokens": 4109
        },
        "pass": false,
        "total": 19,
        "body_sha256": "0071e929f34aef5121f9f62a0ee5f212f97c9f91b1a1df0875758104ffef50be",
        "kind": "qc",
        "status": "COMPLETED",
        "imported": true,
        "confirmed_cost": null,
        "source_path": "editorial/production-recovery/2026-10-20/oct21-independent-qc-claim.json"
      },
      {
        "request_id": "req_885cd030abb642d784f4c82adebcbb26",
        "model": "gpt-5.6-sol",
        "usage": {
          "input_tokens": 3356,
          "input_tokens_details": {
            "cache_write_tokens": 3353,
            "cached_tokens": 0
          },
          "output_tokens": 855,
          "output_tokens_details": {
            "reasoning_tokens": 394
          },
          "total_tokens": 4211
        },
        "pass": false,
        "total": 18,
        "body_sha256": "f8ae09cce8d17253c5e82001cbf625ef606a9122881907c232ff61cc36c730f3",
        "kind": "qc",
        "status": "COMPLETED",
        "imported": true,
        "confirmed_cost": null,
        "source_path": "editorial/production-recovery/2026-10-20/oct21-independent-qc-claim.json"
      },
      {
        "request_id": "req_4f37704fd44a4f808505aae038f4d60f",
        "model": "gpt-5.6-sol",
        "usage": {
          "input_tokens": 3703,
          "input_tokens_details": {
            "cache_write_tokens": 3700,
            "cached_tokens": 0
          },
          "output_tokens": 773,
          "output_tokens_details": {
            "reasoning_tokens": 382
          },
          "total_tokens": 4476
        },
        "pass": true,
        "total": 20,
        "body_sha256": "29cf1be0d80d2f9b9c5928d374fbd40f677f28336f675da15791c049b31bd079",
        "kind": "qc",
        "status": "COMPLETED",
        "imported": true,
        "confirmed_cost": null,
        "estimated_cost_usd": 0.033972,
        "approval_id": "owner-20261020-170843-jst-oct21-text-qc-usd025",
        "source_path": "editorial/prepublication/2026-10-21-evening-strength-sleep/INDEPENDENT_QC_V082_ADDITIONAL.json"
      }
    ]
  }
];
function v082ImportedQcCalls_(identity) {
  var entry=V082_IMPORTED_QC_HISTORY.find(function(x){return x.identities.indexOf(identity)>=0;});
  return entry?entry.calls.map(function(c){return Object.assign({},c);}):[];
}

function v082Enabled_() {
  return String(PropertiesService.getScriptProperties().getProperty('THE_REV_EDITORIAL_RECOVERY_V082_MODE')||'OFF')==='ENFORCE';
}
function v082Sha_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8)
    .map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function v082Identity_(draft,ctx) {
  return String(ctx&&ctx.first_party_interview&&ctx.first_party_interview.source_id || draft&&draft.slug_suggestion || '').trim();
}
function v082Journal_(draft,ctx,mutate) {
  var id=v082Identity_(draft,ctx);if(!id)throw new Error('V082_RECOVERY_IDENTITY_MISSING');
  var props=PropertiesService.getScriptProperties(),key='THE_REV_PRODUCTION_RECOVERY_'+v082Sha_(id).slice(0,24);
  var lock=LockService.getScriptLock(),alreadyHeld=lock.hasLock();if(!alreadyHeld&&!lock.tryLock(1000))throw new Error('V082_RECOVERY_BUSY');
  try{
    var raw=props.getProperty(key),record=raw?JSON.parse(raw):{identity:id,calls:[],confirmed_cost:null};
    if(record.identity!==id || !Array.isArray(record.calls))throw new Error('V082_CHECKPOINT_CORRUPT');
    v082ImportedQcCalls_(id).forEach(function(c){
      if(!record.calls.some(function(existing){return existing.request_id===c.request_id;}))record.calls.push(c);
    });
    if(mutate){mutate(record);props.setProperty(key,JSON.stringify(record));}
    return record;
  }finally{if(!alreadyHeld)lock.releaseLock();}
}
function v082Reserve_(draft,ctx,kind) {
  return v082Journal_(draft,ctx,function(r){
    if(r.calls.some(function(c){return c.status==='STARTED'||c.status==='UNCERTAIN';}))throw new Error('V082_AMBIGUOUS_API_REQUEST');
    if(r.calls.filter(function(c){return c.kind===kind;}).length>=(kind==='qc'?2:1))throw new Error('V082_'+kind.toUpperCase()+'_LIMIT');
    r.calls.push({kind:kind,status:'STARTED',at:new Date().toISOString(),body_sha256:v082Sha_(draft.body_markdown||''),confirmed_cost:null});
  }).calls.length;
}
function v082Finish_(draft,ctx,sequence,response,error) {
  return v082Journal_(draft,ctx,function(r){
    var c=r.calls[sequence-1];if(!c||c.status!=='STARTED')throw new Error('V082_RESERVATION_MISMATCH');
    c.status=error?'UNCERTAIN':'COMPLETED';c.completed_at=new Date().toISOString();
    c.request_id=response&&response._request_id||null;c.response_id=response&&response.id||null;
    c.usage=response&&response.usage||null;c.error=error?String(error).slice(0,240):null;
  });
}
function v082Repair_(original,result,ctx,base,independent,editor) {
  var audit={version:'v0.8.2',original_body_sha256:v082Sha_(result.body_markdown||''),
    initial_qc:independent,initial_deterministic:base,writer_reused:true,automatic_publish:false};
  if(!v082Enabled_())return {result:result,base:base,independent:independent,audit:null};
  if(independent&&independent.error){audit.stopped_reason='QC_API_FAILURE';audit.next_action='RECONCILE_API_CHECKPOINT';return {result:result,base:base,independent:independent,audit:audit};}
  var evidence=v080QcEvidence_(result,ctx);
  if(independent&&independent.source_unverified===true && !evidence.verified_official_excerpts.length && !evidence.verified_research_excerpts.length){
    audit.stopped_reason='SOURCE_EVIDENCE_MISSING';audit.next_action='COLLECT_VERIFIABLE_EVIDENCE';
    return {result:result,base:base,independent:independent,audit:audit};
  }
  if(base.pass&&independent&&independent.pass)return {result:result,base:base,independent:independent,audit:audit};
  var revised=result;
  try{
    V082_ACTIVE_REPAIR={draft:result,ctx:ctx,feedback:{deterministic:base.errors,independent:independent,evidence:evidence}};
    // Use the existing Editor contract and scores again. Never preserve a stale 91.
    revised=editor(result,ctx);
    V082_ACTIVE_REPAIR=null;
    base=v080BaseQuality_(original,revised);
    independent=v080IndependentQc_(revised,ctx);
    audit.revised_body_sha256=v082Sha_(revised.body_markdown||'');
    audit.stopped_reason=base.pass&&independent.pass?null:'REPAIR_QC_REJECTED';
    audit.next_action=audit.stopped_reason?'OWNER_REVIEW_WITH_QC_FINDINGS':'CANONICAL_SUPERVISOR_CONTINUE';
  }catch(e){
    audit.stopped_reason=String(e).slice(0,240);audit.next_action='RECONCILE_CHECKPOINT_BEFORE_RETRY';
    // No unverified revised body becomes READY after a QC exception.
    base={pass:false,errors:['V082_REPAIR_NOT_VERIFIED']};independent={pass:false,error:audit.stopped_reason};
  }finally{V082_ACTIVE_REPAIR=null;}
  return {result:revised,base:base,independent:independent,audit:audit};
}
// Adds only reviewed primary-source summaries whose EXACT URL occurs in refs.
// URL strings alone are not evidence. Unknown future sources remain blocked.
function v082ResearchEvidence_(refs) {
  var urls=(refs||[]).map(String).join('\n').match(/https:\/\/[^\s)\]"<>]+/g)||[];
  return V082_RESEARCH_CATALOG.filter(function(e){return urls.indexOf(e.url)>=0;});
}

// Reviewed catalog; source provenance and limits travel with every QC request.
var V082_RESEARCH_CATALOG = [
  {
    "source_type": "PRIMARY_RESEARCH_REVIEWED_SUMMARY",
    "url": "https://pubmed.ncbi.nlm.nih.gov/30374942/",
    "verification_url": "https://link.springer.com/article/10.1007/s40279-018-1015-0",
    "document": "Stutz et al. Sports Medicine 2019;49:269–287",
    "verified_at": "2026-10-20",
    "section": "Publisher abstract: Methods, Results, Conclusion",
    "verified_points": [
      "健康な成人で夕方・夜の単回運動と非運動を比較した23研究の系統的レビュー・メタ分析。全体として夜の運動が睡眠を悪化させるという仮説を支持しなかった。",
      "就寝1時間以内に終了する激しい運動では入眠潜時・睡眠時間・睡眠効率が損なわれる可能性がある。"
    ],
    "scope": "健康な成人の研究。1時間を全員共通の安全境界としない。全種目・不眠症・患者への一般化不可。リンク先公開抄録までを検証し、購読本文を読了したとは主張しない。",
    "summary_sha256": "5e4d12743f0358d04c748bd29c45804652173e6615cc065f9d8859981b485459"
  },
  {
    "source_type": "PRIMARY_RESEARCH_REVIEWED_SUMMARY",
    "url": "https://pubmed.ncbi.nlm.nih.gov/34416428/",
    "document": "Frimpong et al. Sleep Medicine Reviews 2021;60:101535",
    "verified_at": "2026-10-20",
    "section": "PubMed abstract",
    "verified_points": [
      "18–50歳の健康で普段よく眠れる成人を対象にした夜間高強度運動15研究・194人のメタ分析。",
      "就寝0.5–4時間前の単回高強度運動ではREM睡眠割合が減少した一方、その他の有意な睡眠変化はなかった。著者は2–4時間前の高強度運動で全体として睡眠を乱さないと結論した。"
    ],
    "scope": "対象・種目・実験条件に限る。すべての夜間筋トレの安全性や睡眠改善保証ではない。REM変化を無視して悪影響ゼロとしない。",
    "summary_sha256": "981642cffe0cc5c64df695b43166703400d94101623711a7bbf8728f9438b7ca"
  },
  {
    "source_type": "PRIMARY_RESEARCH_REVIEWED_SUMMARY",
    "url": "https://www.nature.com/articles/s41467-025-58271-x",
    "document": "Leota et al. Nature Communications 2025, Dose-response relationship between evening exercise and sleep",
    "verified_at": "2026-10-20",
    "section": "Discussion, limitations; Methods study population",
    "verified_points": [
      "活動的な成人14,689人・4,084,354人夜のウェアラブル記録による後ろ向き観察研究。",
      "終了時刻が遅く運動負荷が高いほど、入眠時刻の遅れ・睡眠時間短縮などと関連した。著者は可能なら入眠4時間以上前の終了、それ以内では軽い負荷を提案した。",
      "心拍に基づく負荷指標は短時間の高努力筋トレを過小評価する可能性があり、光曝露など交絡を完全には制御していない。"
    ],
    "scope": "関連であり因果の証明ではない。入眠時刻と床に就く時刻は異なり、入眠潜時を測定していない。4時間は全員共通の安全境界ではない。",
    "summary_sha256": "99b0f9fa05892e1fc4a243036a80e90b0b2b304a945615da3b8abbce4087b538"
  },
  {
    "source_type": "OFFICIAL_SOURCE_REVIEWED_SUMMARY",
    "url": "https://www.mhlw.go.jp/content/001305530.pdf",
    "document": "健康づくりのための睡眠ガイド2023",
    "verified_at": "2026-10-20",
    "section": "PDF page 28 (zero-based27), printed26: 運動強度と運動時間／運動のタイミングと頻度",
    "verified_points": [
      "夕方や夜の運動でも、就寝の約2～4時間前までという目安で、睡眠改善に有効と報告している。",
      "年齢・体調に応じて無理のない軽い運動から始め、寝る直前まで興奮状態が続くことを避ける。",
      "中強度の運動を息が弾み汗をかく程度と説明し、散歩・屋外でのウォーキング・軽い筋力トレーニングなどを例示している。"
    ],
    "scope": "一般的な目安。ジムだけの規則やTHE REV.の店舗固有の決まりではない。睡眠効果や安全性を保証しない。 この強度の説明を、就寝直前の安全基準、特定のRPE/RIRの睡眠効果、時刻別メニューの検証結果と扱わない。",
    "summary_sha256": "64898e4f9097c2ee842566f509fa35ad131d5040c6a1f491d650b23592c71370"
  }
];

// Send the existing Supervisor's exact accepted article proof through its normal
// Bridge call. Do not create a second scheduler or bypass v065 sheet readback.
var V082_BRIDGE_ADAPTER=(function(){
  if(typeof v065SyncBridgeDirect_!=='function'||typeof v065FetchJson_!=='function')return 'LEGACY_BRIDGE_NOT_PRESENT';
  var bridge=v065SyncBridgeDirect_,fetchJson=v065FetchJson_,active=null;
  v065FetchJson_=function(url,options){
    if(active&&url==='https://the-rev-website.vercel.app/api/integrations/editorial'&&options&&options.payload){
      var payload=JSON.parse(options.payload);
      payload.production_recovery_version='v0.8.2';payload.editorial_text_qc=active;
      options=Object.assign({},options,{payload:JSON.stringify(payload)});
    }
    return fetchJson(url,options);
  };
  v065SyncBridgeDirect_=function(queue,blog){
    if(!v082Enabled_())return bridge.apply(this,arguments);
    var notes=JSON.parse(String(blog.editor_notes||'{}')),quality=notes.quality_v080,qc=quality&&quality.independent;
    if(blog.status!=='READY'||blog.fact_check_status!=='PASS'||!quality||quality.passed!==true||!qc||qc.pass!==true||qc.source_unverified!==false||qc.body_sha256!==v082Sha_(String(blog.body_markdown||'').trim()))
      throw new Error('V082_BRIDGE_TEXT_QC_NOT_PASSED');
    v082EnsureGbp_(queue,blog);
    active={schema:'editorial-text-qc-v1',content_id:queue.content_id,body_sha256:qc.body_sha256,evidence_sha256:qc.evidence_sha256,
      pass:true,total:qc.total,source_unverified:false,issues:qc.issues,version:'v0.8.2'};
    try{return bridge.apply(this,arguments);}finally{active=null;}
  };
  return 'INSTALLED_OPT_IN';
})();

/** Resume the oldest existing independently rejected article on the PRIMARY
 * generation tick. No Writer reset, new Queue, second Draft or extra trigger.
 * Current quality/API journal bounds also apply to this pre-upgrade backlog.
 */
function v082ResumeExistingReview_() {
  if(!v082Enabled_()||V080_QUALITY_MODE!=='ENFORCE')return null;
  var qsh=ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE'),bsh=ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
  if(!qsh||!bsh)return null;
  var blogs=getObjectsWithRow_(bsh),selected=null;
  getObjectsWithRow_(qsh).some(function(q){
    if(q.queue_status!=='REVIEW_REQUIRED'||q.draft_status!=='REVIEW_REQUIRED')return false;
    var b=blogs.find(function(x){return x.content_id===q.content_id&&x.status==='REVIEW_REQUIRED';});if(!b)return false;
    var n,k;try{n=JSON.parse(String(b.editor_notes||'{}'));k=JSON.parse(String(q.knowledge_context_json||'{}'));}catch(_){return false;}
    if(!k.topic_approval||!k.topic_approval.approved_at||!n.quality_v080||n.quality_v080.independent?.pass!==false||n.production_recovery_v082)return false;
    var refs;try{refs=JSON.parse(String(b.source_refs||'[]'));}catch(_){return false;}
    if(!v082ResearchEvidence_(refs).length)return false; // No evidence guessing, no paid loop.
    selected={q:q,b:b,k:k,refs:refs};return true;
  });
  if(!selected)return null;
  var q=selected.q,b=selected.b,k=selected.k;
  var ctx=buildM6Context_(v065WeekDate_(q.week_start||q.run_date));
  var answers=Array.isArray(k.interview)?k.interview:[];
  if(answers.length){
    if(answers.some(function(a){return !String(a.answer||'').trim();}))return null;
    ctx.first_party_interview={source_id:k.topic_approval.proposal_id,raw_answer:answers.map(function(a,i){return (i+1)+'. '+String(a.question||'')+'\n'+a.answer;}).join('\n\n')};
  }
  var parse=function(v,fallback){try{return JSON.parse(String(v||''));}catch(_){return fallback;}};
  var draft={...b,slug_suggestion:b.slug_suggestion,source_refs:selected.refs,article_type:b.article_type||'STANDARD',
    _editor_notes:b.editor_notes,_editor_score:Number(b.editor_score),_topic_gate:parse(q.topic_gate_json,{})};
  var journal=v082Journal_(draft,ctx);
  if(journal.calls.length)return null; // Previous unfinished call must be reconciled, never rewound.
  var final=finalizeWebBlog_(draft,ctx),notes=parse(final._editor_notes,{});
  notes.recovery_v082_prior_body=String(b.body_markdown||'');
  notes.recovery_v082_prior_editor_notes=String(b.editor_notes||'');
  var ready=final._editor_decision==='READY'&&final._fact_check_status==='PASS'&&notes.quality_v080?.passed===true&&draft._topic_gate.decision==='PUBLISH'&&v065LengthGate_(draft.article_type,final.body_markdown).pass===true;
  var patch={title:final.title,slug_suggestion:final.slug_suggestion,body_markdown:final.body_markdown,meta_description:final.meta_description||b.meta_description,
    lead:final.lead||b.lead,cta:final.cta||b.cta,source_refs:final.source_refs,internal_link_suggestions:final.internal_link_suggestions||b.internal_link_suggestions,
    editor_notes:JSON.stringify(notes),editor_score:final._editor_score,editor_decision:final._editor_decision,
    fact_check_status:ready?'PASS':'REVIEW',status:ready?'READY':'REVIEW_REQUIRED'};
  setObjectRow_(bsh,b.__row,patch); // Accepted body is checkpointed before GBP / Bridge.
  if(!ready){
    setObjectRow_(qsh,q.__row,{queue_status:'REVIEW_REQUIRED',failed_stage:'INDEPENDENT_QC',next_stage:'HUMAN_REVIEW',human_action_required:'REVIEW_QC_FINDINGS',last_error:JSON.stringify(notes.quality_v080.independent),updated_at:new Date()});
    return {status:'EXISTING_DRAFT_QC_HELD',content_id:q.content_id};
  }
  v082QueueAcceptedBlog_(qsh,q);
  // The existing Supervisor owns GBP and Bridge continuation, including its
  // READY/PASS resume path. Never run another Writer from this adapter.
  return {status:'EXISTING_DRAFT_QC_PASSED',content_id:q.content_id};
}

// BRIDGE_SYNCING is an in-flight state, not the legacy Supervisor's retry
// selector. Use its established BRIDGE_ERROR/READY resume contract (v0.7.1),
// with no false error or new Writer/QC call. The Supervisor owns the next step.
function v082QueueAcceptedBlog_(sheet,queue) {
  setObjectRow_(sheet,queue.__row,{queue_status:'BRIDGE_ERROR',draft_status:'READY',
    last_successful_stage:'BLOG_QC_PASSED',failed_stage:'',next_stage:'WEB_BRIDGE',
    human_action_required:'NONE',last_error:'',updated_at:new Date()});
}

// A process can stop after saving the accepted blog but before saving the
// Queue handoff. Read the actual accepted body + QC checkpoint before any paid
// recovery. Never import a stale QC, bypass topic/interview approval, touch an
// image/publish hold, or reset the API journal to resume this free handoff.
function v082ResumeAcceptedBlog_() {
  if(!v082Enabled_()||V080_QUALITY_MODE!=='ENFORCE')return null;
  var qsh=ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE'),bsh=ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
  if(!qsh||!bsh)return null;
  var blogs=getObjectsWithRow_(bsh),queues=getObjectsWithRow_(qsh);
  for(var i=0;i<queues.length;i++){
    var q=queues[i];
    if(['QC','REVIEW_REQUIRED','BRIDGE_SYNCING'].indexOf(String(q.queue_status||''))<0||
       ['', 'BLOG_DRAFT','BLOG_QC','INDEPENDENT_QC','WEB_BRIDGE'].indexOf(String(q.failed_stage||''))<0)continue;
    var matches=blogs.filter(function(b){return b.content_id===q.content_id;});
    if(matches.length!==1)continue;
    var b=matches[0],notes,knowledge,gate;
    try{
      notes=JSON.parse(String(b.editor_notes||'{}'));
      knowledge=JSON.parse(String(q.knowledge_context_json||'{}'));
      gate=JSON.parse(String(q.topic_gate_json||'{}'));
    }catch(_){continue;}
    var quality=notes.quality_v080,qc=quality&&quality.independent;
    if(b.status!=='READY'||b.fact_check_status!=='PASS'||b.editor_decision!=='READY'||
       !quality||quality.passed!==true||!qc||qc.pass!==true||qc.source_unverified!==false||
       !Array.isArray(qc.issues)||qc.issues.length||!(Number(qc.total)>=16)||
       !/^[a-f0-9]{64}$/.test(qc.evidence_sha256||'')||
       qc.body_sha256!==v082Sha_(String(b.body_markdown||'').trim())||
       knowledge.decision!=='SUFFICIENT'||!knowledge.topic_approval||!knowledge.topic_approval.approved_at||gate.decision!=='PUBLISH'||
       (Array.isArray(knowledge.interview)&&knowledge.interview.some(function(a){return !String(a.answer||'').trim();}))||
       !v065LengthGate_(b.article_type||'STANDARD',b.body_markdown).pass)continue;
    v082QueueAcceptedBlog_(qsh,q);
    return {status:'ACCEPTED_BLOG_CHECKPOINT_RESUMED',content_id:q.content_id,
      next_stage:'WEB_BRIDGE',writer_reused:true,additional_api_calls:0,automatic_publish:false};
  }
  return null;
}
var V082_PRIMARY_ADAPTER=(function(){
  if(typeof v065GeneratePendingArticle_!=='function')return 'PRIMARY_NOT_PRESENT';
  var previous=v065GeneratePendingArticle_;
  v065GeneratePendingArticle_=function(){
    if(!v082Enabled_())return previous.apply(this,arguments);
    var lock=LockService.getScriptLock(),held=lock.hasLock();
    if(!held&&!lock.tryLock(1000))return {status:'RECOVERY_PRIMARY_BUSY'};
    try{var recovered=v082ResumeAcceptedBlog_()||v082ResumeExistingReview_(),result=recovered||previous.apply(this,arguments);v082ReflectHold_();return result;}
    finally{if(!held)lock.releaseLock();}
  };
  return 'PRIMARY_ONLY_OPT_IN';
})();

function v082EnsureGbp_(queue,blog) {
  var sh=ss_().getSheetByName('22_GBP_POST');if(!sh)throw new Error('V082_GBP_SHEET_MISSING');
  var rows=getObjectsWithRow_(sh).filter(function(r){return r.parent_blog_id===queue.content_id;});
  if(rows.length>1)throw new Error('V082_DUPLICATE_GBP_ROWS');
  if(rows[0]&&rows[0].status==='READY')return;
  var ctx=buildM6Context_(v065WeekDate_(queue.week_start||queue.run_date));
  var identity={first_party_interview:{source_id:queue.content_id}},record=v082Journal_(blog,identity),gbp=record.gbp_checkpoint;
  if(!gbp){
    var sequence=v082Reserve_(blog,identity,'gbp');
    try{gbp=generateGBPFromBlog_({...blog,_editor_notes:blog.editor_notes},ctx);v082Finish_(blog,identity,sequence,gbp,null);}
    catch(e){v082Finish_(blog,identity,sequence,null,e);throw e;}
    // Save the output before the Sheet write so sync retries do not repeat API.
    v082Journal_(blog,identity,function(r){r.gbp_checkpoint=gbp;});
  }
  var value={generated_at:new Date(),content_id:rows[0]?.content_id||'GBP-'+queue.content_id,parent_blog_id:queue.content_id,
    title:gbp.title,body_copy_paste:gbp.body_copy_paste,cta_text:gbp.cta_text,local_context:gbp.local_context,
    blog_url_placeholder:'[BLOG_URL]',status:'READY',post_ready:'BLOCKED_URL',notes:gbp.notes||'Human Google posting required'};
  if(rows[0])setObjectRow_(sh,rows[0].__row,value);else appendObjectRow_(sh,value);
}

function v082ReflectHold_(){
  var qsh=ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE'),bsh=ss_().getSheetByName('21_WEB_BLOG_OUTPUT');if(!qsh||!bsh)return;
  var blogs=getObjectsWithRow_(bsh);
  getObjectsWithRow_(qsh).filter(function(q){return q.queue_status==='REVIEW_REQUIRED';}).forEach(function(q){
    var b=blogs.find(function(r){return r.content_id===q.content_id;});if(!b)return;
    var note;try{note=JSON.parse(String(b.editor_notes||'{}'));}catch(_){return;}
    var audit=note.production_recovery_v082;if(!audit||!audit.stopped_reason)return;
    var key='[V082_HOLD:'+v082Sha_(String(b.body_markdown||'')+audit.stopped_reason).slice(0,12)+']';
    if(String(q.notes||'').indexOf(key)>=0)return;
    var api=/API|CHECKPOINT|LIMIT|RESERVATION/.test(audit.stopped_reason);
    setObjectRow_(qsh,q.__row,{last_successful_stage:'BLOG_DRAFT',failed_stage:'INDEPENDENT_QC',
      next_stage:audit.next_action||'HUMAN_REVIEW',human_action_required:api?'RECONCILE_API_CHECKPOINT':'REVIEW_QC_FINDINGS',
      last_error:(api?'API呼出履歴の確認が必要です。自動再試行を停止しました。':'独立QCが未合格です。根拠と修正理由を確認してください。')+' '+audit.stopped_reason,
      notes:String(q.notes||'')+' | '+key,updated_at:new Date()});
    if(typeof v069cStuckAlerts_==='function')v069cStuckAlerts_([{content_id:q.content_id,reason:'QUALITY_RECOVERY_HELD',last_error:audit.stopped_reason}],q.target_date||q.run_date);
  });
}
