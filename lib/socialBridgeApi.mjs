import {upsertSocialHistory,listSocialHistory} from './socialHistory.mjs';
import {
  prepareSocialCandidates,pollSocialCandidates,chooseSocialCandidate,
  acknowledgeSocialCandidateNotification
} from './socialCandidates.mjs';

export async function socialBridgeResponse({body={},supabase}){
  switch(String(body.action||'')){
    case 'social_history_upsert':
      return {ok:true,result:await upsertSocialHistory({supabase,posts:body.posts})};
    case 'social_history_list':
      return {ok:true,posts:await listSocialHistory({supabase,days:body.days,limit:body.limit})};
    case 'social_candidates_prepare':
      return {ok:true,...await prepareSocialCandidates({
        supabase,targetDate:body.target_date,phase:body.phase,
        candidates:body.candidates,sourceContext:body.source_context
      })};
    case 'social_candidates_poll':
      return {ok:true,...await pollSocialCandidates({supabase,targetDate:body.target_date})};
    case 'social_candidates_choose':
      return {ok:true,...await chooseSocialCandidate({
        supabase,targetDate:body.target_date,candidateNo:body.candidate_no
      })};
    case 'social_candidates_notification_ack':
      return {ok:true,batch:await acknowledgeSocialCandidateNotification({
        supabase,targetDate:body.target_date,status:body.status
      })};
    default:
      throw new Error('SOCIAL_ACTION_INVALID');
  }
}
