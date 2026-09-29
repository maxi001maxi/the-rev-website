import {exchangeCode,verifyOAuthState,discoverBusiness,saveConnection} from '../../../lib/googleBusiness.mjs';

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

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET'){res.statusCode=405;return res.end('GET only');}
  const query=req.query||{};
  if(query.error)return redirect(res,'/admin/site-insights/?gbp=cancelled');
  if(!query.code||!query.state)return redirect(res,'/admin/site-insights/?gbp=invalid');

  let state;
  try{state=verifyOAuthState(query.state);}
  catch{return redirect(res,'/admin/site-insights/?gbp=invalid');}

  try{
    const tokenData=await exchangeCode(query.code);
    let discovery={error:null,verified:false};
    try{discovery=await discoverBusiness(tokenData.access_token);}
    catch(error){discovery={error:classify(error),verified:false};}
    await saveConnection(state.userId,tokenData,discovery);
    return redirect(res,discovery?.locationResource?'/admin/site-insights/?gbp=connected':'/admin/site-insights/?gbp=connected-needs-discovery');
  }catch(error){
    console.error('[google-business/callback]',error?.code||error?.status||'error');
    return redirect(res,'/admin/site-insights/?gbp=error');
  }
}
