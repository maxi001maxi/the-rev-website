/**
 * Phase 5I: opt-in Writer + Preservation Editor + independent QC adapter.
 * Requires existing legacy Writer/Editor and v0.7.0 Topic Approval adapters.
 * Install order: append this LAST in the existing one-paste bundle.
 * Script Property THE_REV_EDITORIAL_QUALITY_V08_MODE = OFF(default)|SHADOW|ENFORCE.
 * SHADOW = deterministic QC log in editor_notes, no prompt or READY changes.
 * ENFORCE = Writer/Editor enrichment + separate QC model call + FAIL CLOSED.
 * No auto-publication is installed or enabled by this adapter.
 */
var V080_QUALITY_MODE = (function () {
  try {
    var value = String(PropertiesService.getScriptProperties().getProperty('THE_REV_EDITORIAL_QUALITY_V08_MODE') || 'OFF').trim().toUpperCase();
    return value === 'ENFORCE' || value === 'SHADOW' ? value : 'OFF';
  } catch (_) { return 'OFF'; }
})();

function v080ScoreAudit_(details, publishedTotal) {
  var maxima = {title_hook:15,seo_intent:15,human_voice:15,readability:15,length_efficiency:10,originality:10,brand_fit:10,fact_safety:10};
  var values = details && details.score_breakdown || {}, total = 0, errors = [];
  Object.keys(maxima).forEach(function(key) {
    var n = values[key];
    if (typeof n !== 'number' || !isFinite(n) || Math.floor(n) !== n || n < 0 || n > maxima[key]) errors.push('SCORE_RANGE:' + key);
    else total += n;
  });
  if (errors.length === 0 && (typeof publishedTotal !== 'number' || total !== publishedTotal)) errors.push('SCORE_TOTAL_MISMATCH');
  return {total:total,pass:errors.length === 0,errors:errors};
}

function v080BaseQuality_(draft, edited) {
  var errors = [], notices = [];
  var body = String(edited && edited.body_markdown || '');
  var original = String(draft && draft.body_markdown || '');
  var count = body.replace(/\s/g,'').length;
  var type = String(edited && edited.article_type || draft && draft.article_type || '').toUpperCase();
  if (!body.trim() || !original.trim()) errors.push('BODY_MISSING');
  if (type === 'STANDARD' && (count < 1600 || count > 2400)) errors.push('STANDARD_BODY_RANGE:' + count);
  if (type === 'EXPERT_DEEP_DIVE' && count < 1400) errors.push('EXPERT_BODY_TOO_SHORT:' + count);
  var safety = ['減圧','加圧','耳の違和感','禁忌','副作用'];
  safety.forEach(function(term) {if(original.indexOf(term) !== -1 && body.indexOf(term) === -1) errors.push('PRESERVED_SAFETY_TERM_LOST:' + term);});
  if (/病気が治ります|睡眠不足を完全に補えます|必ず誰でも上達/.test(body)) errors.push('HIGH_RISK_UNQUALIFIED_CLAIM');
  var title = String(edited && edited.title || '');
  if (/新大宮|奈良市/.test(title) && !(/新大宮|奈良市/.test(body))) errors.push('REGIONAL_TITLE_BODY_MISMATCH');
  if (!Array.isArray(edited && edited.source_refs) || edited.source_refs.length === 0) notices.push('SOURCE_PROVENANCE_REQUIRES_REVIEW');
  var details = {};
  try {details = JSON.parse(String(edited && edited._editor_notes || '{}'));} catch (_) {errors.push('EDITOR_NOTES_UNPARSEABLE');}
  var score = v080ScoreAudit_(details,edited && edited._editor_score);
  errors = errors.concat(score.errors);
  notices.push('SEMANTIC_CLAIM_PRESERVATION_NOT_PROVEN');
  notices.push('MODEL_SCORE_IS_NOT_HUMAN_READER_EVIDENCE');
  return {pass:errors.length === 0,errors:errors,notices:notices,body_chars:count,score_total:score.total,inspection:'DETERMINISTIC_ONLY'};
}

/**
 * Independent QC receives the owner-approved interview as primary-source
 * evidence. It is not permission to infer undocumented store procedures.
 * The official excerpt below is a narrow, manually verified PDF fact pack,
 * used only when that exact source is listed in the finalized article.
 */
