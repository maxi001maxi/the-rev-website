// Topic choice is a separate, durable human gate. It never approves publication.
import crypto from 'node:crypto';
import { evaluateCandidates, buildQueueRow } from './dailyEditorialCreator.mjs';
import { planDailyEditorial, toJstDateKey, rowTargetDateKey, activeQueueSummary } from './dailyEditorialStateMachine.mjs';

export const TOPIC_STATUS = Object.freeze({ WAITING: 'TOPIC_SELECTION_WAITING', INTERVIEW: 'INTERVIEW_WAITING', APPROVED: 'APPROVED', CREATED: 'QUEUE_CREATED', BLOCKED: 'REVIEW_REQUIRED' });
export const LANE_LABELS = Object.freeze({ DENBA: 'DENBAの商品説明', OXYGEN_ROOM: '酸素ルームの利用説明', BOXING: 'ボクシングの現場説明', FACILITY_THE_REV: '店舗・サービス説明', TRAINING: 'トレーニングの検索ニーズ', GENERAL: '生活と運動の検索ニーズ' });
const terminal = new Set(['PUBLISHED', 'SKIPPED']);
const clean = (s, max = 1000) => String(s ?? '').trim().slice(0, max);

export function proposalOptions(args = {}) {
  const evaluated = evaluateCandidates({ ...args, queueRows: args.rows || [] });
  const eligible = evaluated.filter(e => e.eligible).sort((a, b) => b.score - a.score || a.candidate_id.localeCompare(b.candidate_id));
  // Do not demote a useful topic just because it needs an interview. Take one
  // per lane first, then fill from remaining eligible candidates.
  const chosen = [], lanes = new Set();
  const laneOf = e => clean(e.candidate.editorial_lane || e.candidate.content_cluster || 'GENERAL').toUpperCase();
  for (const e of eligible) if (!lanes.has(laneOf(e)) && chosen.length < 3) { chosen.push(e); lanes.add(laneOf(e)); }
  for (const e of eligible) if (!chosen.includes(e) && chosen.length < 3) chosen.push(e);
  return chosen.map((e, index) => ({
    number: index + 1, candidate_id: e.candidate_id,
    title: clean(e.candidate.title_candidate || e.candidate.topic, 180),
    role: LANE_LABELS[laneOf(e)] || LANE_LABELS.GENERAL,
    reason: /Review|Gate|Raw|Bonus/i.test(e.candidate.why_now || '')
      ? clean(`「${e.candidate.audience_question || e.candidate.topic}」という疑問に答え、${LANE_LABELS[laneOf(e)] || LANE_LABELS.GENERAL}を具体的に伝えるため。`,320)
      : clean(e.candidate.why_now || e.candidate.audience_question || e.candidate.selection_reason, 320),
    search_query: clean(e.candidate.primary_query, 180),
    difference: clean(e.candidate.unique_angle, 320).replace(/Fact Gate/gi,'根拠の確認').replace(/Raw|Bonus/gi,''),
    interview_required: !e.knowledge.sufficient,
    knowledge_reason: e.knowledge.reason,
    candidate: e.candidate,
    questions: !e.knowledge.sufficient ? [
      `「${clean(e.candidate.audience_question || e.candidate.topic, 160)}」について、THE REV.ではどのように説明・対応していますか？具体的な判断や手順を教えてください。`,
      'よくあるつまずきと、変えた方がよい対応を一つ教えてください。確認できていないことは「不明」で構いません。お客様を特定できる情報は不要です。'
    ] : []
  }));
}

export function prepareTopicProposal({ targetDate, ...args }) {
  const plan = planDailyEditorial(args);
  if (String(args.settings?.daily_editorial_enabled).toUpperCase() === 'FALSE') return { status: 'NOT_REQUIRED', reason: 'DISABLED', plan };
  const date = targetDate || plan.target_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || toJstDateKey(`${date}T12:00:00+09:00`) !== date) throw new Error('INVALID_TARGET_DATE');
  const existing = (args.rows || []).filter(r => rowTargetDateKey(r) === date && !terminal.has(clean(r.queue_status).toUpperCase()));
  // A duplicate held for human review can be replaced only after explicit topic
  // choice. Keep the old draft and its rejection history intact.
  const replaceable = existing.length && existing.every(r => r.queue_status === 'REVIEW_REQUIRED' && r.failed_stage === 'ARTICLE_OVERLAP');
  if (existing.length && !replaceable) return { status: 'NOT_REQUIRED', reason: 'ALREADY_SCHEDULED', plan };
  if (!targetDate && plan.decision.action !== 'CREATE_NEW' && !replaceable) return { status: 'NOT_REQUIRED', reason: plan.decision.reason, plan };
  const options = proposalOptions(args);
  if (options.length !== 3 || options.some(o => !o.reason || !o.difference)) return { status: 'POOL_REFRESH_REQUIRED', reason: 'THREE_REASONED_DISTINCT_OPTIONS_REQUIRED', plan };
  return { status: TOPIC_STATUS.WAITING, plan, proposal: {
    id: `TP-${date.replace(/-/g, '')}`, target_date: date, status: TOPIC_STATUS.WAITING,
    options, replaces_content_ids: replaceable ? existing.map(r => r.content_id) : [],
    notification_status: 'PENDING', notification_kind: 'TOPICS',
    created_at: new Date(args.now || Date.now()).toISOString()
  } };
}

