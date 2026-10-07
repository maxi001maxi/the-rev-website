// THE REV. Daily Editorial Creator (pure, side-effect free).
//
// Connects the Gate decision to real work. When planDailyEditorial() says
// CREATE_NEW, this module deterministically
//   1. selects today's topic from the 23_BLOG_TOPIC_SHORTLIST pool,
//   2. applies the Knowledge Sufficiency gate from the versioned registry, and
//   3. builds the exact 26_DAILY_EDITORIAL_QUEUE row (DRAFTING / SUFFICIENT /
//      NOT_REQUIRED / NOT_STARTED) that the deployed GAS v0.6.5.2 Supervisor
//      already drafts, QCs, builds the GBP row for, bridges, image-polls and
//      notifies through to REVIEW_READY.
//
// No LLM judgement happens here. The ChatGPT Scheduled Task is no longer the
// decision maker: GAS posts Queue + shortlist rows to the Bridge, appends the
// returned row, and the Supervisor takes over. Final Publish and GBP posting
// stay human-only.

import crypto from 'node:crypto';
import { evaluateArticleOverlap, articleHistoryFromRows } from './editorialArticleOverlap.mjs';
import {
  DAILY_DECISION,
  DAILY_DECISION_REASON,
  planDailyEditorial,
  toJstDateKey,
  weekdayCodeForDateKey
} from './dailyEditorialStateMachine.mjs';
import { knowledgeDecisionFor } from './dailyEditorialKnowledge.mjs';
import { isBlogCategory } from '../assets/js/blog-taxonomy.mjs';

export const CREATION_STATUS = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED',
  READY_TO_CREATE: 'READY_TO_CREATE',
  INTERVIEW_REQUIRED: 'INTERVIEW_REQUIRED',
  NO_ELIGIBLE_CANDIDATE: 'NO_ELIGIBLE_CANDIDATE'
});

export const STUCK_REASON = Object.freeze({
  SUPERVISOR_NOT_PICKING_UP: 'SUPERVISOR_NOT_PICKING_UP',
  STAGE_STALLED: 'STAGE_STALLED',
  IMAGE_STALLED: 'IMAGE_STALLED',
  IMAGE_OPERATOR_BLOCKED: 'IMAGE_OPERATOR_BLOCKED',
  IMAGE_OPERATOR_FAILED: 'IMAGE_OPERATOR_FAILED',
  ERROR_STATE: 'ERROR_STATE'
});

export const CREATOR_DEFAULTS = Object.freeze({
  topicThreshold: 65,
  candidateMaxAgeDays: 14,
  queryOverlapDays: 14,
  stuckTimeoutMinutes: 10,
  imageStuckHours: 6,
  lowPoolWarning: 2
});

const USED_STATUSES = new Set(['SELECTED', 'USED', 'PUBLISHED', 'PREVIEW_PUBLISHED']);
const IN_FLIGHT_FOR_STUCK = new Set(['DRAFTING', 'PATCHING', 'TOPIC_SELECTED', 'QC', 'BRIDGE_SYNCING']);
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function token(value) {
  if (value === true) return 'TRUE';
  if (value === false) return 'FALSE';
  return String(value == null ? '' : value).trim().toUpperCase();
}

function numberOr(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Epoch milliseconds for GAS/Sheets timestamps. Naive "YYYY/MM/DD HH:mm"
// strings and Sheets serials are JST wall-clock values.
export function toEpochMs(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 1) return null;
    return SHEETS_EPOCH_MS + serial * DAY_MS - JST_OFFSET_MS;
  }
  const s = String(value).trim();
  const naive = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (naive) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = naive;
    return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)) - JST_OFFSET_MS;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

