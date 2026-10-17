import { createClient } from '@supabase/supabase-js';
import { chooseTopic, answerInterview } from './editorialTopicApproval.mjs';

export function topicClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('TOPICS_DB_NOT_CONFIGURED');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadProposal(db, id) {
  const r = await db.from('editorial_topic_proposals').select('*').eq('id', id).maybeSingle();
  if (r.error) throw new Error('TOPICS_DB_READ_FAILED');
  if (!r.data) throw new Error('PROPOSAL_NOT_FOUND');
  return r.data;
}

export async function saveNewProposal(db, proposal) {
  const r = await db.from('editorial_topic_proposals').upsert(proposal, { onConflict: 'id', ignoreDuplicates: true });
  if (r.error) throw new Error('TOPICS_DB_WRITE_FAILED');
  return loadProposal(db, proposal.id); // first immutable snapshot wins
}

export async function changeProposal(db, id, action, input) {
  const proposal = await loadProposal(db, id);
  // Webhook redelivery after the answer was saved but before receipt was saved.
  if (action === 'answer' && proposal.interview_answered_at && JSON.stringify(proposal.interview_answers) === JSON.stringify(input.answers)) return proposal;
  const patch = action === 'choose' ? chooseTopic(proposal, input) : answerInterview(proposal, input);
  if (!patch) return proposal;
  const r = await db.from('editorial_topic_proposals').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', proposal.status).select('*').maybeSingle();
  if (r.error) throw new Error('TOPICS_DB_WRITE_FAILED');
  if (!r.data) throw new Error('CHOICE_CHANGED_CONCURRENTLY');
  return r.data;
}

export async function pendingProposals(db) {
  // Includes all dates, not just today's target: late replies must resume.
  const r = await db.from('editorial_topic_proposals').select('*').or('status.neq.QUEUE_CREATED,notification_status.neq.SENT').order('target_date', { ascending: true }).limit(500);
  if (r.error) throw new Error('TOPICS_DB_READ_FAILED');
  if ((r.data || []).length === 500) throw new Error('TOPIC_BACKLOG_LIMIT_REACHED');
  return r.data || [];
}
