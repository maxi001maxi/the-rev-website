/**
 * THE REV. Social Director v0.5
 * ONE-PASTE add-on for the existing Editorial Apps Script project.
 *
 * Requires the existing Editorial bundle helpers:
 * - ss_ / getObjectsWithRow_
 * - buildM6Context_ / generateBlogTopicCandidates_
 * - v069PostJson_ / V069_STATUS_URL
 *
 * What it does:
 * 1) syncs actual published Social history from 01_POST_HISTORY / 04_PERFORMANCE
 * 2) creates exactly five Reel B candidates for today
 * 3) stores them in Supabase via the existing authenticated Bridge
 * 4) mirrors them to 39_SOCIAL_REEL_CANDIDATES
 * 5) sends the five choices to the existing official LINE recipient
 *
 * It never publishes Instagram content.
 */

var SOCIAL_V05_VERSION = 'v0.5';
var SOCIAL_V05_SHEET = '39_SOCIAL_REEL_CANDIDATES';
var SOCIAL_V05_PHASE = 'STORE_AWARENESS_BUILD';
var SOCIAL_V05_HOUR = 6;
var SOCIAL_V05_MINUTE = 30;
var SOCIAL_V05_MAX_HISTORY_DAYS = 7;
var SOCIAL_V05_TERRITORIES = [
  'FIRST_VISIT_PROCESS',
  'TRAINER_JUDGMENT',
  'STORE_SERVICE_EXPERIENCE',
  'PEOPLE_SPACE_LOCAL',
  'WILDCARD'
];

function socialV05Rows_(sheetName) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return [];
  return getObjectsWithRow_(sh);
}

function socialV05Bridge_(body) {
  if (typeof v069PostJson_ !== 'function' || !V069_STATUS_URL) throw new Error('SOCIAL_BRIDGE_HELPERS_MISSING');
  var r = v069PostJson_(V069_STATUS_URL, body);
  if (!r || r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true) {
    throw new Error('SOCIAL_BRIDGE_FAILED HTTP ' + String(r && r.code) + ' ' + String(r && r.body).slice(0,300));
  }
  return r.json;
}

function socialV05MetricMap_() {
  var map = {};
  socialV05Rows_('04_PERFORMANCE').forEach(function(r) {
    var id = String(r.post_id || '').trim();
    if (!id) return;
    map[id] = {
      reach: r.reach,
      views: r.views,
      likes: r.likes,
      saves: r.saves,
      shares: r.shares,
      comments: r.comments,
      profile_visits: r.profile_visits,
      website_clicks: r.website_clicks,
      source: '04_PERFORMANCE'
    };
  });
  return map;
}

function syncSocialPublishedHistoryV050() {
  var perf = socialV05MetricMap_();
  var posts = socialV05Rows_('01_POST_HISTORY')
    .filter(function(r) { return String(r.status || '').toUpperCase() === 'PUBLISHED' && String(r.post_id || '').trim(); })
    .slice(-200)
    .map(function(r) {
      return {
        platform: r.platform || 'Instagram',
        platform_media_id: String(r.post_id),
        permalink: r.post_url || '',
        publish_date: r.publish_date || '',
        format: r.format || '',
        title: r.title || '',
        topic: r.topic || '',
        angle: r.angle || '',
        hook: r.hook || '',
        main_claim: r.main_claim || '',
        caption: r.caption_or_script || '',
        content_lane: (perf[String(r.post_id)] && socialV05Rows_('04_PERFORMANCE').filter(function(x){return String(x.post_id)===String(r.post_id);})[0].content_lane) || '',
        source: r.source || '01_POST_HISTORY',
        source_ref: '01_POST_HISTORY',
        semantic_status: 'VERIFIED',
        metrics: perf[String(r.post_id)] || {}
      };
    });

  if (!posts.length) return {status:'NO_HISTORY',count:0};
  var total = 0;
  for (var i=0;i<posts.length;i+=50) {
    var result = socialV05Bridge_({action:'social_history_upsert',posts:posts.slice(i,i+50)});
    total += Number(result.result && result.result.count || 0);
  }
  return {status:'SYNCED',count:total};
}