function v080QcEvidence_(edited, ctx) {
  var interview = ctx && ctx.first_party_interview;
  var owner = interview && String(interview.source_id || '').trim() &&
    String(interview.raw_answer || '').trim() ? {
      source_type:'FIRST_PARTY_OWNER_INTERVIEW',
      source_id:String(interview.source_id).trim(),
      raw_answer:String(interview.raw_answer).slice(0,10000),
      scope:'Owner statements only; no inferred clinical protocol, safety guarantee or operational procedure.'
    } : null;
  var refs = Array.isArray(edited && edited.source_refs) ? edited.source_refs : [];
  var hasOfficialPdf = refs.some(function(ref) {
    var value=String(ref||'');
    return value.indexOf('caa.go.jp/policies/council/csic/report/report_024/assets/csic_cms201_260527_11.pdf')!==-1;
  });
  var official = hasOfficialPdf ? [{
    source_type:'OFFICIAL_SOURCE_VERIFIED_EXCERPT',
    document:'消費者安全調査委員会 消費者事故等調査報告書 パーソナルトレーニングにおける事故',
    publication_date:'2026-05-27',
    url:'https://www.caa.go.jp/policies/council/csic/report/report_024/assets/csic_cms201_260527_11.pdf',
    page_reference:'PDF pages 58-60 (printed 59-61)',
    verified_points:[
      'トレーナーは利用者の体調や痛みの全てを把握できない。過去のけが、寝不足、痛みや違和感等は運動前・中・後に伝えるよう案内している。',
      'トレーナーに不安・痛みを申告された際には当該種目を一旦中止し、確認したうえで変更・中止・受診勧奨等、安全優先で対応するよう提言している。',
      '指導者の大丈夫という指示に従い、けがをした相談が寄せられている。不安が残る運動は一旦止め、話し合いによる見直しを勧めている。'
    ],
    scope:'Only these directly verified statements. Do not infer incident counts, individual store practices, guarantees or medical conclusions.'
  }] : [];
  if(refs.some(function(ref){return String(ref||'').indexOf('caa.go.jp/policies/policy/consumer_safety/caution/caution_086')!==-1;}))official.push({
    source_type:'OFFICIAL_SOURCE_VERIFIED_EXCERPT',
    url:'https://www.caa.go.jp/policies/policy/consumer_safety/caution/caution_086',
    verified_at:'2026-10-14',section:'事故事例・事故防止のポイント',
    verified_points:[
      '消費者庁は、運動中の違和感をトレーナーへ伝えた後も続けてけがをしたという相談事例を紹介している。これは相談として報告された事例であり、独立に因果関係を確定した臨床研究ではない。',
      '気になる情報は運動前・中・後に伝え、伝え方や合図を事前に話し合い、不安が残る運動は一旦止めるよう案内している。'
    ],
    scope:'Reported examples and official advice only. No incidence rate, store protocol or guarantee.'
  });
  if(refs.some(function(ref){return String(ref||'').indexOf('kennet.mhlw.go.jp/information/information/exercise/s-00-008.html')!==-1;}))official.push({
    source_type:'OFFICIAL_SOURCE_VERIFIED_EXCERPT',
    url:'https://kennet.mhlw.go.jp/information/information/exercise/s-00-008.html',
    verified_at:'2026-10-14',section:'運動中の注意',
    verified_points:['厚生労働省は、胸痛・動悸・めまいやふらつき・いつもと違う強い疲れ・関節や筋肉の強い痛み・冷や汗等の体調の異変を感じたら直ちに運動を中止するよう案内している。'],
    scope:'General stop-exercise guidance. Do not infer diagnosis or clinic/store treatment.'
  });
  return {first_party_owner_interview:owner,verified_official_excerpts:official};
}

