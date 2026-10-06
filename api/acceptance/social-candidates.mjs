import {createClient} from '@supabase/supabase-js';
import {socialBridgeResponse} from '../../lib/socialBridgeApi.mjs';

export const config={maxDuration:300};

export default async function handler(req,res){
  if(process.env.VERCEL_ENV!=='preview'){
    return res.status(404).json({error:'not_found'});
  }
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'method_not_allowed'});
  }
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){
    return res.status(503).json({error:'supabase_not_configured'});
  }
  if(!process.env.OPENAI_API_KEY){
    return res.status(503).json({error:'openai_not_configured'});
  }
  const supabase=createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false}}
  );
  try{
    const payload=await socialBridgeResponse({
      body:{action:'social_candidates_generate',target_date:String(req.query?.target_date||'')},
      supabase,
      env:process.env
    });
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({acceptance:true,...payload});
  }catch(e){
    return res.status(500).json({error:String(e?.message||e)});
  }
}