export function chooseTopic(proposal, { candidateId, source, actor, now = new Date() }) {
  if (!['LINE', 'GPT', 'ADMIN'].includes(source) || !clean(actor)) throw new Error('APPROVAL_ACTOR_REQUIRED');
  const option = proposal.options.find(o => o.candidate_id === candidateId);
  if (!option) throw new Error('INVALID_CANDIDATE');
  if (proposal.status !== TOPIC_STATUS.WAITING) {
    if (proposal.selected_candidate_id === candidateId) return null; // repeat is idempotent
    throw new Error('CHOICE_ALREADY_LOCKED');
  }
  return { selected_candidate_id: candidateId, approved_at: new Date(now).toISOString(), approved_source: source, approved_actor: clean(actor, 180),
    status: option.interview_required ? TOPIC_STATUS.INTERVIEW : TOPIC_STATUS.APPROVED,
    notification_kind: option.interview_required ? 'INTERVIEW' : 'CHOICE_ACK', notification_status: 'PENDING', notification_sent_at: null };
}

export function answerInterview(proposal, { answers, source, actor, now = new Date() }) {
  if (!['LINE', 'GPT', 'ADMIN'].includes(source) || !clean(actor)) throw new Error('INTERVIEW_ACTOR_REQUIRED');
  if (proposal.status !== TOPIC_STATUS.INTERVIEW) throw new Error('NOT_WAITING_FOR_INTERVIEW');
  const option = proposal.options.find(o => o.candidate_id === proposal.selected_candidate_id);
  if (!Array.isArray(answers) || answers.length !== option.questions.length || answers.some(a => !clean(a) || String(a).length > 5000)) throw new Error('ALL_INTERVIEW_ANSWERS_REQUIRED');
  // Unknown-only replies are not first-party evidence. Keep waiting; no guess.
  if (answers.every(a => /^(不明|わからない|未確認|なし|unknown)[。.!！]*$/i.test(clean(a)))) throw new Error('INTERVIEW_EVIDENCE_MISSING');
  return { status: TOPIC_STATUS.APPROVED, interview_answers: answers.map(a => clean(a, 5000)), interview_answered_at: new Date(now).toISOString(), interview_source: source, interview_actor: clean(actor, 180), notification_status: 'PENDING', notification_sent_at: null, notification_kind: 'INTERVIEW_ACK' };
}

