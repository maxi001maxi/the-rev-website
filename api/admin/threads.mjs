import {getAuthedContext,sendError} from '../../lib/supabaseAdmin.mjs';
import {
  threadsAuthorizationUrl,
  verifyThreadsOAuthState,
  exchangeThreadsCode,
  getThreadsProfile,
  saveThreadsConnection,
  getThreadsConnection
} from '../../lib/threadsOAuth.mjs';

function redirect(res,path){
  res.statusCode=302;
  res.setHeader('Location',path);
  res.end();
}

async function requireAdmin(req,res){
  const ctx=await getAuthedContext(req);
  if(ctx.error){
    sendError(res,ctx.status,ctx.error,ctx.error==='unauthorized'?'ログインが必要です。':'Admin認証が未設定です。');
    return null;
  }
  const membership=await ctx.supabase.from('admin_members').select('active').eq('user_id',ctx.user.id).maybeSingle();
  if(membership.error||!membership.data?.active){
    sendError(res,403,'forbidden','Threads APIの操作権限がありません。');
    return null;
  }
  return ctx;
}

async function handleConnect(req,res){
  const ctx=await requireAdmin(req,res); if(!ctx)return;
  try{return res.status(200).json({authorizationUrl:threadsAuthorizationUrl(ctx.user.id)});}
  catch(error){
    const suffix=error?.missing?.length?': '+error.missing.join(', '):'';
    return sendError(res,503,'threads_not_configured','Threads接続設定が不足しています'+suffix+'。');
  }
}

async function handleStatus(req,res){
  const ctx=await requireAdmin(req,res); if(!ctx)return;
  try{
    const c=await getThreadsConnection({supabase:ctx.supabase});
    return res.status(200).json({
      connected:Boolean(c?.access_token),
      username:c?.username||null,
      threadsUserId:c?.threads_user_id||null,
      scopes:c?.scopes||[],
      expiresAt:c?.expires_at||null,
      connectedAt:c?.connected_at||null,
      lastVerifiedAt:c?.last_verified_at||null,
      lastError:c?.last_error||null
    });
  }catch{
    return sendError(res,503,'threads_status_unavailable','Threads接続状態を確認できませんでした。');
  }
}

async function handleCallback(req,res){
  const q=req.query||{};
  if(q.error)return redirect(res,'/admin/?threads=status-cancelled');
  if(!q.code||!q.state)return redirect(res,'/admin/?threads=status-invalid');

  let state;
  try{state=verifyThreadsOAuthState(q.state);}
  catch{return redirect(res,'/admin/?threads=status-invalid');}

  try{
    const tokenData=await exchangeThreadsCode(q.code);
    const profile=await getThreadsProfile(tokenData.access_token);
    await saveThreadsConnection({userId:state.userId,tokenData,profile});
    return redirect(res,'/admin/?threads=status-connected');
  }catch(error){
    console.error('[threads-oauth/callback]',JSON.stringify({code:error?.code||null,status:error?.status||null,message:String(error?.message||'').slice(0,180)}));
    return redirect(res,'/admin/?threads=status-error');
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendError(res,405,'method_not_allowed','GETのみ利用できます。');}
  const q=req.query||{};
  const inferredCallback=Boolean(q.code||q.error)&&Boolean(q.state);
  const action=String(q.action||(inferredCallback?'callback':''));
  if(action==='connect')return handleConnect(req,res);
  if(action==='status')return handleStatus(req,res);
  if(action==='callback')return handleCallback(req,res);
  return sendError(res,400,'invalid_action','Threads APIの操作が不正です。');
}