function socialV05LatestPublishDate_() {
  var rows = socialV05Rows_('01_POST_HISTORY')
    .filter(function(r){return String(r.status||'').toUpperCase()==='PUBLISHED' && r.publish_date;});
  if (!rows.length) return null;
  rows.sort(function(a,b){return String(b.publish_date).localeCompare(String(a.publish_date));});
  return new Date(String(rows[0].publish_date).replace(/\//g,'-') + 'T00:00:00+09:00');
}

function socialV05HistoryFreshness_() {
  var latest = socialV05LatestPublishDate_();
  if (!latest || isNaN(latest.getTime())) return {ok:false,days:null,reason:'PUBLISHED_HISTORY_MISSING'};
  var today = new Date();
  var days = Math.floor((today.getTime()-latest.getTime())/86400000);
  return {ok:days<=SOCIAL_V05_MAX_HISTORY_DAYS,days:days,latest:latest,reason:days<=SOCIAL_V05_MAX_HISTORY_DAYS?'FRESH':'PUBLISHED_HISTORY_STALE'};
}

function socialV05Direction_(historyFreshness) {
  return [
    'THE REV.のSocial Directorとして、今日撮るReel B候補だけを5件提案する。本文や完成台本はまだ作らない。',
    '現在フェーズは STORE_AWARENESS_BUILD。Reel Aの豆知識・食事・一般トレーニング知識は外部委託ラインが担当しているため、同じ役割を作らない。',
    'Reel BはTHE REV.という店、人、サービス、初回来店、実際の判断、空間、地域との生活接続を見せる。',
    'Blogを短く要約した企画は禁止。同じテーマを使う場合も、Blog=説明、Reel B=実際の店・人・Process・Visual Proofに分ける。',
    '過去投稿とMain Claim / Visual / Serviceの重複を避ける。',
    '5案は必ず大きく違う方向にする。',
    '番号ごとの役割を守る: 1 FIRST_VISIT_PROCESS / 2 TRAINER_JUDGMENT / 3 STORE_SERVICE_EXPERIENCE / 4 PEOPLE_SPACE_LOCAL / 5 WILDCARD。',
    '各案はtitle_candidate、why_now、unique_angleを具体的に書く。15〜25秒程度で撮れる現実的な映像企画を想定する。',
    '未確認の顧客実績、現在の来店状況、健康効果を作らない。医療効果を断定しない。',
    '履歴鮮度=' + historyFreshness.reason + ' days=' + String(historyFreshness.days)
  ].join('\n');
}

function socialV05GenerateFive_() {
  if (typeof buildM6Context_ !== 'function' || typeof generateBlogTopicCandidates_ !== 'function') {
    throw new Error('SOCIAL_CANDIDATE_GENERATOR_MISSING');
  }
  var freshness = socialV05HistoryFreshness_();
  if (!freshness.ok) {
    return {status:'HISTORY_STALE',freshness:freshness,candidates:[]};
  }

  var ctx = buildM6Context_(getTargetWeekStart_());
  var socialHistory = socialV05Rows_('01_POST_HISTORY').filter(function(r){
    return String(r.status||'').toUpperCase()==='PUBLISHED';
  }).slice(-80).map(function(r){
    return {
      publish_date:r.publish_date,
      format:r.format,
      title:r.title,
      topic:r.topic,
      angle:r.angle,
      main_claim:r.main_claim,
      visual_direction:r.visual_direction,
      performance_summary:r.performance_summary
    };
  });
  var blogHistory = socialV05Rows_('21_WEB_BLOG_OUTPUT').slice(-80).map(function(r){
    return {title:r.title,target_keyword:r.target_keyword,status:r.status};
  });

  ctx.weekly_editorial_brief = {
    brief: ctx.weekly_editorial_brief,
    direction: socialV05Direction_(freshness),
    social_history: socialHistory,
    blog_history: blogHistory
  };

  var raw = generateBlogTopicCandidates_(ctx,5);
  if (!Array.isArray(raw) || raw.length !== 5) throw new Error('SOCIAL_FIVE_CANDIDATES_INVALID');

  return {
    status:'GENERATED',
    freshness:freshness,
    candidates:raw.map(function(c,i){
      var shoot = [6,6,7,6,8][i];
      return {
        title:c.title_candidate || c.topic || ('Reel候補 '+(i+1)),
        territory:SOCIAL_V05_TERRITORIES[i],
        business_job:i===0?'OBJECTION_REDUCTION':(i===1?'TRUST':'SERVICE_UNDERSTANDING'),
        audience_state:i===4?'AWARE':'EVALUATING',
        hook:c.preview_lead || c.audience_question || c.title_candidate || '',
        why_now:c.why_now || c.selection_reason || '',
        difference_from_history:c.unique_angle || c.local_angle || c.notes || '',
        asset_plan:'SELECTION_AFTER_CHOICE',
        estimated_shoot_minutes:shoot,
        score:Number(c.total_score || c.portfolio_final_score || 0)
      };
    })
  };
}

function socialV05WriteView_(payload) {
  var sh = ss_().getSheetByName(SOCIAL_V05_SHEET) || ss_().insertSheet(SOCIAL_V05_SHEET);
  var values = [['対象日','番号','状態','候補','Territory','なぜ今','過去投稿との差','撮影目安(分)']];
  (payload.candidates || []).forEach(function(c){
    values.push([
      payload.batch.target_date,
      c.candidate_no,
      c.status,
      c.title,
      c.territory,
      c.why_now || '',
      c.difference_from_history || '',
      c.estimated_shoot_minutes || ''
    ]);
  });
  if (sh.getMaxRows() < values.length) sh.insertRowsAfter(sh.getMaxRows(), values.length-sh.getMaxRows());
  sh.clearContents();
  sh.getRange(1,1,values.length,8).setValues(values).setWrap(true).setVerticalAlignment('top');
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#d9e5dd');
  sh.setColumnWidth(1,110);sh.setColumnWidth(2,60);sh.setColumnWidth(3,110);
  sh.setColumnWidth(4,320);sh.setColumnWidth(5,180);sh.setColumnWidth(6,360);sh.setColumnWidth(7,360);sh.setColumnWidth(8,100);
}

function socialV05LineText_(payload) {
  var lines = ['THE REV.｜今日のReel B候補',''];
  (payload.candidates || []).forEach(function(c){
    lines.push(c.candidate_no + '｜' + c.title);
    lines.push('役割: ' + c.territory);
    if (c.why_now) lines.push('理由: ' + c.why_now);
    if (c.difference_from_history) lines.push('差分: ' + c.difference_from_history);
    lines.push('撮影目安: ' + String(c.estimated_shoot_minutes || '?') + '分');
    lines.push('');
  });
  lines.push('選択はChatGPTへ: SOCIAL-' + String(payload.batch.target_date).replace(/-/g,'') + ' 3');
  lines.push('選ぶまで完成台本・撮影指示は作りません。');
  return lines.join('\n').slice(0,4900);
}

function socialV05PushLine_(payload) {
  var props = PropertiesService.getScriptProperties();
  var token = String(props.getProperty('THE_REV_LINE_CHANNEL_ACCESS_TOKEN') || '').trim();
  var owner = String(props.getProperty('THE_REV_LINE_USER_ID') || '').trim();
  if (!token || !owner) throw new Error('SOCIAL_LINE_CONFIG_MISSING');

  var key = 'SOCIAL_V05_PUSH_' + payload.batch.target_date;
  if (props.getProperty(key)==='SENT') return {status:'ALREADY_SENT'};

  var r = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push',{
    method:'post',
    contentType:'application/json',
    muteHttpExceptions:true,
    headers:{Authorization:'Bearer '+token},
    payload:JSON.stringify({to:owner,messages:[{type:'text',text:socialV05LineText_(payload)}]})
  });
  var code = r.getResponseCode();
  if (code<200 || code>=300) throw new Error('SOCIAL_LINE_HTTP_'+code);
  props.setProperty(key,'SENT');
  socialV05Bridge_({
    action:'social_candidates_notification_ack',
    target_date:payload.batch.target_date,
    status:'SENT'
  });
  return {status:'SENT'};
}