export function approvedQueue(proposal, args = {}) {
  if (String(args.settings?.daily_editorial_enabled).toUpperCase() === 'FALSE') return { status: 'DISABLED', queue_row: null };
  if (![TOPIC_STATUS.APPROVED, TOPIC_STATUS.CREATED].includes(proposal.status)) return { status: proposal.status, queue_row: null };
  const already = (args.rows || []).find(r => r.topic_candidate_id === proposal.selected_candidate_id && rowTargetDateKey(r) === proposal.target_date && r.queue_status !== 'SKIPPED');
  if (already) return { status: 'ALREADY_CREATED', content_id: already.content_id };
  if (proposal.status === TOPIC_STATUS.CREATED) return { status: 'QUEUE_READBACK_MISSING', queue_row: null };
  const replacing = (args.rows || []).filter(r => proposal.replaces_content_ids.includes(r.content_id) && r.queue_status !== 'SKIPPED');
  if (replacing.some(r => r.queue_status !== 'REVIEW_REQUIRED' || r.failed_stage !== 'ARTICLE_OVERLAP')) return { status: 'TARGET_ALREADY_OCCUPIED', queue_row: null };
  const rows = (args.rows || []).filter(r => !proposal.replaces_content_ids.includes(r.content_id));
  if (rows.some(r => rowTargetDateKey(r) === proposal.target_date && !terminal.has(r.queue_status))) return { status: 'TARGET_ALREADY_OCCUPIED', queue_row: null };
  const cap = Number(args.settings?.daily_editorial_max_active_queue || 5);
  if (activeQueueSummary(rows).count >= cap) return { status: 'ACTIVE_CAP_REACHED', queue_row: null };
  const option = proposal.options.find(o => o.candidate_id === proposal.selected_candidate_id);
  // Selection may be late. Do not expire an approved topic merely because the
  // weekly shortlist aged while the owner was answering. Recheck all history.
  const evaluated = evaluateCandidates({ ...args, queueRows: rows, shortlist: [{ ...option.candidate, generated_at: new Date(args.now || Date.now()).toISOString(), week_start: toJstDateKey(args.now || new Date()) }] })[0];
  if (!evaluated.eligible) return { status: 'CANDIDATE_NO_LONGER_ELIGIBLE', reasons: evaluated.reasons, queue_row: null };
  let knowledge = evaluated.knowledge;
  if (!knowledge.sufficient) {
    if (!proposal.interview_answered_at || !proposal.interview_answers?.length) return { status: TOPIC_STATUS.INTERVIEW, queue_row: null };
    knowledge = { decision: 'SUFFICIENT', sufficient: true, reason: 'OWNER_TOPIC_INTERVIEW', source_id: proposal.id,
      source_refs: [`${proposal.id} (${proposal.interview_source} first-party Interview)`], fact_ids: [], registry_version: 'topic-interview-v1' };
  }
  const queue = buildQueueRow({ evaluated: { ...evaluated, knowledge }, now: args.now || new Date(), queueRows: args.rows || [], targetDate: proposal.target_date });
  const context = JSON.parse(queue.knowledge_context_json);
  context.topic_approval = { proposal_id: proposal.id, source: proposal.approved_source, approved_at: proposal.approved_at };
  if (proposal.interview_answers?.length) {
    context.first_party = 'USED';
    context.interview = option.questions.map((question, i) => ({ question, answer: proposal.interview_answers[i] }));
    // Explicit source text for the existing Supervisor's knowledge prompt.
    context.main_claim = context.interview.map(x => `${x.question}\n${x.answer}`).join('\n\n');
    const gate = JSON.parse(queue.topic_gate_json);
    gate.notes = `${gate.notes || ''}\n一次情報Interview（原文。一般化・医療効果の断定をしない）:\n${context.main_claim}`;
    queue.topic_gate_json = JSON.stringify(gate);
  }
  queue.knowledge_context_json = JSON.stringify(context);
  queue.notes += ` Topic approval ${proposal.id} by ${proposal.approved_source}.`;
  return { status: 'READY_TO_CREATE', queue_row: queue, replaces_content_ids: proposal.replaces_content_ids };
}

export function topicNotification(proposal) {
  const option = proposal.options.find(o => o.candidate_id === proposal.selected_candidate_id);
  const head = `THE REV.｜${proposal.target_date} の記事\n候補ID: ${proposal.id}`;
  const topicChoiceNotice = /^TOPICS(?:_RETRY_\d+)?$/.test(String(proposal.notification_kind || ''));
  if (proposal.notification_kind === 'BLOCKED') return `${head}\n\n選択済みの記事は、最新の公開履歴との重複または対象日の競合で制作を保留しました。\n記事候補シートで確認し、GPTで新しい候補の相談をしてください。未確認のまま別の記事へ差し替えません。`;
  if (proposal.notification_kind === 'INTERVIEW') return `${head}\n\n選択: ${option.title}\n制作に必要な確認です。\n${option.questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}\n\n返信形式:\n${proposal.id} 回答\n1: 回答\n2: 回答\nGPTでも候補IDと回答を伝えられます。`;
  if (!topicChoiceNotice) return `${head}\n\n${option?.title || ''}\n回答を受け付けました。公開前の下書きまで進めます。公開は最終確認後です。`;
  return `${head}\n\n${proposal.options.map(o => `${o.number}. ${o.title}\n役割: ${o.role}\n理由: ${o.reason}\n既存記事との違い: ${o.difference}\n検索語: ${o.search_query}\n${o.interview_required ? '選択後に確認質問があります。' : '登録済みの一次資料で制作できます。'}`).join('\n\n')}\n\n返信例: ${proposal.id} 2\nGPTでも候補IDと番号を伝えられます。選択するまで制作を始めません。`;
}

export function verifyLineSignature(rawBody, signature, secret) {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(String(signature)), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parseTopicReply(text) {
  const value = clean(text, 12000);
  const choice = value.match(/^(TP-\d{8})\s+([123])$/);
  if (choice) return { action: 'choose', proposal_id: choice[1], number: Number(choice[2]) };
  const interview = value.match(/^(TP-\d{8})\s+回答\s*\n1[:：]\s*([\s\S]+?)\n2[:：]\s*([\s\S]+)$/);
  if (interview) return { action: 'answer', proposal_id: interview[1], answers: [interview[2].trim(), interview[3].trim()] };
  // A bare number or "返答しました" cannot identify a dated choice.
  return null;
}
