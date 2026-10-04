/** THE REV. daily topic choice. Requires the existing Gate + Creator + Supervisor.
 * 05:00 JST: three reasoned candidates -> LINE -> owner choice -> optional
 * first-party interview -> DRAFTING -> existing image / human Publish gates.
 * A one-minute poll resumes approved topics of every date, outside the morning
 * creation window too. Waiting for the owner is an intentional state.
 */
var V070_TOPIC_URL = V069_STATUS_URL;

// The installed v0.6.5.2 Supervisor passes knowledge_context to the writer,
// but its final editor reads ctx.first_party_interview. Preserve the owner's
// exact answers in both stages rather than losing them during final editing.
var V070_WRITER_ADAPTER = (function () {
  if (typeof generateWebBlogDraft_ !== 'function') return 'WRITER_NOT_PRESENT';
  var original = generateWebBlogDraft_;
  generateWebBlogDraft_ = function (ctx, gate) {
    var knowledge = gate && gate.knowledge_context;
    var interview = knowledge && knowledge.interview;
    if (Array.isArray(interview) && interview.length) {
      if (!knowledge.topic_approval || !knowledge.topic_approval.approved_at || interview.some(function(x) { return !String(x.answer || '').trim(); })) throw new Error('APPROVED_INTERVIEW_REQUIRED');
      var raw = interview.map(function(x, i) { return (i + 1) + '. ' + x.question + '\n' + x.answer; }).join('\n\n');
      ctx.first_party_interview = {topic_candidate_id:gate.candidate_id,raw_answer:raw,main_claim:String(knowledge.main_claim || raw),extracted_insights:[],usable_quotes:[],source_id:knowledge.topic_approval.proposal_id};
      gate.first_party_interview = ctx.first_party_interview;
    }
    return original(ctx, gate);
  };
  return 'topic-interview-v1';
})();

// Weekly legacy runs may keep preparing research, but must not select and
// write a separate unapproved blog after the daily approval flow is enabled.
var V070_WEEKLY_ADAPTER = (function () {
  if (typeof runM6BlogGBP !== 'function') return 'WEEKLY_NOT_PRESENT';
  var original = runM6BlogGBP;
  runM6BlogGBP = function () {
    if (String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() === 'TRUE') return {should_publish:false,status:'TOPIC_SELECTION_WAITING',reason:'OWNER_TOPIC_APPROVAL_REQUIRED'};
    return original.apply(this,arguments);
  };
  return 'topic-weekly-gate-v1';
})();

function v070RefreshTopicPool_() {
  var today = v069TodayKey_(), props = PropertiesService.getScriptProperties();
  var key = 'THE_REV_TOPIC_POOL_GENERATED_' + today;
  if (props.getProperty(key) === 'TRUE') return {status:'ALREADY_GENERATED'};
  var sheet = ss_().getSheetByName('23_BLOG_TOPIC_SHORTLIST');
  var prefix = 'BT-' + today.replace(/-/g,'') + '-DAILY-';
  // Read-back also recovers a lost acknowledgement without generating again.
  var existing = getObjectsWithRow_(sheet).filter(function(r) {return String(r.candidate_id || '').indexOf(prefix) === 0;});
  if (existing.length === 5) {props.setProperty(key,'TRUE');return {status:'ALREADY_GENERATED'};}
  var week = getTargetWeekStart_(), ctx = buildM6Context_(week);
  ctx.weekly_editorial_brief = {brief:ctx.weekly_editorial_brief,
    direction:'毎日の候補だけを5件提案。記事本文はまだ作らない。一般的な運動の検索ニーズ、ボクシング、酸素ルーム、DENBAの商品説明を散りばめる。同じ悩みの言い換えを避ける。未確認の店内運用・顧客実績・効果を作らない。',
    blog_history:getObjectsWithRow_(ss_().getSheetByName('21_WEB_BLOG_OUTPUT')).slice(-100).map(function(r) {return {title:r.title,query:r.target_keyword,status:r.status};})};
  var candidates = generateBlogTopicCandidates_(ctx,5);
  if (!Array.isArray(candidates) || candidates.length !== 5 || candidates.some(function(c) {return !String(c.title_candidate || '').trim() || !String(c.why_now || '').trim();})) throw new Error('TOPIC_POOL_RESPONSE_INVALID');
  candidates.forEach(function(c,i) {
    var scores = c.score_breakdown || {};
    var row = Object.assign({},c,scores,{candidate_id:prefix+(i+1),generated_at:new Date(),week_start:new Date(),rank:i+1,status:'CANDIDATE',total_score:Object.keys(scores).reduce(function(n,k) {return n+Number(scores[k] || 0);},0)});
    if (!existing.some(function(r) {return r.candidate_id === row.candidate_id;})) appendObjectRow_(sheet,row);
  });
  if (getObjectsWithRow_(sheet).filter(function(r) {return String(r.candidate_id || '').indexOf(prefix) === 0;}).length !== 5) throw new Error('TOPIC_POOL_READBACK_FAILED');
  props.setProperty(key,'TRUE');
  return {status:'GENERATED',count:5};
}

