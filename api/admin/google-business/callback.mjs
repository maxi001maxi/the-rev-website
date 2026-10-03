import googleBusinessHandler from '../google-business.mjs';

async function diagnostic(req,res){
  const clientId=String(process.env.GBP_GOOGLE_CLIENT_ID||'').trim();
  const rawSecret=String(process.env.GBP_GOOGLE_CLIENT_SECRET||'');
  const secret=rawSecret.trim();
  const redirectUri=String(process.env.GBP_GOOGLE_REDIRECT_URI||'').trim();
  const body=new URLSearchParams({
    client_id:clientId,
    client_secret:secret,
    code:'the-rev-production-oauth-diagnostic-invalid-code',
    grant_type:'authorization_code',
    redirect_uri:redirectUri
  });
  let probe={status:null,error:null,description:null};
  try{
    const response=await fetch('https://oauth2.googleapis.com/token',{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body
    });
    const data=await response.json().catch(()=>({}));
    probe={
      status:response.status,
      error:typeof data?.error==='string'?data.error:null,
      description:typeof data?.error_description==='string'?data.error_description:null
    };
  }catch(error){
    probe={status:null,error:'network_error',description:String(error?.message||'unknown').slice(0,200)};
  }
  return res.status(200).json({
    clientId,
    redirectUri,
    secretPresent:Boolean(secret),
    secretLength:secret.length,
    secretHasOuterQuote:/^['\"]|['\"]$/.test(secret),
    secretContainsWhitespace:/\s/.test(secret),
    probe
  });
}

// Exact OAuth redirect URI endpoint. Keep callback processing in the consolidated
// Google Business handler so token exchange and signed-state validation have one source of truth.
export default async function handler(req,res){
  if(String(req.query?.diag||'')==='oauth')return diagnostic(req,res);
  req.query={...(req.query||{}),action:'callback'};
  return googleBusinessHandler(req,res);
}
