import {upsertSocialHistory,listSocialHistory} from './socialHistory.mjs';
import {
  prepareSocialCandidates,pollSocialCandidates,chooseSocialCandidate,
  acknowledgeSocialCandidateNotification
} from './socialCandidates.mjs';
import {generateSocialCandidates} from './socialCandidateGenerator.mjs';

async function loadSocialCandidateContext(supabase){
  const history=await listSocialHistory({supabase,days:120,limit:120});

  const blogs=await supabase
    .from('admin_article_drafts')
    .select('title,category,publish_status,updated_at')
    .order('updated_at',{ascending:false})
    .limit(40);
  if(blogs.error) throw new Error('SOCIAL_BLOG_CONTEXT_READ_FAILED');

  const memory=await supabase
    .from('social_ai_runs')
    .select('run_date,business_job,primary_theme,main_claim,reel_decision')
    .eq('run_mode','PRODUCTION')
    .order('run_date',{ascending:false})
    .limit(10);
  if(memory.error) throw new Error('SOCIAL_MEMORY_CONTEXT_READ_FAILED');

  return {
    social_history:history,
    blog_history:blogs.data||[],
    social_memory:memory.data||[]
  };
}

export async function socialBridgeResponse({body={},supabase,env=process.env}){
  switch(String(body.action||'')){
    case 'social_history_upsert':
      return {ok:true,result:await upsertSocialHistory({supabase,posts:body.posts})};
    case 'social_history_list':
      return {ok:true,posts:await listSocialHistory({supabase,days:body.days,limit:body.limit})};
    case 'social_candidates_generate': {
      const context=await loadSocialCandidateContext(supabase);
      const generated=await generateSocialCandidates({
        context,
        apiKey:env.OPENAI_API_KEY,
        gatewayToken:env.AI_GATEWAY_API_KEY||env.VERCEL_OIDC_TOKEN,
        model:env.SOCIAL_CANDIDATE_MODEL||''
      });
      return {
        ok:true,
        generated_at:new Date().toISOString(),
        generation_path:'PRODUCTION_SERVER_GENERATOR',
        context_counts:{
          social_history:context.social_history.length,
          blog_history:context.blog_history.length,
          social_memory:context.social_memory.length
        },
        ...generated
      };
    }
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