export function creatorSettings(settings = {}) {
  const threshold = numberOr(settings.daily_editorial_topic_threshold, CREATOR_DEFAULTS.topicThreshold);
  const maxAge = numberOr(settings.daily_editorial_candidate_max_age_days, CREATOR_DEFAULTS.candidateMaxAgeDays);
  const stuck = numberOr(settings.daily_editorial_stuck_timeout_minutes, CREATOR_DEFAULTS.stuckTimeoutMinutes);
  const imageHours = numberOr(settings.daily_editorial_image_stuck_hours, CREATOR_DEFAULTS.imageStuckHours);
  return {
    topicThreshold: threshold,
    candidateMaxAgeDays: maxAge > 0 ? maxAge : CREATOR_DEFAULTS.candidateMaxAgeDays,
    stuckTimeoutMinutes: stuck > 0 ? stuck : CREATOR_DEFAULTS.stuckTimeoutMinutes,
    imageStuckHours: imageHours > 0 ? imageHours : CREATOR_DEFAULTS.imageStuckHours
  };
}

export function resolveDailyEditorialCategory(candidate = {}) {
  const explicit = String(candidate?.category || '').trim();
  if (isBlogCategory(explicit)) return explicit;

  const lane = token(candidate?.editorial_lane);
  const cluster = token(candidate?.content_cluster);
  const pillar = token(candidate?.content_pillar);
  if (lane === 'BOXING' || cluster === 'BOXING' || pillar === 'BOXING') return 'boxing';
  if (['OXYGEN_ROOM','DENBA','RECOVERY'].includes(lane) || ['RECOVERY','BODY_RECOVERY'].includes(cluster) || pillar === 'RECOVERY') return 'recovery';
  if (lane === 'FACILITY_THE_REV' || ['SERVICE_UNDERSTANDING','START_CONTINUE','GYM_GUIDE'].includes(cluster) || ['GYM_LOCAL','SERVICE_UNDERSTANDING'].includes(pillar)) return 'gym-guide';
  if (['HEALTH','HEALTH_SAFETY'].includes(lane) || ['HEALTH','HEALTH_SAFETY'].includes(cluster) || ['HEALTH','HEALTH_SAFETY'].includes(pillar)) return 'health';
  if (['TRAINING','PERFORMANCE'].includes(lane) || ['TRAINING','PERFORMANCE'].includes(cluster) || ['TRAINING','PERFORMANCE'].includes(pillar)) return 'training';

  const text = [
    candidate?.topic,
    candidate?.title_candidate,
    candidate?.primary_query,
    candidate?.audience_question,
    candidate?.why_now,
    candidate?.unique_angle
  ].map((value) => String(value || '')).join(' ');

  const articleType = token(candidate?.article_type);
  if (
    ['COMPARISON_GUIDE','SERVICE_GUIDE','LOCATION_GUIDE','PRICE_GUIDE'].includes(articleType) &&
    /(新大宮|ジム|パーソナルジム|体験|入会|通いやす|続けやす|通う頻度|ジム選び|選ぶ|比較)/i.test(text)
  ) return 'gym-guide';
  if (/(酸素ルーム|DENBA|リカバリー|休養|コンディショニング)/i.test(text)) return 'recovery';
  if (/(健康診断|健診|血圧|体調|安全に運動|運動を始める前)/i.test(text)) return 'health';
  if (/(新大宮|ジム選び|パーソナルジム|体験|入会|通いやす|続けやす|通う頻度)/i.test(text)) return 'gym-guide';
  if (/(ボクシング|ミット|パンチ|シャドー)/i.test(text)) return 'boxing';
  if (/(筋トレ|トレーニング|フォーム|重量|回数|筋肉|スクワット|ベンチ|デッドリフト)/i.test(text)) return 'training';

  return '';
}

export function candidateScore(candidate = {}) {
  return (
    numberOr(candidate.portfolio_final_score)
    ?? numberOr(candidate.pillar_adjusted_score)
    ?? numberOr(candidate.total_score, 0)
  );
}

function dayNumber(dateKey) {
  return dateKey ? Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS) : null;
}

