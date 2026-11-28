// THE REV. Editorial Auto-Publish gate (pure).
//
// Final Publish is human-approved today. This gate is the single switch a
// future auto-publisher must pass. It is OFF by default and needs two
// independent keys, so one misconfigured setting can never publish:
//
//   1. Vercel env  AUTO_PUBLISH_ENABLED === 'true'
//   2. 08_SETTINGS auto_publish        === TRUE
//
// No auto-publish executor exists in this repository. Even with both keys on,
// the gate answers `allowed: false` until an executor is deliberately added,
// reviewed and registered here.

export const AUTO_PUBLISH_ENV = 'AUTO_PUBLISH_ENABLED';
export const AUTO_PUBLISH_SETTING = 'auto_publish';
export const AUTO_PUBLISH_EXECUTOR_INSTALLED = false;

export const AUTO_PUBLISH_REASON = Object.freeze({
  DISABLED_ENV: 'AUTO_PUBLISH_ENV_DISABLED',
  DISABLED_SETTING: 'AUTO_PUBLISH_SETTING_DISABLED',
  NO_EXECUTOR: 'AUTO_PUBLISH_EXECUTOR_NOT_INSTALLED',
  NOT_REVIEW_READY: 'ARTICLE_NOT_REVIEW_READY',
  QUALITY_GATES_INCOMPLETE: 'QUALITY_GATES_INCOMPLETE',
  ALLOWED: 'ALL_GATES_PASSED'
});

function truthy(value) {
  if (value === true) return true;
  return ['TRUE', '1', 'YES', 'ON'].includes(String(value == null ? '' : value).trim().toUpperCase());
}

// Only the exact string "true" turns the env key on.
export function autoPublishEnvEnabled(env = process.env) {
  return String(env?.[AUTO_PUBLISH_ENV] ?? '').trim() === 'true';
}

// Quality gates an article must have passed before any automatic publish.
export const AUTO_PUBLISH_REQUIRED_GATES = Object.freeze([
  'queue_status=REVIEW_READY',
  'draft_status=READY',
  'image_status=READY',
  'web_bridge_status=PREVIEW_READY',
  'gbp_row_exists',
  'review_url_present'
]);

export function autoPublishGate({
  env = process.env,
  settings = {},
  queueRow = null,
  gbpRowExists = false,
  executorInstalled = AUTO_PUBLISH_EXECUTOR_INSTALLED
} = {}) {
  const envEnabled = autoPublishEnvEnabled(env);
  const settingEnabled = truthy(settings?.[AUTO_PUBLISH_SETTING]);
  const base = {
    mode: 'HUMAN_APPROVAL',
    allowed: false,
    env_enabled: envEnabled,
    setting_enabled: settingEnabled,
    executor_installed: executorInstalled === true,
    required_gates: [...AUTO_PUBLISH_REQUIRED_GATES]
  };
  if (!envEnabled) return { ...base, reason: AUTO_PUBLISH_REASON.DISABLED_ENV };
  if (!settingEnabled) return { ...base, reason: AUTO_PUBLISH_REASON.DISABLED_SETTING };
  if (executorInstalled !== true) return { ...base, reason: AUTO_PUBLISH_REASON.NO_EXECUTOR };

  const up = (v) => String(v == null ? '' : v).trim().toUpperCase();
  if (!queueRow || up(queueRow.queue_status) !== 'REVIEW_READY') {
    return { ...base, reason: AUTO_PUBLISH_REASON.NOT_REVIEW_READY };
  }
  const complete = (
    up(queueRow.draft_status) === 'READY'
    && up(queueRow.image_status) === 'READY'
    && up(queueRow.web_bridge_status) === 'PREVIEW_READY'
    && gbpRowExists === true
    && Boolean(String(queueRow.review_url || '').trim())
  );
  if (!complete) return { ...base, reason: AUTO_PUBLISH_REASON.QUALITY_GATES_INCOMPLETE };
  return { ...base, mode: 'AUTO_PUBLISH', allowed: true, reason: AUTO_PUBLISH_REASON.ALLOWED };
}
