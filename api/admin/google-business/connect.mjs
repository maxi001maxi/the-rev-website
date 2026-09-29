import {getAuthedContext,sendError} from '../../../lib/supabaseAdmin.mjs';
import {authorizationUrl} from '../../../lib/googleBusiness.mjs';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendError(res,405,'method_not_allowed','GETのみ利用できます。');}
  const ctx=await getAuthedContext(req);
  if(ctx.error)return sendError(res,ctx.status,ctx.error,ctx.error==='unauthorized'?'ログインが必要です。':'Admin認証が未設定です。');
  const {data:member,error}=await ctx.supabase.from('admin_members').select('active').eq('user_id',ctx.user.id).maybeSingle();
  if(error||!member?.active)return sendError(res,403,'forbidden','Google Business Profileの接続権限がありません。');
  try{return res.status(200).json({authorizationUrl:authorizationUrl(ctx.user.id)});}
  catch(e){
    const suffix=e?.missing?.length?': '+e.missing.join(', '):'';
    return sendError(res,503,'google_business_not_configured','Google Business Profile接続設定が不足しています'+suffix+'。');
  }
}
