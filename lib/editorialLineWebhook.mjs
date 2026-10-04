// LINE signs the unchanged HTTP bytes. Never authenticate parsed/re-encoded JSON.
import { verifyLineSignature, parseTopicReply } from './editorialTopicApproval.mjs';
import { topicClient, loadProposal, changeProposal } from './editorialTopicStore.mjs';

export async function receiveLineEvents(events, db, ownerId) {
  if (!Array.isArray(events) || events.length > 100) throw new Error('INVALID_EVENTS');
  for (const event of events) {
    if (event.source?.type !== 'user' || event.source.userId !== ownerId || event.type !== 'message' || event.message?.type !== 'text') continue;
    const reply = parseTopicReply(event.message.text);
    if (!reply || !event.webhookEventId) continue;
    const receipt = await db.from('editorial_line_receipts').select('event_id').eq('event_id', event.webhookEventId).maybeSingle();
    if (receipt.error) throw new Error('RECEIPT_READ_FAILED');
    if (receipt.data) continue;
    try {
      const p = await loadProposal(db, reply.proposal_id);
      await changeProposal(db, p.id, reply.action, { candidateId: p.options.find(o => o.number === reply.number)?.candidate_id, answers: reply.answers, source: 'LINE', actor: ownerId });
    } catch (e) {
      // Invalid or conflicting human replies never generate a queue row.
      if (!['PROPOSAL_NOT_FOUND', 'INVALID_CANDIDATE', 'CHOICE_ALREADY_LOCKED', 'CHOICE_CHANGED_CONCURRENTLY', 'NOT_WAITING_FOR_INTERVIEW', 'ALL_INTERVIEW_ANSWERS_REQUIRED', 'INTERVIEW_EVIDENCE_MISSING'].includes(e.message)) throw e;
    }
    const saved = await db.from('editorial_line_receipts').upsert({ event_id: event.webhookEventId }, { onConflict: 'event_id', ignoreDuplicates: true });
    if (saved.error) throw new Error('RECEIPT_WRITE_FAILED');
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const secret = process.env.THE_REV_LINE_CHANNEL_SECRET, owner = process.env.THE_REV_LINE_USER_ID;
  if (!secret || !owner) return res.status(503).json({ error: 'line_receiver_not_configured' });
  try {
    const chunks = []; let size = 0;
    for await (const part of req) { const b = Buffer.from(part); size += b.length; if (size > 1024 * 1024) return res.status(413).end(); chunks.push(b); }
    const raw = Buffer.concat(chunks);
    if (!verifyLineSignature(raw, req.headers['x-line-signature'], secret)) return res.status(401).json({ error: 'invalid_signature' });
    const body = JSON.parse(raw.toString('utf8'));
    await receiveLineEvents(body.events, topicClient(), owner);
    return res.status(200).json({ ok: true });
  } catch { return res.status(500).json({ error: 'line_event_processing_failed' }); }
}
