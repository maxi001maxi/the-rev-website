import {upsertSocialHistory,listSocialHistory} from './socialHistory.mjs';
import {
  prepareSocialCandidates,pollSocialCandidates,chooseSocialCandidate,
  acknowledgeSocialCandidateNotification
} from './socialCandidates.mjs';
import {
  finalizeSocialProduction,recordSocialProductionEvent,linkVerifiedPublication,
  upsertProductionLearning,listProductionLearnings,getProductionLearningContext
} from './socialProductionLearning.mjs';
import {
  prepareDailyStories,listStoryPlans,markStoryCreated,linkVerifiedStoryPublication
} from './socialStories.mjs';

export async function socialBridgeResponse({body={},supabase}){
  switch(String(body.action||'')){
    case 'social_history_upsert':
      return {ok:true,result:await upsertSocialHistory({supabase,posts:body.posts})};
    case 'social_history_list':
      return {ok:true,posts:await listSocialHistory({supabase,days:body.days,limit:body.limit})};
    case 'social_candidates_prepare':
      return {ok:true,...await prepareSocialCandidates({
        supabase,targetDate:body.target_date,phase:body.phase,
        candidates:body.candidates,sourceContext:body.source_context,replaceOpen:body.replace_open===true
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
    case 'social_production_finalize':
      return {ok:true,...await finalizeSocialProduction({
        supabase,targetDate:body.target_date,candidateNo:body.candidate_no,candidateId:body.candidate_id,
        productionPlan:body.production_plan,learningCandidates:body.learning_candidates,source:body.source
      })};
    case 'social_production_event':
      return {ok:true,...await recordSocialProductionEvent({
        supabase,targetDate:body.target_date,candidateNo:body.candidate_no,candidateId:body.candidate_id,
        eventType:body.event_type,payload:body.payload,source:body.source,idempotencyKey:body.idempotency_key
      })};
    case 'social_publication_link':
      return {ok:true,...await linkVerifiedPublication({
        supabase,targetDate:body.target_date,candidateNo:body.candidate_no,candidateId:body.candidate_id,
        platform:body.platform,platformMediaId:body.platform_media_id,source:body.source
      })};
    case 'social_learning_upsert':
      return {ok:true,learning:await upsertProductionLearning({supabase,learning:body.learning})};
    case 'social_learning_list':
      return {ok:true,learnings:await listProductionLearnings({
        supabase,status:body.status,scopes:body.scopes,limit:body.limit
      })};
    case 'social_learning_context':
      return {ok:true,context:await getProductionLearningContext({
        supabase,days:body.days,learningLimit:body.learning_limit
      })};
    case 'social_stories_prepare':
      return {ok:true,...await prepareDailyStories({
        supabase,targetDate:body.target_date,stories:body.stories,primaryTheme:body.primary_theme,
        sourceContext:body.source_context,holdReason:body.hold_reason
      })};
    case 'social_stories_list':
      return {ok:true,plans:await listStoryPlans({
        supabase,days:body.days,limit:body.limit
      })};
    case 'social_story_created':
      return {ok:true,story:await markStoryCreated({
        supabase,targetDate:body.target_date,slotNo:body.slot_no
      })};
    case 'social_story_publication_link':
      return {ok:true,...await linkVerifiedStoryPublication({
        supabase,targetDate:body.target_date,slotNo:body.slot_no,
        platformMediaId:body.platform_media_id,platform:body.platform
      })};
    default:
      throw new Error('SOCIAL_ACTION_INVALID');
  }
}