function v080IndependentQc_(edited, ctx) {
  if (typeof openAIRequest_ !== 'function' || typeof parseStructuredResponse_ !== 'function') throw new Error('V080_QC_API_NOT_AVAILABLE');
  var axes=['question_resolution','understanding_gain','decision_support','concreteness_evidence','originality_readability'];
  var props = {}; axes.forEach(function(k){props[k]={type:'integer',minimum:0,maximum:4};});
  var schema={type:'object',additionalProperties:false,properties:{scores:{type:'object',additionalProperties:false,properties:props,required:axes},issues:{type:'array',items:{type:'string'}},source_unverified:{type:'boolean'},reason:{type:'string'}},required:['scores','issues','source_unverified','reason']};
  var settings=getSettings_();
  var payload={model:settings.blog_editor_model||settings.blog_model,store:false,input:[
    {role:'system',content:[{type:'input_text',text:'You are an INDEPENDENT QC reviewer, NOT the writer or editor. Judge reader value without viewing writer/editor self-scores. Return five scores (0-4): question answered, new understanding, decision support, concrete grounded detail, readability/originality. Check factual claims against supplied verified facts, narrow official excerpts and the explicitly sourced owner interview. Treat the owner interview as evidence of the position stated by the owner ONLY, not independent proof of store protocols or clinical effectiveness. Unverified claims must still set source_unverified=true. Never fabricate verification. issues must list every material blocker. Be critical. Score is NOT a human-reader measurement.'}]},
    {role:'user',content:[{type:'input_text',text:JSON.stringify({title:edited.title,article_type:edited.article_type,body_markdown:edited.body_markdown,verified_public_facts:ctx&&ctx.verified_public_facts||[],blocked_facts:ctx&&ctx.blocked_facts||[],source_refs:edited.source_refs||[],qc_evidence:v080QcEvidence_(edited,ctx)})}]}
  ],text:{format:{type:'json_schema',name:'editorial_quality_v080',strict:true,schema:schema}},max_output_tokens:4000};
  var output=parseStructuredResponse_(openAIRequest_('responses',payload),'Editorial Independent QC v0.8');
  var sum=0,valid=true;
  axes.forEach(function(k){var n=output.scores&&output.scores[k];if(typeof n!=='number'||!isFinite(n)||Math.floor(n)!==n||n<0||n>4)valid=false;else sum+=n;});
  if(!Array.isArray(output.issues)||typeof output.source_unverified!=='boolean')valid=false;
  return {pass:valid&&sum>=16&&axes.every(function(k){return output.scores[k]>=2;})&&output.issues.length===0&&output.source_unverified===false,total:valid?sum:null,issues:output.issues||[],source_unverified:output.source_unverified,reason:output.reason||'',is_human_reader_test:false};
}

var V080_QUALITY_ADAPTER = (function () {
  if (V080_QUALITY_MODE === 'OFF') return 'DISABLED';
  if (typeof openAIRequest_ !== 'function' || typeof finalizeWebBlog_ !== 'function') return 'LEGACY_WRITER_EDITOR_NOT_PRESENT';
  var previousRequest = openAIRequest_, previousFinalize = finalizeWebBlog_;
  if (V080_QUALITY_MODE === 'ENFORCE') {
    openAIRequest_ = function(endpoint,payload) {
      var name=payload&&payload.text&&payload.text.format&&payload.text.format.name;
      if(endpoint==='responses'&&name&&Array.isArray(payload.input)&&payload.input[0]&&payload.input[0].content){
        var writer=name==='web_blog_draft_v1', editor=name==='web_blog_final_editor_v1';
        if(writer||editor) {
          var guidance=writer ?
            'Editorial Quality v0.8 WRITER: Answer the reader question within the opening paragraphs. Deliver one genuinely useful distinction, concrete decision/action, appropriate research limitations and a real example. Separate verified store facts from assumptions. Do not invent a trainer/client story. Local comparison titles require verified local options. Protect safety exceptions. For COMPARISON_GUIDE, help readers compare meaningful responses or decision options explicitly rather than offering only an undifferentiated checklist. In exercise-safety topics, distinguish discomfort from red flags such as chest pain, faintness or sudden severe pain: do not encourage trial exercise, and guide stopping activity and prompt appropriate medical attention. Do not diagnose. STANDARD body 1600-2400 non-whitespace characters; never pad.' :
            'Editorial Quality v0.8 PRESERVATION EDITOR: Keep the writer answer, knowledge gain, next action, meaningful examples, every safety caveat and source limitation. Edit style and order, never delete essential details for shortness. No new store procedures, medical promises, unverified outcomes or invented quotes. If uncertain, set fact_check_status REVIEW. STANDARD body 1600-2400 excluding whitespace; never pad.';
          payload.input[0].content.push({type:'input_text',text:guidance});
        }
      }
      return previousRequest.apply(this,arguments);
    };
  }
  finalizeWebBlog_ = function(draft,ctx){
    var result=previousFinalize.apply(this,arguments);
    var base=v080BaseQuality_(draft,result);
    var independent=null;
    if(V080_QUALITY_MODE==='ENFORCE'){
      try{independent=v080IndependentQc_(result,ctx);}catch(e){independent={pass:false,error:String(e).slice(0,240)};}
    }
    var allowed=base.pass&&(V080_QUALITY_MODE==='SHADOW'||Boolean(independent&&independent.pass));
    var note={};try{note=JSON.parse(String(result._editor_notes||'{}'));}catch(_){note={legacy_editor_notes: String(result._editor_notes||'').slice(0,500)};}
    note.quality_v080={mode:V080_QUALITY_MODE,deterministic:base,independent:independent,enforced:V080_QUALITY_MODE==='ENFORCE',passed:allowed,publish_requires_human:true};
    result._editor_notes=JSON.stringify(note);
    if(V080_QUALITY_MODE==='ENFORCE'&&!allowed){result._editor_decision='REVIEW_REQUIRED';result._fact_check_status='REVIEW';}
    return result;
  };
  return 'ACTIVE_'+V080_QUALITY_MODE;
})();