function refreshDailyEditorialTopicPoolV070() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('TOPIC_POOL_LOCKED');
  try {var result=v070RefreshTopicPool_();Logger.log(JSON.stringify(result));return result;}
  finally {lock.releaseLock();}
}

function inspectDailyEditorialTopicApprovalV070() {
  var properties = PropertiesService.getScriptProperties();
  var probe = v070TopicRequest_('poll', {});
  var result = {version:'v0.7.0',writer_adapter:V070_WRITER_ADAPTER,weekly_adapter:V070_WEEKLY_ADAPTER,reply_mode:properties.getProperty('THE_REV_TOPIC_REPLY_MODE'),supervisor:v069cSupervisorWired_(),
    line_sender_configured:Boolean(properties.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN') && properties.getProperty('THE_REV_LINE_USER_ID')),
    line_property_names:Object.keys(properties.getProperties()).filter(function(k) {return /LINE/.test(k);}),
    line_receiver_configured:Boolean(probe.capabilities && probe.capabilities.line_receiver_configured),
    settings:{cadence:v069Settings_().daily_editorial_cadence,approval_required:v069Settings_().daily_editorial_topic_approval_required},
    proposals:(probe.proposals || []).map(function(p) {return {id:p.id,status:p.status};})};
  Logger.log(JSON.stringify(result));
  return result;
}

function sendPendingTopicNotificationsGPTV070() {
  // Send through the already-configured official account. This does not select
  // a topic, create an article, or claim that LINE inbound replies are wired.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('TOPIC_NOTIFICATION_LOCKED');
  try {
    var probe = v070TopicRequest_('poll', {});
    var sent = (probe.notifications || []).map(function(n) {
      n.gpt_reply_required = true;
      return v070Notify_(n);
    });
    Logger.log(JSON.stringify({status:'NOTIFICATION_CHECKED',notifications:sent,article_created:false}));
    return sent;
  } finally { lock.releaseLock(); }
}

function v070TopicRequest_(action, extra) {
  var queue = v069QueueRows_();
  var body = {
    action: 'topic_' + action,
    rows: queue.rows.map(function(x) {
      var row = v069cSlim_(x, V069C_PLAN_FIELDS);
      row.failed_stage = x.failed_stage || '';
      return row;
    }),
    outputRows: getObjectsWithRow_(ss_().getSheetByName('21_WEB_BLOG_OUTPUT')).map(function(x) {
      var row = v069cSlim_(x, ['content_id','title','slug_suggestion','target_keyword','search_intent','meta_description','article_type']);
      row.body_summary = String(x.body_markdown || '').replace(/\s+/g, ' ').slice(0,1800);
      return row;
    }),
    settings: v069Settings_()
  };
  if (action === 'prepare') body.shortlist = v069cShortlist_().rows.slice().sort(function(a,b) {return new Date(b.generated_at || 0)-new Date(a.generated_at || 0);}).slice(0,200).map(function(x) { return v069cSlim_(x, V069C_SHORTLIST_FIELDS); });
  Object.keys(extra || {}).forEach(function(k) { body[k] = extra[k]; });
  var r = v069PostJson_(V070_TOPIC_URL, body);
  if (r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true) throw new Error('TOPIC_API_FAILED HTTP ' + r.code + ' ' + String((r.json && r.json.error) || r.body).slice(0,400));
  return r.json;
}

function v070TopicView_(proposals) {
  var props = PropertiesService.getScriptProperties();
  var digest = JSON.stringify(proposals || []);
  if (props.getProperty('THE_REV_TOPIC_VIEW_HASH') === v070Hash_(digest)) return;
  var sh = ss_().getSheetByName('記事候補');
  if (!sh) sh = ss_().insertSheet('記事候補');
  var labels = {TOPIC_SELECTION_WAITING:'候補選択待ち',INTERVIEW_WAITING:'インタビュー回答待ち',APPROVED:'制作待ち',QUEUE_CREATED:'制作開始済み',REVIEW_REQUIRED:'要確認'};
  var values = [['対象日','候補ID','状態','番号','記事案','選定理由','既存記事との違い','確認質問']];
  (proposals || []).forEach(function(p) {
    p.options.forEach(function(o) { values.push([p.target_date,p.id,labels[p.status] || p.status,o.number,o.title,o.reason,o.difference,o.interview_required ? '選択後に質問' : '登録資料で制作可能']); });
  });
  if (sh.getMaxRows() < values.length) sh.insertRowsAfter(sh.getMaxRows(), values.length - sh.getMaxRows());
  // This sheet belongs to this view; no unrelated Master tabs are changed.
  if (sh.getLastRow() > values.length) sh.getRange(values.length + 1,1,sh.getLastRow()-values.length,8).clearContent();
  sh.getRange(1,1,values.length,8).setValues(values).setWrap(true).setVerticalAlignment('top');
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#d9e5dd');
  sh.setColumnWidths(1,4,130); sh.setColumnWidths(5,3,350); sh.setColumnWidth(8,180);
  // Store a digest rather than the entire proposal (Script property size limit).
  props.setProperty('THE_REV_TOPIC_VIEW_HASH', v070Hash_(digest));
}

function v070Hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text).map(function(b) {return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}

function v070Notify_(n) {
  // Stable request key prevents a lost acknowledgement from pushing twice.
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, n.proposal_id + ':' + n.kind);
  var hex = bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  var key = hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);
  var props = PropertiesService.getScriptProperties();
  var message = n.text;
  if (n.gpt_reply_required || props.getProperty('THE_REV_TOPIC_REPLY_MODE') === 'GPT') message = '返信先：候補選択・回答はChatGPTのこの会話へ送ってください。\nLINE返信の自動受付は準備中です。\n\n' + message;
  var stateKey = 'THE_REV_TOPIC_PUSH_' + n.proposal_id + '_' + n.kind;
  var saved = JSON.parse(props.getProperty(stateKey) || '{}');
  if (saved.status === 'SENT') {
    v070TopicRequest_('notification_ack',{proposal_id:n.proposal_id,kind:n.kind,status:'SENT'});
    return {proposal_id:n.proposal_id,status:'SENT'};
  }
  var now = Date.now();
  if (saved.next_at && now < saved.next_at) return {status:'RETRY_BACKOFF'};
  if (saved.first_at && now - saved.first_at >= 23 * 60 * 60 * 1000) return {status:'DELIVERY_UNVERIFIED',error:'Retry window elapsed; reconcile before resending.'};
  var token = props.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN'), owner = props.getProperty('THE_REV_LINE_USER_ID');
  var status = 'ERROR', error = 'LINE_CONFIG_MISSING';
  if (token && owner) {
    var r = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      headers:{Authorization:'Bearer '+token,'X-Line-Retry-Key':key},
      payload:JSON.stringify({to:owner,messages:[{type:'text',text:message}]})
    });
    var code = r.getResponseCode();
    var acceptedRetry = code === 409 && String((r.getAllHeaders() || {})['x-line-accepted-request-id'] || (r.getAllHeaders() || {})['X-Line-Accepted-Request-Id'] || '') !== '';
    if ((code >= 200 && code < 300) || acceptedRetry) { status = 'SENT'; error = ''; }
    else error = 'LINE_HTTP_' + code;
  }
  var attempts = Number(saved.attempts || 0) + 1;
  props.setProperty(stateKey, JSON.stringify({status:status,first_at:saved.first_at || now,attempts:attempts,next_at:now + Math.min(30,Math.pow(2,attempts-1)) * 60000}));
  v070TopicRequest_('notification_ack', {proposal_id:n.proposal_id,kind:n.kind,status:status,error:error});
  return {proposal_id:n.proposal_id,status:status,error:error};
}