function refreshSocialReelCandidatesV050() {
  syncSocialPublishedHistoryV050();

  var target = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
  var existing = socialV05Bridge_({action:'social_candidates_poll',target_date:target});
  if (existing.batch && existing.candidates && existing.candidates.length===5) {
    socialV05WriteView_(existing);
    socialV05PushLine_(existing);
    return {status:'EXISTING',batch:existing.batch.id};
  }

  var generated = socialV05GenerateFive_();
  if (generated.status==='HISTORY_STALE') {
    var sh = ss_().getSheetByName(SOCIAL_V05_SHEET) || ss_().insertSheet(SOCIAL_V05_SHEET);
    sh.clearContents();
    sh.getRange(1,1,3,2).setValues([
      ['状態','HISTORY_STALE'],
      ['最終投稿からの日数',generated.freshness.days],
      ['対応','最新Instagram投稿の同期が完了するまで候補生成を停止']
    ]);
    return generated;
  }

  var prepared = socialV05Bridge_({
    action:'social_candidates_prepare',
    target_date:target,
    phase:SOCIAL_V05_PHASE,
    candidates:generated.candidates,
    source_context:{
      version:SOCIAL_V05_VERSION,
      history_freshness:generated.freshness,
      reel_a:'EXTERNAL_DISCOVERY_KNOWLEDGE',
      reel_b:'OWNED_STORE_EXPERIENCE_PROOF'
    }
  });
  socialV05WriteView_(prepared);
  socialV05PushLine_(prepared);
  return {status:'PREPARED',batch:prepared.batch.id};
}