// Evaluates every shortlist row and returns who is eligible and why not.
export function evaluateCandidates({ shortlist = [], queueRows = [], now = new Date(), settings = {}, sources, articleHistory = [], outputRows = [] } = {}) {
  const cfg = creatorSettings(settings);
  const today = dayNumber(toJstDateKey(now));
  const queuedIds = new Set(queueRows.map((r) => String(r?.topic_candidate_id || '').trim()).filter(Boolean));
  const recentQueries = new Set(queueRows
    .filter((r) => token(r?.queue_status) !== 'SKIPPED')
    .filter((r) => {
      const d = dayNumber(toJstDateKey(r?.run_date));
      return d != null && today != null && today - d <= CREATOR_DEFAULTS.queryOverlapDays;
    })
    .map((r) => String(r?.primary_query || '').trim())
    .filter(Boolean));

  return shortlist.map((candidate) => {
    const id = String(candidate?.candidate_id || '').trim();
    const status = token(candidate?.status);
    const category = resolveDailyEditorialCategory(candidate);
    const normalizedCandidate = category ? { ...candidate, category } : { ...candidate };
    const reasons = [];
    if (!category) reasons.push('CATEGORY_UNRESOLVED');
    if (!id) reasons.push('NO_CANDIDATE_ID');
    if (token(candidate?.route_lane) !== 'WEB_BLOG') reasons.push('NOT_WEB_BLOG');
    if (token(candidate?.decision) !== 'PUBLISH') reasons.push('NOT_PUBLISH_DECISION');
    if (USED_STATUSES.has(status) || status.startsWith('SKIPPED')) reasons.push(`STATUS_${status}`);
    if (id && queuedIds.has(id)) reasons.push('ALREADY_QUEUED');
    const query = String(candidate?.primary_query || '').trim();
    if (query && recentQueries.has(query)) reasons.push('QUERY_OVERLAP_RECENT_QUEUE');
    if (numberOr(candidate?.total_score, 0) < cfg.topicThreshold) reasons.push('BELOW_RAW_GATE');
    const weekKey = toJstDateKey(candidate?.week_start) || toJstDateKey(candidate?.generated_at);
    const age = weekKey && today != null ? today - dayNumber(weekKey) : null;
    if (age == null || age > cfg.candidateMaxAgeDays) reasons.push('STALE_CANDIDATE');

    const duplicate = evaluateArticleOverlap(normalizedCandidate, articleHistoryFromRows(articleHistory, outputRows, queueRows));
    if (duplicate.overlap) reasons.push('SKIPPED_OVERLAP');
    const knowledge = knowledgeDecisionFor(normalizedCandidate, sources);
    return {
      candidate: normalizedCandidate,
      candidate_id: id,
      score: candidateScore(candidate),
      raw_score: numberOr(candidate?.total_score, 0),
      rank: numberOr(candidate?.rank, 999),
      reasons,
      eligible: reasons.length === 0,
      knowledge,
      duplicate
    };
  });
}

function compareEvaluated(a, b) {
  return (
    b.score - a.score
    || b.raw_score - a.raw_score
    || a.rank - b.rank
    || a.candidate_id.localeCompare(b.candidate_id)
  );
}

export function selectDailyCandidate(args = {}) {
  const evaluated = evaluateCandidates(args);
  const eligible = evaluated.filter((e) => e.eligible);
  const sufficient = eligible.filter((e) => e.knowledge.sufficient).sort(compareEvaluated);
  const needsInterview = eligible.filter((e) => !e.knowledge.sufficient).sort(compareEvaluated);
  return {
    selected: sufficient[0] || null,
    sufficient_pool: sufficient.length,
    interview_pool: needsInterview,
    evaluated
  };
}

