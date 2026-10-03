import {getAuthedContext,sendError} from '../../lib/supabaseAdmin.mjs';
import {verifiedPreviewAdminUserId} from '../../lib/previewAdminBypass.mjs';
import {
  authorizationUrl,
  exchangeCode,
  verifyOAuthState,
  discoverBusiness,
  saveConnection,
  getConnection
} from '../../lib/googleBusiness.mjs';

function redirect(res,path){
  res.statusCode=302;
  res.setHeader('Location',path);
  res.end();
}
function classify(error){
  const message=String(error?.data?.error?.message||error?.message||'').toLowerCase();
  if(message.includes('has not been used')||message.includes('disabled'))return 'required_api_disabled';
  if(message.includes('quota')||error?.status===429)return 'quota_or_access_required';
  if(message.includes('permission')||error?.status===403)return 'permission_denied';
  return error?.code||'discovery_failed';
}
async function requireAdmin(req,res){
  const ctx=await getAuthedContext(req,{allowPreviewBypass:true});
  if(ctx.error){
    sendError(res,ctx.status,ctx.error,ctx.error==='unauthorized'?'ログインが必要です。':'Admin認証が未設定です。');
    return null;
  }
  if(ctx.previewBypass){
    const userId=await verifiedPreviewAdminUserId();
    if(!userId){
      sendError(res,503,'preview_admin_identity_not_configured','Preview用の既存Adminを確認できませんでした。');
      return null;
    }
    return {...ctx,user:{id:userId}};
  }
  const membership=await ctx.supabase.from('admin_members').select('active').eq('user_id',ctx.user.id).maybeSingle();
  if(membership.error||!membership.data?.active){
    sendError(res,403,'forbidden','Google Business Profileの操作権限がありません。');
    return null;
  }
  return ctx;
}
async function handleConnect(req,res){
  const ctx=await requireAdmin(req,res);
  if(!ctx)return;
  try{return res.status(200).json({authorizationUrl:authorizationUrl(ctx.user.id)});}
  catch(e){
    const suffix=e?.missing?.length?': '+e.missing.join(', '):'';
    return sendError(res,503,'google_business_not_configured','Google Business Profile接続設定が不足しています'+suffix+'。');
  }
}
async function handleStatus(req,res){
  const ctx=await requireAdmin(req,res);
  if(!ctx)return;
  try{
    const c=await getConnection(ctx.user.id);
    return res.status(200).json({
      connected:Boolean(c),
      locationResolved:Boolean(c?.location_resource),
      accountName:c?.account_name||null,
      locationTitle:c?.location_title||null,
      locationResource:c?.location_resource||null,
      connectedAt:c?.connected_at||null,
      lastVerifiedAt:c?.last_verified_at||null,
      lastError:c?.last_error||null
    });
  }catch{
    return sendError(res,503,'google_business_status_unavailable','Google Business Profileの接続状態を確認できませんでした。');
  }
}
async function handleCallback(req,res){
  const query=req.query||{};
  if(query.error)return redirect(res,'/admin/google-business/?status=cancelled');
  if(!query.code||!query.state)return redirect(res,'/admin/google-business/?status=invalid');
  let state;
  try{state=verifyOAuthState(query.state);}
  catch{return redirect(res,'/admin/google-business/?status=invalid');}
  try{
    const tokenData=await exchangeCode(query.code);
    let discovery={error:null,verified:false};
    try{discovery=await discoverBusiness(tokenData.access_token);}
    catch(error){discovery={error:classify(error),verified:false};}
    await saveConnection(state.userId,tokenData,discovery);
    return redirect(res,discovery?.locationResource?'/admin/google-business/?status=connected':'/admin/google-business/?status=connected-needs-discovery');
  }catch(error){
    console.error('[google-business/callback]',error?.code||error?.status||'error');
    return redirect(res,'/admin/google-business/?status=error');
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendError(res,405,'method_not_allowed','GETのみ利用できます。');}
  const action=String(req.query?.action||'');
  if(action==='callback')return handleCallback(req,res);
  if(action==='connect')return handleConnect(req,res);
  if(action==='status')return handleStatus(req,res);
  return sendError(res,400,'invalid_action','Google Business Profileの操作が不正です。');
}
