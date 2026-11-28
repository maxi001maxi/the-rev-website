import { loadProposal, changeProposal } from './editorialTopicStore.mjs';

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

export async function processPendingGptOperatorRequests(db, { limit = 10 } = {}) {
  const pending = await db
    .from('editorial_gpt_operator_requests')
    .select('*')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 10, 50)));

  if (pending.error) throw new Error('GPT_OPERATOR_INBOX_READ_FAILED');

  const results = [];
  for (const item of pending.data || []) {
    const claimed = await db
      .from('editorial_gpt_operator_requests')
      .update({ status: 'PROCESSING', updated_at: new Date().toISOString(), error: null })
      .eq('id', item.id)
      .eq('status', 'PENDING')
      .select('*')
      .maybeSingle();

    if (claimed.error) throw new Error('GPT_OPERATOR_INBOX_CLAIM_FAILED');
    if (!claimed.data) continue;

    try {
      const proposal = await loadProposal(db, item.proposal_id);
      let updated;

      if (item.action === 'choose') {
        const option = proposal.options.find((entry) => Number(entry.number) === Number(item.number));
        if (!option) throw new Error('INVALID_CANDIDATE');
        updated = await changeProposal(db, proposal.id, 'choose', {
          candidateId: option.candidate_id,
          source: 'GPT',
          actor: 'authenticated-gpt-operator'
        });
      } else if (item.action === 'answer') {
        const answers = Array.isArray(item.answers) ? item.answers : null;
        updated = await changeProposal(db, proposal.id, 'answer', {
          answers,
          source: 'GPT',
          actor: 'authenticated-gpt-operator'
        });
      } else {
        throw new Error('INVALID_GPT_OPERATOR_ACTION');
      }

      const finished = await db
        .from('editorial_gpt_operator_requests')
        .update({
          status: 'APPLIED',
          resulting_status: updated.status,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error: null
        })
        .eq('id', item.id)
        .eq('status', 'PROCESSING')
        .select('*')
        .maybeSingle();

      if (finished.error || !finished.data) throw new Error('GPT_OPERATOR_INBOX_ACK_FAILED');
      results.push({
        request_key: item.request_key,
        proposal_id: item.proposal_id,
        action: item.action,
        status: 'APPLIED',
        resulting_status: updated.status
      });
    } catch (error) {
      const message = clean(error?.message || error || 'GPT_OPERATOR_REQUEST_FAILED', 500);
      const rejected = await db
        .from('editorial_gpt_operator_requests')
        .update({
          status: 'REJECTED',
          error: message,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id)
        .eq('status', 'PROCESSING');

      if (rejected.error) throw new Error('GPT_OPERATOR_INBOX_REJECT_ACK_FAILED');
      results.push({
        request_key: item.request_key,
        proposal_id: item.proposal_id,
        action: item.action,
        status: 'REJECTED',
        error: message
      });
    }
  }

  return results;
}
