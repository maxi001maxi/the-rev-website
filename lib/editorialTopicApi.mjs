import { collectArticleHistory } from './editorialArticleHistory.mjs';
import { collectPublicationEvidence } from '../api/integrations/editorial-status.mjs';
import { prepareTopicProposal, proposalOptions, approvedQueue, topicNotification, TOPIC_STATUS } from './editorialTopicApproval.mjs';
import { loadProposal, saveNewProposal, pendingProposals, changeProposal } from './editorialTopicStore.mjs';
import { topicSeeds } from './editorialTopicSeeds.mjs';
import { rowTargetDateKey, planDailyEditorial } from './dailyEditorialStateMachine.mjs';
import { freshDailyShortlist, shouldReplaceWaitingProposal } from './editorialFreshDailyTopics.mjs';
import { processPendingGptOperatorRequests } from './editorialGptOperatorInbox.mjs';
import { evaluateCandidates } from './dailyEditorialCreator.mjs';
import { audienceMode, evaluateAudienceCandidate } from './editorialAudienceDiscovery.mjs';

export async function topicResponse(body, db, { historyCollector = collectArticleHistory, evidenceCollector = collectPublicationEvidence } = {}) {
  if (!['prepare', 'poll', 'choose', 'answer', 'redeliver', 'notification_ack', 'queue_ack'].includes(body.action)) throw new Error('INVALID_ACTION');

  // Connected GPT operators enqueue explicit owner actions into a private inbox.
  // Only the production Topic API consumes those inputs and applies the same
  // changeProposal -> chooseTopic/answerInterview validation/state machine.
  const gptOperator = ['prepare', 'poll'].includes(body.action)
    ? await processPendingGptOperatorRequests(db)
    : [];

  if (['choose', 'answer'].includes(body.action)) {
    // GPT's operator uses the existing secret Bridge after an explicit choice
    // in this conversation. "返答しました" alone is not an approval.
    if (body.source !== 'GPT') throw new Error('GPT_APPROVAL_SOURCE_REQUIRED');
    const p = await loadProposal(db, body.proposal_id);
    const option = p.options.find(o => o.number === body.number);
    return { proposal: await changeProposal(db, p.id, body.action, { candidateId: option?.candidate_id, answers: body.answers, source: 'GPT', actor: 'authenticated-gpt-operator' }) };
  }
  if (body.action === 'redeliver') {
    if (body.source !== 'GPT') throw new Error('GPT_REDELIVERY_SOURCE_REQUIRED');
    const p = await loadProposal(db, body.proposal_id);
    if (p.status !== TOPIC_STATUS.WAITING) throw new Error('TOPIC_REDELIVERY_NOT_WAITING');
    if (p.notification_status === 'PENDING') return { proposal: p, redelivery: 'ALREADY_PENDING' };
    if (!['SENT', 'ERROR'].includes(String(p.notification_status || ''))) throw new Error('TOPIC_REDELIVERY_INVALID_STATE');
    const match = String(p.notification_kind || '').match(/^TOPICS_RETRY_(\d+)$/);
    const generation = match ? Number(match[1]) + 1 : 1;
    const notificationKind = `TOPICS_RETRY_${generation}`;
    const r = await db.from('editorial_topic_proposals').update({
      notification_kind: notificationKind,
      notification_status: 'PENDING',
      notification_sent_at: null,
      notification_error: '',
      updated_at: new Date().toISOString()
    }).eq('id', p.id).eq('status', TOPIC_STATUS.WAITING);
    if (r.error) throw new Error('TOPIC_REDELIVERY_FAILED');
    return { proposal: await loadProposal(db, p.id), redelivery: notificationKind };
  }
  if (body.action === 'notification_ack') {
    if (!['SENT', 'ERROR'].includes(body.status)) throw new Error('INVALID_NOTIFICATION_STATUS');
    const r = await db.from('editorial_topic_proposals').update({ notification_status: body.status, notification_error: String(body.error || '').slice(0, 500), notification_sent_at: body.status === 'SENT' ? new Date().toISOString() : null })
      .eq('id', body.proposal_id).eq('notification_kind', body.kind).neq('notification_status', 'SENT');
    if (r.error) throw new Error('NOTIFICATION_ACK_FAILED');
    return {};
  }
  if (!Array.isArray(body.rows) || body.rows.length > 500 || !Array.isArray(body.outputRows)) throw new Error('FULL_QUEUE_AND_ARTICLE_HISTORY_REQUIRED');
  const pending = await pendingProposals(db);
  // A minute poll while waiting does not reread every canonical article from
  // GitHub. Full, fresh history is required only for proposal creation or resume.
  if (body.action === 'poll' && !pending.some(p => p.status === TOPIC_STATUS.APPROVED)) {
    return { ...topicSnapshot(pending, []), gpt_operator: gptOperator };
  }
  const evidence = await evidenceCollector({ supabase: db, rows: body.rows });
  if (evidence.error) throw new Error('PUBLICATION_EVIDENCE_UNAVAILABLE');
  // Reconcile here as well as in the legacy Gate; published rows must not occupy capacity.
  const rows = body.rows.map(r => {
    const e = evidence.byContentId[r.content_id];
    return e?.publish_status === 'PUBLISHED' && e.publish_verified_at && e.published_url ? { ...r, queue_status: 'PUBLISHED' } : r;
  });
  const history = await historyCollector({ supabase: db });
  const args = { rows, articleHistory: history, outputRows: body.outputRows, now: new Date(), settings: body.settings || {} };
  if (body.action === 'queue_ack') {
    const p = await loadProposal(db, body.proposal_id);
    const q = rows.find(r => r.content_id === body.content_id && r.topic_candidate_id === p.selected_candidate_id && rowTargetDateKey(r) === p.target_date);
    if (!q || !p.approved_at || ![TOPIC_STATUS.APPROVED, TOPIC_STATUS.CREATED].includes(p.status)) throw new Error('APPROVED_QUEUE_READBACK_REQUIRED');
    const r = await db.from('editorial_topic_proposals').update({ status: TOPIC_STATUS.CREATED, content_id: q.content_id, updated_at: new Date().toISOString() }).eq('id', p.id).eq('status', p.status);
    if (r.error) throw new Error('QUEUE_ACK_FAILED');
    return {};
  }
  let preparation;
  if (body.action === 'prepare') {
    if (!Array.isArray(body.shortlist) || body.shortlist.length > 200) throw new Error('SHORTLIST_REQUIRED');

    // A waiting proposal is only a snapshot. Revalidate it against the latest
    // queue + article history before today's notifications are emitted.
    // If any option became ineligible (already queued, recent-query overlap,
    // semantic overlap or age), replace all three options from the current pool.
    const pool = freshDailyShortlist(body.shortlist, args.now);
    const currentTarget = body.target_date || planDailyEditorial(args).target_date;
    for (const pendingProposal of pending.filter(p => p.status === TOPIC_STATUS.WAITING && p.target_date === currentTarget)) {
      const currentCandidates = (pendingProposal.options || []).map(o => o.candidate).filter(Boolean);
      const currentEval = evaluateCandidates({ ...args, queueRows: rows, shortlist: currentCandidates });
      const stale = shouldReplaceWaitingProposal(pendingProposal, pool, currentEval) ||
        (audienceMode() === 'ENFORCE' && currentEval.some(e => !evaluateAudienceCandidate(e.candidate, {
          history:[...(args.articleHistory || []), ...(args.outputRows || []), ...rows]
        }).eligible));
      if (!stale) continue;

      const refreshedOptions = proposalOptions({ ...args, shortlist: pool.strict ? pool.candidates : [...pool.candidates, ...topicSeeds()] });
      if (refreshedOptions.length !== 3 || refreshedOptions.some(o => !o.reason || !o.difference)) {
        const failed = await db.from('editorial_topic_proposals').update({
          status:TOPIC_STATUS.BLOCKED,
          notification_kind:'BLOCKED',
          notification_status:'PENDING',
          notification_sent_at:null,
          notification_error:'FRESH_DAILY_POOL_INSUFFICIENT_NO_OLD_RESEND',
          last_error:'FRESH_DAILY_POOL_INSUFFICIENT_NO_OLD_RESEND',
          updated_at:new Date().toISOString()
        }).eq('id',pendingProposal.id).eq('status',TOPIC_STATUS.WAITING);
        if (failed.error) throw new Error('STALE_PROPOSAL_REFRESH_FAILED');
        continue;
      }

      const m = String(pendingProposal.notification_kind || '').match(/^TOPICS_RETRY_(\d+)$/);
      const generation = m ? Number(m[1]) + 1 : 1;
      const refreshed = await db.from('editorial_topic_proposals').update({
        options: refreshedOptions,
        notification_kind:`TOPICS_RETRY_${generation}`,
        notification_status:'PENDING',
        notification_sent_at:null,
        notification_error:'',
        updated_at:new Date().toISOString()
      }).eq('id',pendingProposal.id).eq('status',TOPIC_STATUS.WAITING);
      if (refreshed.error) throw new Error('STALE_PROPOSAL_REFRESH_FAILED');
    }

    preparation = prepareTopicProposal({ ...args, shortlist: pool.strict ? pool.candidates : [...pool.candidates, ...topicSeeds()], targetDate: body.target_date, evidenceByContentId: evidence.byContentId });
    if (preparation.proposal) preparation.proposal = await saveNewProposal(db, preparation.proposal);
  }
  const proposals = await pendingProposals(db);
  const ready = [];
  for (const p of proposals) {
    if (p.status === TOPIC_STATUS.CREATED) continue;
    const next = approvedQueue(p, args);
    if (next.queue_row || next.status === 'ALREADY_CREATED') ready.push({ proposal_id: p.id, ...next });
    else if (next.status === 'CANDIDATE_NO_LONGER_ELIGIBLE' || next.status === 'TARGET_ALREADY_OCCUPIED') {
      const r = await db.from('editorial_topic_proposals').update({ status: TOPIC_STATUS.BLOCKED, last_error: JSON.stringify(next), notification_error: JSON.stringify(next), notification_kind:'BLOCKED', notification_status:'PENDING', notification_sent_at:null, updated_at: new Date().toISOString() }).eq('id', p.id).eq('status', TOPIC_STATUS.APPROVED);
      if (r.error) throw new Error('TOPIC_REVALIDATION_FAILED');
    }
  }
  return { preparation, ...topicSnapshot(proposals, ready), gpt_operator: gptOperator };
}

function topicSnapshot(proposals, ready) {
  return { proposals: proposals.map(p => ({ id: p.id, target_date: p.target_date, status: p.status, selected_candidate_id: p.selected_candidate_id, options: p.options.map(({ candidate, ...o }) => o), last_error: p.last_error })),
    ready: ready.slice(0, 1),
    notifications: proposals.filter(p => ['PENDING', 'ERROR'].includes(p.notification_status)).map(p => ({ proposal_id: p.id, kind: p.notification_kind, text: p.status === TOPIC_STATUS.BLOCKED ? `THE REV. Editorial AI｜旧候補の再送を停止しました。対象日: ${p.target_date}。読者分析を満たす新候補が3件揃うまで、選択・記事制作・公開を進めません。` : topicNotification(p) })),
    publish_requires_human_approval: true };
}