function v070TopicTick_(force) {
  // Always poll approved topics, even when the current date already has a row.
  var st = v069Settings_(), hour = v069cJstHour_(), today = v069TodayKey_();
  if (String(st.daily_editorial_enabled).toUpperCase() === 'FALSE') return {status:'DISABLED'};
  var props = PropertiesService.getScriptProperties();
  var hourKey = today + ':' + hour;
  if (props.getProperty('THE_REV_TOPIC_MAINTENANCE_HOUR') !== hourKey) {
    try { v069cRecoverLengthReviewRequired_(); } catch (_length) {}
    try { v069cNotifyPreparedReady_(); } catch (_ready) {}
    props.setProperty('THE_REV_TOPIC_MAINTENANCE_HOUR',hourKey);
  }
  var due = force === true || (hour >= Number(st.daily_editorial_hour || 5) && props.getProperty('THE_REV_TOPICS_PREPARED_' + today) !== 'TRUE' && props.getProperty('THE_REV_TOPIC_PREPARE_ATTEMPT') !== hourKey);
  if (due) props.setProperty('THE_REV_TOPIC_PREPARE_ATTEMPT',hourKey);
  if (due && props.getProperty('THE_REV_TOPICS_PREPARED_' + today) !== 'TRUE') {
    var snapshot = v070TopicRequest_('poll', {});
    if (!(snapshot.proposals || []).some(function(p) {return p.target_date === v069TargetKey_();})) {
      try { v070RefreshTopicPool_(); }
      catch(poolError) {
        var poolLog = v069StartLog_('DAILY_TOPIC_POOL');
        v069FinishLog_(poolLog,'ERROR_BLOCKED',0,'Fresh topic ideas unavailable; checking existing verified candidate pool.',String(poolError).slice(0,600));
      }
    }
  }
  var res = v070TopicRequest_(due ? 'prepare' : 'poll', {});
  if (due && res.preparation && ['TOPIC_SELECTION_WAITING','NOT_REQUIRED'].indexOf(res.preparation.status) >= 0) props.setProperty('THE_REV_TOPICS_PREPARED_' + today, 'TRUE');
  v070TopicView_(res.proposals);
  var notifications = [];
  // Notification failure does not stop an already approved article.
  (res.notifications || []).forEach(function(n) {
    try { notifications.push(v070Notify_(n)); } catch (e) { notifications.push({status:'ERROR',error:String(e).slice(0,300)}); }
  });
  var wired = v069cSupervisorWired_();
  if (!wired.ok) throw new Error('SUPERVISOR_NOT_WIRED ' + wired.missing.join(','));
  var created = [];
  (res.ready || []).forEach(function(next) {
    var queue = v069QueueRows_();
    if (next.queue_row) {
      var row = next.queue_row;
      var existing = queue.rows.filter(function(x) { return String(x.content_id) === row.content_id; })[0];
      if (!existing) v069cAppendQueueRow_(queue, row);
      var verify = v069QueueRows_().rows.filter(function(x) { return String(x.content_id) === row.content_id; })[0];
      if (!verify || v069RowTargetKey_(verify) !== row.target_date.replace(/\//g,'-')) throw new Error('APPROVED_QUEUE_READBACK_FAILED');
      (next.replaces_content_ids || []).forEach(function(id) {
        var old = queue.rows.filter(function(x) { return String(x.content_id) === id; })[0];
        if (old && old.queue_status === 'REVIEW_REQUIRED' && old.failed_stage === 'ARTICLE_OVERLAP') setObjectRow_(queue.sheet,old.__row,{queue_status:'SKIPPED',next_stage:'NONE',human_action_required:'NONE',updated_at:new Date(),notes:v069AppendNote_(old.notes,'Replaced after owner topic choice '+next.proposal_id+'; draft and QC history retained.')});
      });
      v069cMarkShortlistSelected_(v069cShortlist_(),row.topic_candidate_id,row.content_id);
      next.content_id = row.content_id;
    }
    v070TopicRequest_('queue_ack',{proposal_id:next.proposal_id,content_id:next.content_id});
    created.push(next.content_id);
  });
  if (res.preparation && res.preparation.status === 'POOL_REFRESH_REQUIRED') {
    v069cNotifyOnce_('THE_REV_TOPIC_POOL_' + today,'THE REV.｜理由付きの3候補が不足しています。候補を補充するまで未選択の記事は制作しません。記事候補シートをご確認ください。');
  }
  var status = created.length ? 'CREATED' : (res.proposals || []).some(function(p) {return p.status === 'APPROVED';}) ? 'APPROVAL_QUEUED' : (res.proposals || []).some(function(p) {return p.status === 'INTERVIEW_WAITING';}) ? 'INTERVIEW_WAITING' : (res.proposals || []).some(function(p) {return p.status === 'TOPIC_SELECTION_WAITING';}) ? 'TOPIC_SELECTION_WAITING' : 'NO_ACTION';
  var logKey = today + ':' + status + ':' + created.join(',');
  if (props.getProperty('THE_REV_TOPIC_LAST_LOG') !== logKey || created.length) {
    var log = v069StartLog_('DAILY_TOPIC_APPROVAL');
    v069FinishLog_(log,status,created.length,'target_date='+v069TargetKey_()+' created='+created.join(',')+' owner_topic_choice_required=true publish=human',notifications.some(function(n) {return n.status === 'ERROR';}) ? 'LINE notification unverified' : '');
    props.setProperty('THE_REV_TOPIC_LAST_LOG',logKey);
  }
  return {status:status,created:created,notifications:notifications};
}

function scheduledDailyEditorialTopicApprovalV070() {
  if (String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() !== 'TRUE') return {status:'DISABLED'};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status:'LOCKED'};
  try { return v070TopicTick_(false); }
  catch(e) {
    var run = v069StartLog_('DAILY_TOPIC_APPROVAL');
    v069FinishLog_(run,'ERROR_BLOCKED',0,'Topic poll failed',String(e).slice(0,1000));
    v069cNotifyOnce_('THE_REV_TOPIC_ERROR_'+v069TodayKey_(),'THE REV.｜候補確認の自動処理でエラー\n'+String(e).slice(0,600));
    return {status:'ERROR_BLOCKED',error:String(e)};
  } finally { lock.releaseLock(); }
}

function installDailyEditorialTopicApprovalV070() {
  return v070InstallTopicApproval_('LINE');
}

function installDailyEditorialTopicApprovalGPTV070() {
  // Existing LINE notifications + explicit GPT choice is a complete supported
  // approval route. It does not imply a LINE webhook has been configured.
  return v070InstallTopicApproval_('GPT');
}

function v070InstallTopicApproval_(replyMode) {
  // Install only after the new API, private table, LINE receiver and existing
  // Supervisor have been checked. Do not silently overwrite other triggers.
  var probe = v070TopicRequest_('poll', {});
  var properties = PropertiesService.getScriptProperties();
  var recipient = properties.getProperty('THE_REV_LINE_USER_ID');
  if (!recipient || !properties.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN')) throw new Error('LINE_OWNER_OR_TOKEN_NOT_CONFIGURED');
  if (replyMode === 'LINE' && (!probe.capabilities || !probe.capabilities.line_receiver_configured)) throw new Error('LINE_RECEIVER_NOT_CONFIGURED');
  if (replyMode === 'LINE' && v070Hash_(recipient) !== probe.capabilities.line_owner_fingerprint) throw new Error('LINE_OWNER_MISMATCH');
  if (V070_WRITER_ADAPTER !== 'topic-interview-v1') throw new Error('INTERVIEW_WRITER_NOT_WIRED');
  if (!v069cSupervisorWired_().ok) throw new Error('SUPERVISOR_NOT_WIRED');
  var settings = ss_().getSheetByName('08_SETTINGS');
  var rows = getObjectsWithRow_(settings);
  ['daily_editorial_topic_approval_required','daily_editorial_cadence'].forEach(function(key) {
    var found = rows.filter(function(x) { return String(x.key || x.setting_key) === key; })[0];
    var value = key === 'daily_editorial_cadence' ? 'DAILY' : 'TRUE';
    if (found) setObjectRow_(settings,found.__row,{value:value});
    else appendObjectRow_(settings,{key:key,value:value,type:'text',description:'Owner topic choice before drafting. Final Publish remains human.',active:'TRUE'});
  });
  if (String(v069Settings_().daily_editorial_topic_approval_required).toUpperCase() !== 'TRUE' || String(v069Settings_().daily_editorial_cadence) !== 'DAILY') throw new Error('TOPIC_SETTINGS_READBACK_FAILED');
  properties.setProperty('THE_REV_TOPIC_REPLY_MODE',replyMode);
  var exists = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'scheduledDailyEditorialTopicApprovalV070'; });
  if (!exists) ScriptApp.newTrigger('scheduledDailyEditorialTopicApprovalV070').timeBased().everyMinutes(1).create();
  var result = scheduledDailyEditorialTopicApprovalV070();
  Logger.log(JSON.stringify({reply_mode:replyMode,cadence:v069Settings_().daily_editorial_cadence,approval_required:v069Settings_().daily_editorial_topic_approval_required,result:result}));
  return result;
}
