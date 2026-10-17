/**
 * THE REV. Editorial AI v0.7.2
 * Image Operator BLOCKED/FAILED -> Primary Supervisor adapter.
 *
 * The image operator already persists durable state in GitHub. The status API
 * now returns that state. This adapter makes the 1-minute Primary Supervisor
 * consume it instead of pretending every non-READY image is merely PREPARING.
 *
 * Queue stays IMAGE_PREPARING so the Primary keeps polling and can recover
 * automatically after an external blocker is cleared or a repaired image
 * version becomes READY. The explicit image_status / failed_stage /
 * human_action_required fields carry the failure truth.
 *
 * Final Publish remains human-only.
 */

var V072_IMAGE_OPERATOR_VERSION = 'v0.7.2';

function v072OperatorBlocking_(operator) {
  return operator && operator.matched === true && operator.blocking === true;
}

function v072OperatorQueueStatus_(operator) {
  return String(operator && operator.state || '').toUpperCase() === 'BLOCKED' ? 'BLOCKED' : 'ERROR';
}

function v072OperatorError_(operator) {
  return [
    'IMAGE_OPERATOR_' + String(operator && (operator.status || operator.state) || 'BLOCKED'),
    operator && operator.code ? 'code=' + operator.code : '',
    operator && operator.last_error ? String(operator.last_error) : ''
  ].filter(Boolean).join(' / ').slice(0, 1200);
}

function v072NotifyOperator_(q, operator) {
  var contentId = String(q && q.content_id || '').trim();
  var status = String(operator && (operator.status || operator.state) || 'BLOCKED').toUpperCase();
  var version = String(operator && operator.asset_version || '').trim();
  var key = 'THE_REV_IMAGE_OPERATOR_' + contentId + '_' + status + '_' + version;
  var action = String(operator && operator.human_action_required || 'REVIEW_IMAGE_OPERATOR');
  var text = [
    'THE REV. Editorial AI｜画像処理が停止しています',
    '',
    String(q && q.topic || ''),
    '',
    '状態: ' + status,
    operator && operator.code ? '原因コード: ' + operator.code : '',
    operator && operator.last_error ? '詳細: ' + String(operator.last_error).slice(0, 900) : '',
    '対応: ' + action,
    '',
    'Content ID: ' + contentId,
    '※記事Publishは行っていません。'
  ].filter(Boolean).join('\n');

  if (typeof v069cNotifyOnce_ === 'function') return v069cNotifyOnce_(key, text);

  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(key) === 'TRUE') return { status: 'ALREADY_SENT' };
  if (typeof v065LinePushText_ !== 'function') return { status: 'LINE_SENDER_MISSING' };
  var sent = v065LinePushText_(text);
  if (sent && sent.status === 'SENT') props.setProperty(key, 'TRUE');
  return sent || { status: 'UNKNOWN' };
}

function v072CheckImageDirect_(q) {
  var secret = v065BridgeSecret_();
  if (!secret) throw new Error('EDITORIAL_BRIDGE_SECRET is not configured in Script Properties.');
  var contentId = String(q.content_id || '').trim();
  var url = 'https://the-rev-website.vercel.app/api/integrations/editorial-status/?content_id=' +
    encodeURIComponent(contentId);
  var r = v065FetchJson_(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + secret }
  });

  if (r.code === 404) return { ready: false, status: 'NOT_FOUND', operator: null };
  if (r.code < 200 || r.code >= 300 || !r.json || r.json.ok !== true) {
    throw new Error(
      'Editorial status bridge failed: HTTP ' + r.code + ' / ' +
      String((r.json && r.json.message) || r.body || '').slice(0, 1200)
    );
  }

  var a = r.json.article || {};
  var operator = r.json.operator || null;
  var blocked = v072OperatorBlocking_(operator);
  var ready = !blocked &&
    r.json.readiness && r.json.readiness.ready === true &&
    String(a.image_status || '').toUpperCase() === 'READY' &&
    a.image_asset_ready === true;
  var imageStatus = blocked ? v072OperatorQueueStatus_(operator) : String(a.image_status || 'PREPARING');
  var operatorError = blocked ? v072OperatorError_(operator) : '';

  v065UpsertBridgeSheet_(contentId, {
    synced_at: new Date(),
    bridge_status: ready ? 'PREVIEW_READY' : 'IMAGE_PREPARING',
    site_draft_id: String(a.id || ''),
    review_url: String(r.json.review_url || ''),
    editor_url: String(r.json.editor_url || ''),
    slug: String(a.slug || ''),
    title: String(a.title || ''),
    image_status: imageStatus,
    thumbnail_path: String(a.thumbnail || ''),
    og_image_path: String(a.og_image || ''),
    image_updated_at: new Date(),
    image_qa: a.image_qa || '',
    last_error: operatorError,
    notes: blocked
      ? 'Image Operator state returned to Primary. Human approval still required before publish.'
      : 'Human approval required before publish.'
  });

  return {
    ready: ready,
    review_url: String(r.json.review_url || ''),
    editor_url: String(r.json.editor_url || ''),
    image_status: imageStatus,
    reason: String(r.json.readiness && r.json.readiness.reason || ''),
    operator: operator
  };
}

