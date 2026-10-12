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

function v080IndependentQc_(edited, ctx) {
  if (typeof openAIRequest_ !== 'function' || typeof parseStructuredResponse_ !== 'function') throw new Error('V080_QC_API_NOT_AVAILABLE');
  var axes=['question_resolution','understanding_gain','decision_support','concreteness_evidence','originality_readability'];
  var props = {}; axes.forEach(function(k){props[k]={type:'integer',minimum:0,maximum:4};});
  var schema={type:'object',additionalProperties:false,properties:{scores:{type:'object',additionalProperties:false,properties:props,required:axes},issues:{type:'array',items:{type:'string'}},source_unverified:{type:'boolean'},reason:{type:'string'}},required:['scores','issues','source_unverified','reason']};
  var settings=getSettings_();
  var payload={model:settings.blog_editor_model||settings.blog_model,store:false,input:[
    {role:'system',content:[{type:'input_text',text:'You are an INDEPENDENT QC reviewer, NOT the writer or editor. Judge reader value without viewing writer/editor self-scores. Return five scores (0-4): question answered, new understanding, decision support, concrete grounded detail, readability/originality. Flag factual or store claims that cannot be checked against supplied verified facts as source_unverified=true. Never fabricate verification. issues must list every material blocker. Be critical. Score is NOT a human-reader measurement.'}]},
    {role:'user',content:[{type:'input_text',text:JSON.stringify({title:edited.title,article_type:edited.article_type,body_markdown:edited.body_markdown,verified_public_facts:ctx&&ctx.verified_public_facts||[],blocked_facts:ctx&&ctx.blocked_facts||[],source_refs:edited.source_refs||[]})}]}
  ],text:{format:{type:'json_schema',name:'editorial_quality_v080',strict:true,schema:schema}},max_output_tokens:1300};
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
            'Editorial Quality v0.8 WRITER: Answer the reader question within the opening paragraphs. Deliver one genuinely useful distinction, concrete decision/action, appropriate research limitations and a real example. Separate verified store facts from assumptions. Do not invent a trainer/client story. Local comparison titles require verified local options. Protect safety exceptions. STANDARD body 1600-2400 non-whitespace characters; never pad.' :
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