function chooseSocialCandidateV050(candidateNo) {
  var target = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
  var result = socialV05Bridge_({
    action:'social_candidates_choose',
    target_date:target,
    candidate_no:Number(candidateNo)
  });
  var current = socialV05Bridge_({action:'social_candidates_poll',target_date:target});
  socialV05WriteView_(current);
  return result;
}

function scheduledSocialReelCandidatesV050() {
  try { return refreshSocialReelCandidatesV050(); }
  catch(e) {
    Logger.log('SOCIAL_V05_ERROR '+String(e));
    return {status:'ERROR',error:String(e)};
  }
}

function installSocialDirectorV050() {
  var existing = ScriptApp.getProjectTriggers().filter(function(t){
    return t.getHandlerFunction()==='scheduledSocialReelCandidatesV050';
  });
  if (!existing.length) {
    ScriptApp.newTrigger('scheduledSocialReelCandidatesV050')
      .timeBased().atHour(SOCIAL_V05_HOUR).nearMinute(SOCIAL_V05_MINUTE).everyDays(1).create();
  }
  return inspectSocialDirectorV050();
}

function inspectSocialDirectorV050() {
  var target = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
  var freshness = socialV05HistoryFreshness_();
  var poll = null;
  try { poll=socialV05Bridge_({action:'social_candidates_poll',target_date:target}); } catch(e) {}
  return {
    version:SOCIAL_V05_VERSION,
    target_date:target,
    timezone:Session.getScriptTimeZone(),
    history_freshness:freshness,
    trigger_count:ScriptApp.getProjectTriggers().filter(function(t){
      return t.getHandlerFunction()==='scheduledSocialReelCandidatesV050';
    }).length,
    batch:poll&&poll.batch?{id:poll.batch.id,status:poll.batch.status}:null,
    candidates:poll&&poll.candidates?poll.candidates.length:0,
    auto_publish:false
  };
}