/**
 * One-shot, content-ID scoped editorial re-review.
 * To be run manually in the bound GAS project ONLY AFTER this exact source
 * has been installed and QUALITY_V08_MODE=ENFORCE was read back.
 * Never changes human publication approval or fakes a QC pass.
 */
function requeueOct15EditorialIndependentQcReview() {
  if (V080_QUALITY_MODE !== 'ENFORCE') throw new Error('V080_NOT_ENFORCED');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('OCT15_REVIEW_RETRY_LOCKED');
  try {
    var contentId = 'BLOG-20261015-fac1fd';
    var proposalId = 'TP-20261015';
    var sheet = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
    var blogSheet = ss_().getSheetByName('21_WEB_BLOG_OUTPUT');
    if (!sheet || !blogSheet) throw new Error('EDITORIAL_SHEETS_NOT_FOUND');
    var row = getObjectsWithRow_(sheet).filter(function(r) { return String(r.content_id || '') === contentId; })[0];
    if (!row || !row.__row) throw new Error('OCT15_QUEUE_ROW_NOT_FOUND');
    if (String(row.queue_status) !== 'REVIEW_REQUIRED' || String(row.draft_status) !== 'REVIEW_REQUIRED')
      return {status:'NOOP_NOT_QC_REVIEW',content_id:contentId,queue_status:row.queue_status};
    var originalError=String(row.last_error||'');
    if (originalError !== 'Final Editor / Fact / Topic Gate requires review')
      throw new Error('OCT15_REVIEW_REASON_CHANGED');
    if (String(row.notes || '').indexOf('[V080_OCT15_REVIEW_RETRY]') >= 0)
      return {status:'NOOP_ALREADY_REQUEUED',content_id:contentId};
    var k={};
    try { k=JSON.parse(String(row.knowledge_context_json||'{}')); } catch (_) {throw new Error('OCT15_KNOWLEDGE_JSON_INVALID');}
    if (!k.topic_approval || k.topic_approval.proposal_id!==proposalId ||
      !Array.isArray(k.interview) || k.interview.length!==2 ||
      k.interview.some(function(x) {return !String(x.answer||'').trim();}))
      throw new Error('OCT15_APPROVED_INTERVIEW_MISSING');
    var blog=getObjectsWithRow_(blogSheet).filter(function(r){return String(r.content_id||'')===contentId;})[0];
    if (!blog || String(blog.status)!=='REVIEW_REQUIRED') throw new Error('OCT15_QC_BLOG_MISMATCH');
    var editor={};
    try {editor=JSON.parse(String(blog.editor_notes||'{}'));}catch(_){throw new Error('OCT15_EDITOR_NOTES_INVALID');}
    if (editor.quality_v080?.mode !== 'ENFORCE' || editor.quality_v080?.independent?.pass !== false)
      throw new Error('OCT15_INDEPENDENT_QC_FAILURE_NOT_CONFIRMED');
    var now=new Date();
    setObjectRow_(sheet,row.__row,{
      queue_status:'PATCHING',
      draft_status:'NOT_STARTED',
      failed_stage:'',
      next_stage:'BLOG_DRAFT',
      human_action_required:'NONE',
      last_error:'',
      notes:String(row.notes||'')+' | [V080_OCT15_REVIEW_RETRY] Approved interview retained; rerun with verified QC evidence and safety/comparison improvements.',
      updated_at:now
    });
    return {status:'REQUEUED_FOR_CANONICAL_QC',content_id:contentId,proposal_id:proposalId,auto_publish:false};
  } finally {lock.releaseLock();}
}