function v072PollImage_() {
  var qsh = ss_().getSheetByName('26_DAILY_EDITORIAL_QUEUE');
  if (!qsh) return { status: 'SHEET_MISSING' };
  var q = getObjectsWithRow_(qsh).find(function(r) {
    return v065Token_(r.queue_status) === 'IMAGE_PREPARING' && String(r.content_id || '').trim();
  });
  if (!q) return { status: 'NO_IMAGE_POLL' };

  try {
    var checked = v065CheckImageDirect_(q);
    var now = new Date();

    if (v072OperatorBlocking_(checked.operator)) {
      var operator = checked.operator;
      var imageStatus = v072OperatorQueueStatus_(operator);
      var lastError = v072OperatorError_(operator);
      var changed =
        v065Token_(q.image_status) !== imageStatus ||
        String(q.failed_stage || '') !== 'IMAGE_OPERATOR' ||
        String(q.last_error || '') !== lastError;

      var patch = {
        queue_status: 'IMAGE_PREPARING',
        draft_status: 'READY',
        image_status: imageStatus,
        web_bridge_status: 'IMAGE_PREPARING',
        failed_stage: 'IMAGE_OPERATOR',
        next_stage: 'IMAGE_OPERATOR',
        human_action_required: String(operator.human_action_required || 'REVIEW_IMAGE_OPERATOR'),
        last_error: lastError,
        supervisor_heartbeat_at: now
      };
      if (changed) patch.updated_at = now;
      setObjectRow_(qsh, q.__row, patch);

      var notice = v072NotifyOperator_(q, operator);
      return {
        status: String(operator.state || '').toUpperCase() === 'BLOCKED'
          ? 'IMAGE_OPERATOR_BLOCKED'
          : 'IMAGE_OPERATOR_FAILED',
        content_id: String(q.content_id || ''),
        operator_status: String(operator.status || ''),
        operator_code: operator.code || '',
        attempts_total: operator.attempts_total,
        max_attempts: operator.max_attempts,
        human_action_required: operator.human_action_required || '',
        notification: notice && notice.status || ''
      };
    }

    if (checked.ready) {
      setObjectRow_(qsh, q.__row, {
        queue_status: 'REVIEW_READY',
        draft_status: 'READY',
        image_status: 'READY',
        review_url: checked.review_url || String(q.review_url || ''),
        web_bridge_status: 'PREVIEW_READY',
        failed_stage: '',
        next_stage: 'HUMAN_REVIEW',
        human_action_required: 'REVIEW_AND_PUBLISH',
        last_error: '',
        supervisor_heartbeat_at: now,
        updated_at: now
      });
      return {
        status: 'REVIEW_READY',
        content_id: String(q.content_id || ''),
        review_url: checked.review_url || ''
      };
    }

    // A repaired/requeued operator state should automatically clear the old
    // BLOCKED/ERROR marker while the Queue remains pollable.
    if (String(q.failed_stage || '') === 'IMAGE_OPERATOR') {
      setObjectRow_(qsh, q.__row, {
        queue_status: 'IMAGE_PREPARING',
        draft_status: 'READY',
        image_status: 'PREPARING',
        web_bridge_status: 'IMAGE_PREPARING',
        failed_stage: '',
        next_stage: 'IMAGE_QA',
        human_action_required: 'NONE',
        last_error: '',
        supervisor_heartbeat_at: now,
        updated_at: now
      });
    }

    return {
      status: 'IMAGE_PREPARING',
      content_id: String(q.content_id || ''),
      review_url: checked.review_url || String(q.review_url || ''),
      reason: checked.reason || ''
    };
  } catch (e) {
    var msg = typeof errorText_ === 'function' ? errorText_(e) : String(e && e.stack || e);
    setObjectRow_(qsh, q.__row, {
      queue_status: 'BRIDGE_ERROR',
      failed_stage: 'IMAGE_STATUS_BRIDGE',
      next_stage: 'IMAGE_STATUS_BRIDGE',
      last_error: msg,
      supervisor_heartbeat_at: new Date(),
      updated_at: new Date()
    });
    return { status: 'BRIDGE_ERROR', content_id: String(q.content_id || ''), error: msg };
  }
}

var V072_IMAGE_OPERATOR_ADAPTER = (function() {
  if (typeof v065CheckImageDirect_ !== 'function' || typeof v065PollImage_ !== 'function') {
    return 'SUPERVISOR_NOT_PRESENT';
  }
  v065CheckImageDirect_ = v072CheckImageDirect_;
  v065PollImage_ = v072PollImage_;
  return 'IMAGE_OPERATOR_PRIMARY_STATUS_INSTALLED';
})();

function inspectEditorialImageOperatorStatusV072() {
  return {
    version: V072_IMAGE_OPERATOR_VERSION,
    adapter: V072_IMAGE_OPERATOR_ADAPTER,
    auto_publish: false,
    human_approval: true
  };
}
