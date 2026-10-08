import {createClient} from '@supabase/supabase-js';
import {getActiveThreadsAccessToken} from '../../lib/threadsOAuth.mjs';
import {getThreadsConversationContext} from '../../lib/socialThreadsConversationSource.mjs';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({ok:false,error:'not_found'});
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const supabase=createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false}}
  );
  try{
    const tokenState=await getActiveThreadsAccessToken({supabase,env:process.env});
    if(!tokenState?.accessToken)return res.status(409).json({ok:false,error:'threads_not_connected'});
    const context=await getThreadsConversationContext({
      env:process.env,
      accessToken:tokenState.accessToken,
      queryTerms:['奈良','新大宮','パーソナルジム'],
      maxOwnPosts:10,
      maxRepliesPerPost:20
    });
    const clip=x=>({
      source_kind:x.source_kind||null,id:x.id||null,username:x.username||null,
      text:String(x.text||'').slice(0,500),timestamp:x.timestamp||null,
      permalink:x.permalink||null,parent_post_id:x.parent_post_id||null,
      query:x.query||null
    });
    return res.status(200).json({
      ok:true,
      token_source:tokenState.source,
      conversation_source_status:context.conversation_source_status,
      retrieved_at:context.retrieved_at,
      profile:context.profile?{id:context.profile.id,username:context.profile.username}:null,
      capabilities:context.capabilities,
      own_posts:(context.own_posts||[]).map(clip),
      own_replies:(context.own_replies||[]).map(clip),
      mentions:(context.mentions||[]).map(clip),
      keyword_results:(context.keyword_results||[]).slice(0,30).map(clip),
      errors:(context.errors||[]).map(e=>({capability:e.capability||null,code:e.code||null,status:e.status||null,message:e.message||null,query:e.query||null}))
    });
  }catch(error){
    return res.status(502).json({ok:false,error:String(error?.code||error?.message||'threads_probe_failed').slice(0,240)});
  }
}
