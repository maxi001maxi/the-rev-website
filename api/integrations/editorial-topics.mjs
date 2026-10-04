import { extractBearerSecret, safeSecretEqual } from '../../lib/editorialBridge.mjs';
import { collectArticleHistory } from '../../lib/editorialArticleHistory.mjs';
import { collectPublicationEvidence } from './editorial-status.mjs';
import { prepareTopicProposal, approvedQueue, topicNotification, TOPIC_STATUS } from '../../lib/editorialTopicApproval.mjs';
import { topicClient, loadProposal, saveNewProposal, pendingProposals, changeProposal } from '../../lib/editorialTopicStore.mjs';
import { topicSeeds } from '../../lib/editorialTopicSeeds.mjs';

export const config = { maxDuration: 300 };

export async function topicResponse(body, db, { historyCollector = collectArticleHistory, evidenceCollector = collectPublicationEvidence } = {}) {
  if (!['prepare', 'poll', 'choose', 'answer', 'notification_ack', 'queue_ack'].includes(body.action)) throw new Error('INVALID_ACTION');
  if (['choose', 'answer'].includes(body.action)) {
    // GPT's operator uses the existing secret Bridge after an explicit choice
    // in this conversation. "返答しました" alone is not an approval.
    if (body.source !== 'GPT') throw new Error('GPT_APPROVAL_SOURCE_REQUIRED');
    const p = await loadProposal(db, body.proposal_id);
    const option = p.options.find(o => o.number === body.number);
    return { proposal: await changeProposal(db, p.id, body.action, { candidateId: option?.candidate_id, answers: body.answers, source: 'GPT', actor: 'authenticated-gpt-operator' }) };
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
  if (body.action === 'poll' && !pending.some(p => p.status === TOPIC_STATUS.APPROVED)) return topicSnapshot(pending, []);
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
    const q = rows.find(r => r.content_id === body.content_id && r.topic_candidate_id === p.selected_candidate_id && String(r.target_date || '').replace(/\//g, '-').slice(0, 10) === p.target_date);
    if (!q || !p.approved_at || ![TOPIC_STATUS.APPROVED, TOPIC_STATUS.CREATED].includes(p.status)) throw new Error('APPROVED_QUEUE_READBACK_REQUIRED');
    const r = await db.from('editorial_topic_proposals').update({ status: TOPIC_STATUS.CREATED, content_id: q.content_id, updated_at: new Date().toISOString() }).eq('id', p.id).eq('status', p.status);
    if (r.error) throw new Error('QUEUE_ACK_FAILED');
    return {};
  }
  let preparation;
  if (body.action === 'prepare') {
    if (!Array.isArray(body.shortlist) || body.shortlist.length > 200) throw new Error('SHORTLIST_REQUIRED');
    preparation = prepareTopicProposal({ ...args, shortlist: [...body.shortlist, ...topicSeeds()], targetDate: body.target_date, evidenceByContentId: evidence.byContentId });
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
  return { preparation, ...topicSnapshot(proposals, ready) };
}

function topicSnapshot(proposals, ready) {
  return { proposals: proposals.map(p => ({ id: p.id, target_date: p.target_date, status: p.status, selected_candidate_id: p.selected_candidate_id, options: p.options.map(({ candidate, ...o }) => o), last_error: p.last_error })),
    ready: ready.slice(0, 1),
    notifications: proposals.filter(p => ['PENDING', 'ERROR'].includes(p.notification_status)).map(p => ({ proposal_id: p.id, kind: p.notification_kind, text: topicNotification(p) })),
    publish_requires_human_approval: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  if (!process.env.EDITORIAL_BRIDGE_SECRET || !safeSecretEqual(extractBearerSecret(req), process.env.EDITORIAL_BRIDGE_SECRET)) return res.status(401).json({ error: 'unauthorized' });
  try { const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); return res.status(200).json({ ok: true, ...await topicResponse(body, topicClient()) }); }
  catch (e) { return res.status(/DB_|UNAVAILABLE|FAILED/.test(e.message) ? 502 : 422).json({ error: e.message }); }
}