// JST calendar date as YYYY/MM/DD. GAS serializes Sheet dates as UTC ISO strings
// and v0.6.5.2 reads the first 10 characters verbatim, so a copied value would
// land one day early. Writing the JST date avoids that off-by-one.
function slashDate(value) {
  const key = toJstDateKey(value);
  return key ? key.replace(/-/g, '/') : '';
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 6);
}

function nextQueueId(dateKey, queueRows) {
  const compact = dateKey.replace(/-/g, '');
  const prefix = `DQ-${compact}-`;
  const used = queueRows
    .map((r) => String(r?.queue_id || ''))
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
}

const STRATEGIC_LANES = new Set(['OXYGEN_ROOM', 'DENBA', 'FACILITY_THE_REV']);

// Builds the exact Queue row required by the state contract. Column names
// follow 26_DAILY_EDITORIAL_QUEUE. created_at/updated_at are ISO instants; the
// GAS writer converts them to Dates.
export function buildQueueRow({ evaluated, now = new Date(), queueRows = [], targetDate: target } = {}) {
  const candidate = evaluated.candidate;
  const knowledge = evaluated.knowledge;
  // run_date = the day this run happens. target_date = the content day.
  // content_id carries the target day so the Bridge can date the article.
  const runDate = toJstDateKey(now);
  const targetDate = target || runDate;
  const compact = targetDate.replace(/-/g, '');
  const contentId = `BLOG-${compact}-${shortHash(evaluated.candidate_id)}`;
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const [y, m, d] = runDate.split('-');
  const lane = token(candidate.editorial_lane);

  const topicGate = {
    candidate_id: evaluated.candidate_id,
    decision: 'PUBLISH',
    route_lane: 'WEB_BLOG',
    topic: candidate.topic || '',
    title_candidate: candidate.title_candidate || '',
    primary_query: candidate.primary_query || '',
    audience_question: candidate.audience_question || '',
    why_now: candidate.why_now || '',
    local_angle: candidate.local_angle || '',
    unique_angle: candidate.unique_angle || '',
    selection_reason: candidate.selection_reason || '',
    article_type: candidate.article_type || 'STANDARD',
    total_score: evaluated.raw_score,
    raw_topic_score: evaluated.raw_score,
    pillar_adjusted_score: numberOr(candidate.pillar_adjusted_score),
    portfolio_final_score: numberOr(candidate.portfolio_final_score),
    source_refs: candidate.source_refs || '',
    notes: candidate.notes || '',
    comparison_doc_url: candidate.comparison_doc_url || '',
    created_by: 'daily-creator-v0.6.9'
  };
  const knowledgeContext = {
    decision: 'SUFFICIENT',
    sufficient: true,
    reason: knowledge.reason,
    source_id: knowledge.source_id,
    source_refs: knowledge.source_refs,
    fact_ids: knowledge.fact_ids,
    registry_version: knowledge.registry_version,
    main_claim: candidate.unique_angle || ''
  };

  return {
    queue_id: nextQueueId(runDate, queueRows),
    run_date: `${y}/${m}/${d}`,
    target_date: targetDate.replace(/-/g, '/'),
    weekday: weekdayCodeForDateKey(runDate),
    content_id: contentId,
    topic_candidate_id: evaluated.candidate_id,
    topic: candidate.topic || '',
    primary_query: candidate.primary_query || '',
    category: candidate.category || '',
    queue_status: 'DRAFTING',
    knowledge_gate: 'SUFFICIENT',
    interview_required: false,
    interview_status: 'NOT_REQUIRED',
    draft_status: 'NOT_STARTED',
    image_status: 'NOT_STARTED',
    review_url: '',
    priority: STRATEGIC_LANES.has(lane) ? 'HIGH' : 'NORMAL',
    source_knowledge: knowledge.source_refs.join(' + '),
    created_at: nowIso,
    updated_at: nowIso,
    notes: `Created by Daily Creator v0.6.9 from ${evaluated.candidate_id} on Gate CREATE_NEW (run ${runDate}, target ${targetDate}). Auto Publish OFF / Human approval required.`,
    week_start: slashDate(candidate.week_start) || slashDate(candidate.generated_at),
    editor_score: '',
    topic_gate_score: evaluated.raw_score,
    gbp_id: '',
    web_bridge_status: 'NOT_SYNCED',
    topic_gate_json: JSON.stringify(topicGate),
    knowledge_context_json: JSON.stringify(knowledgeContext),
    last_error: '',
    content_pillar: candidate.content_pillar || '',
    pillar_recent12_count: candidate.pillar_recent12_count ?? '',
    pillar_diversity_adjustment: candidate.pillar_diversity_adjustment ?? '',
    pillar_policy_version: candidate.pillar_policy_version || '',
    content_cluster: candidate.content_cluster || '',
    cluster_recent4_count: candidate.cluster_recent4_count ?? '',
    cluster_priority_adjustment: candidate.cluster_priority_adjustment ?? '',
    cluster_policy_version: candidate.cluster_policy_version || '',
    editorial_lane: candidate.editorial_lane || '',
    portfolio_recent12_count: candidate.portfolio_recent12_count ?? '',
    portfolio_soft_target: candidate.portfolio_soft_target ?? '',
    portfolio_adjustment: candidate.portfolio_adjustment ?? '',
    portfolio_final_score: candidate.portfolio_final_score ?? '',
    last_successful_stage: 'TOPIC_SELECTED',
    failed_stage: '',
    next_stage: 'BLOG_DRAFT',
    human_action_required: 'NONE',
    notification_status: 'PENDING',
    notification_channel: 'LINE',
    notification_sent_at: '',
    notification_summary: '',
    supervisor_heartbeat_at: ''
  };
}

