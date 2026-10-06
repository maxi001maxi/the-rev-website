import { collectGithubMaterialChanges } from '../../lib/companyTimelineGithubCollector.mjs';

export const config={maxDuration:60};

function authorized(req){
  const secret=String(process.env.CRON_SECRET||'');
  const auth=String(req.headers?.authorization||'');
  return Boolean(secret)&&auth===`Bearer ${secret}`;
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'method_not_allowed'});
  }
  if(!authorized(req)) return res.status(401).json({error:'unauthorized'});
  try{
    const result=await collectGithubMaterialChanges();
    res.setHeader('Cache-Control','no-store');
    return res.status(result.ok?200:502).json(result);
  }catch(e){
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
