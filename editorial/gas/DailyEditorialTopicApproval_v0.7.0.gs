/** THE REV. daily topic choice. Requires the existing Gate + Creator + Supervisor.
 * 05:00 JST: three reasoned candidates -> LINE -> owner choice -> optional
 * first-party interview -> DRAFTING -> existing image / human Publish gates.
 * A one-minute poll resumes approved topics of every date, outside the morning
 * creation window too. Waiting for the owner is an intentional state.
 */
var V070_TOPIC_URL = V069_STATUS_URL.replace(/editorial-status\/?$/, 'editorial-topics/');

function v070TopicRequest_(action, extra) {
  var queue = v069QueueRows_();
  var body = {
    action: action,
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
  if (action === 'prepare') body.shortlist = v069cShortlist_().rows.map(function(x) { return v069cSlim_(x, V069C_SHORTLIST_FIELDS); });
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
  var values = [['対象日','候補ID','状態','番号','記事案','選定理由','既存記事との違い','確認質問']];
  (proposals || []).forEach(function(p) {
    p.options.forEach(function(o) { values.push([p.target_date,p.id,p.status,o.number,o.title,o.reason,o.difference,o.interview_required ? '選択後に質問' : '登録資料で制作可能']); });
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
      payload:JSON.stringify({to:owner,messages:[{type:'text',text:n.text}]})
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
  // Install only after the new API, private table, LINE receiver and existing
  // Supervisor have been checked. Do not silently overwrite other triggers.
  var probe = v070TopicRequest_('poll', {});
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
  var exists = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'scheduledDailyEditorialTopicApprovalV070'; });
  if (!exists) ScriptApp.newTrigger('scheduledDailyEditorialTopicApprovalV070').timeBased().everyMinutes(1).create();
  return scheduledDailyEditorialTopicApprovalV070();
}