// Rows that stopped moving. Only automation-owned stages are judged; human
// waits (INTERVIEW_WAITING, REVIEW_READY, REVIEW_REQUIRED) are never "stuck".
export function detectStuckRows({ rows = [], now = new Date(), settings = {} } = {}) {
  const cfg = creatorSettings(settings);
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const stuck = [];
  for (const row of rows) {
    const status = token(row?.queue_status);
    const contentId = String(row?.content_id || '').trim();
    if (!contentId || !status) continue;
    const updatedMs = toEpochMs(row?.updated_at);
    const ageMin = updatedMs == null ? null : (nowMs - updatedMs) / 60000;

    if (status === 'ERROR' || status === 'BRIDGE_ERROR') {
      stuck.push({ content_id: contentId, queue_status: status, reason: STUCK_REASON.ERROR_STATE, age_minutes: ageMin });
      continue;
    }
    if (IN_FLIGHT_FOR_STUCK.has(status) && ageMin != null) {
      const draftStatus = token(row?.draft_status);
      const notStarted = status === 'DRAFTING' && (!draftStatus || draftStatus === 'NOT_STARTED');
      if (notStarted && ageMin > cfg.stuckTimeoutMinutes) {
        stuck.push({ content_id: contentId, queue_status: status, reason: STUCK_REASON.SUPERVISOR_NOT_PICKING_UP, age_minutes: Math.round(ageMin) });
      } else if (!notStarted && ageMin > cfg.stuckTimeoutMinutes * 3) {
        stuck.push({ content_id: contentId, queue_status: status, reason: STUCK_REASON.STAGE_STALLED, age_minutes: Math.round(ageMin) });
      }
      continue;
    }
    if (status === 'IMAGE_PREPARING') {
      const imageStatus = token(row?.image_status);
      const failedStage = token(row?.failed_stage);
      if (failedStage === 'IMAGE_OPERATOR' && imageStatus === 'BLOCKED') {
        stuck.push({ content_id: contentId, queue_status: status, reason: STUCK_REASON.IMAGE_OPERATOR_BLOCKED, age_minutes: ageMin == null ? null : Math.round(ageMin) });
      } else if (failedStage === 'IMAGE_OPERATOR' && imageStatus === 'ERROR') {
        stuck.push({ content_id: contentId, queue_status: status, reason: STUCK_REASON.IMAGE_OPERATOR_FAILED, age_minutes: ageMin == null ? null : Math.round(ageMin) });
      } else if (ageMin != null && ageMin > cfg.imageStuckHours * 60) {
        stuck.push({ content_id: contentId, queue_status: status, reason: STUCK_REASON.IMAGE_STALLED, age_minutes: Math.round(ageMin) });
      }
    }
  }
  return stuck;
}

// Gate + Creator in one deterministic call. `creation.queue_row` is the only
// thing GAS needs to append; everything else is for logging and notification.
export function planDailyCreation({
  rows = [],
  shortlist = [],
  now = new Date(),
  settings = {},
  evidenceByContentId = {},
  sources,
  articleHistory = [],
  outputRows = []
} = {}) {
  const plan = planDailyEditorial({ rows, now, settings, evidenceByContentId });
  const publishedNow = new Set(plan.reconciliation.patches.map((p) => p.content_id));
  const stuck = detectStuckRows({
    rows: rows.filter((r) => !publishedNow.has(String(r?.content_id || '').trim())),
    now,
    settings
  });

  if (plan.decision.action !== DAILY_DECISION.CREATE_NEW) {
    return {
      plan,
      stuck,
      creation: { status: CREATION_STATUS.NOT_REQUIRED, reason: plan.decision.reason }
    };
  }

  // The old scheduler and connector fallback must also respect the new gate.
  // Only editorial-topics may return a queue row after a persisted human choice.
  if (token(settings.daily_editorial_topic_approval_required) === 'TRUE') {
    return { plan, stuck, creation: { status: 'TOPIC_SELECTION_WAITING', reason: 'OWNER_TOPIC_APPROVAL_REQUIRED', human_action_required: 'CHOOSE_TOPIC_IN_LINE_OR_GPT' } };
  }

  const selection = selectDailyCandidate({ shortlist, queueRows: rows, now, settings, sources, articleHistory, outputRows });
  const considered = selection.evaluated.map((e) => ({
    candidate_id: e.candidate_id,
    score: e.score,
    eligible: e.eligible,
    reasons: e.reasons,
    knowledge: e.knowledge.decision,
    duplicate: e.duplicate
  }));

  if (selection.selected) {
    const remaining = selection.sufficient_pool - 1;
    return {
      plan,
      stuck,
      creation: {
        status: CREATION_STATUS.READY_TO_CREATE,
        candidate_id: selection.selected.candidate_id,
        knowledge: selection.selected.knowledge,
        queue_row: buildQueueRow({ evaluated: selection.selected, now, queueRows: rows, targetDate: plan.target_date }),
        pool_remaining: remaining,
        low_pool: remaining <= CREATOR_DEFAULTS.lowPoolWarning,
        considered
      }
    };
  }

  const interview = selection.interview_pool[0] || null;
  return {
    plan,
    stuck,
    creation: {
      status: interview ? CREATION_STATUS.INTERVIEW_REQUIRED : CREATION_STATUS.NO_ELIGIBLE_CANDIDATE,
      reason: interview ? 'ONLY_CANDIDATES_NEEDING_FIRST_PARTY_INTERVIEW' : 'NO_ELIGIBLE_SHORTLIST_CANDIDATE',
      interview_candidates: selection.interview_pool.map((e) => e.candidate_id),
      human_action_required: interview
        ? 'Interview質問の生成と回答、または23_BLOG_TOPIC_SHORTLISTの更新'
        : '23_BLOG_TOPIC_SHORTLISTの更新（週次Brief / Shortlistの再実行）',
      pool_remaining: 0,
      low_pool: true,
      considered
    }
  };
}

export { DAILY_DECISION, DAILY_DECISION_REASON };
