import { createClient } from '@supabase/supabase-js';

const GITHUB_API='https://api.github.com';
const REPOS=['maxi001maxi/the-rev-website'];
const SOURCE_ID='github-material-changes';

function ghHeaders(token){
  return {
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'the-rev-company-timeline',
    ...(token?{Authorization:`Bearer ${token}`}:{})
  };
}

async function gh(path,token){
  const r=await fetch(`${GITHUB_API}${path}`,{headers:ghHeaders(token)});
  if(!r.ok){
    const e=new Error(`GITHUB_${r.status}`);
    e.status=r.status;
    throw e;
  }
  return r.json();
}

export function classifyMaterialChange({repo,message='',files=[]}){
  const paths=files.map(f=>String(f.filename||''));
  const generated=/generate editorial hybrid image assets|mark editorial hybrid assets|queue .*image/i.test(message);
  const articlePublish=/^publish blog:/i.test(message);
  const imageJobOnly=paths.length>0&&paths.every(p=>
    /^editorial\/hybrid-image-jobs\//.test(p)||
    /^assets\/images\/blog\//.test(p)
  );
  if(generated||articlePublish||imageJobOnly) {
    return {material:false,reason:'covered_elsewhere_or_generated',score:0};
  }

  let score=0;
  const strong=/publish|release|launch|complete|production|connect|integration|metricool|site insights|company os|social director/i.test(message);
  const operational=/trigger|watchdog|supervisor|self-heal|reconcile|topic approval|line notification|scheduler|cron/i.test(message);
  if(strong) score+=5;
  if(operational) score+=2;

  const publicSite=paths.some(p=>/^(index|access|trainer|service|price|about|contact)\.html$/.test(p));
  const analytics=paths.some(p=>/^(api|lib)\/.*(analytics|insight|googleBusiness|ga4|gsc)/i.test(p));
  const automation=paths.some(p=>/^\.github\/workflows\//.test(p)||/^scripts\//.test(p)||/editorial.*(gate|creator|supervisor|operator)/i.test(p));
  const socialDirector=paths.some(p=>/SocialDirector|socialBridge|social.*director/i.test(p));
  const companyOs=repo.endsWith('/the-rev-ops')&&paths.some(p=>/^docs\/(company-os|social-ai)\//.test(p));

  if(publicSite) score+=5;
  if(analytics) score+=5;
  if(automation) score+=2;
  if(socialDirector) score+=4;
  if(companyOs&&strong) score+=5;

  const onlyTestsDocs=paths.length>0&&paths.every(p=>/^(scripts\/test|docs\/|.*\.md$|\.github\/qa)/.test(p));
  if(onlyTestsDocs&&!companyOs) score-=4;
  if(/^(test|docs|chore|ci|style|refactor)(\(|:)/i.test(message)) score-=3;

  if(score<7) return {material:false,reason:'below_threshold',score};

  let eventType='AUTOMATION_CHANGE';
  let domain='automation';
  if(publicSite){eventType='WEBSITE_CHANGE';domain='website';}
  else if(analytics){eventType='MILESTONE';domain='website_analytics';}
  else if(companyOs){eventType='MILESTONE';domain='company_os';}
  else if(socialDirector&&strong){eventType='MILESTONE';domain='social';}
  else if(/release|complete|launch/i.test(message)){eventType='MILESTONE';domain=repo.endsWith('/the-rev-ops')?'company_os':'website';}

  return {material:true,eventType,domain,score};
}

function conciseTitle(message){
  return String(message||'').split('\n')[0].trim().slice(0,180)||'GitHub material change';
}

async function listNewCommits(repo,cursor,token){
  const commits=await gh(`/repos/${repo}/commits?sha=main&per_page=30`,token);
  const out=[];
  for(const c of commits){
    if(cursor&&c.sha===cursor) break;
    out.push(c);
  }
  return out.reverse();
}

async function timelineClient(env){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}

async function writeMaterialEvent({supabase,repo,sha,message,occurredAt,files,url,classification,createdBy}){
  const refs=[url].filter(Boolean);
  const {error}=await supabase.rpc('company_os_record_timeline_event',{
    p_occurred_at:occurredAt||new Date().toISOString(),
    p_event_type:classification.eventType,
    p_domain:classification.domain,
    p_title:`GitHub: ${conciseTitle(message)}`,
    p_summary:null,
    p_source_system:'github',
    p_source_id:repo,
    p_source_ref:sha,
    p_dedupe_key:`github:${repo}:${sha}`,
    p_verification_status:'SYSTEM_VERIFIED',
    p_sensitivity:'INTERNAL',
    p_impact_areas:[classification.domain,'company_history'],
    p_metrics:{repository:repo,commit_sha:sha,changed_files:files.length},
    p_related_refs:refs,
    p_tags:['github','material-change'],
    p_allowed_context_profiles:['COMPANY_OVERVIEW_SAFE','COMPANY_BUILDER_PRIVATE','MANAGEMENT_PRIVATE','SOCIAL_PUBLIC_SAFE','EDITORIAL_PUBLIC_SAFE','WEBSITE_ANALYTICS','RESEARCH_SAFE'],
    p_metadata:{classifier_version:'github-material-website-v1.1',score:classification.score,files:files.slice(0,20).map(f=>f.filename)},
    p_created_by:createdBy
  });
  if(error) throw new Error('TIMELINE_EVENT_WRITE_FAILED');
}

export async function collectGithubMaterialChanges(env=process.env){
  const supabase=await timelineClient(env);
  const {data:source,error:sourceError}=await supabase.from('company_os_timeline_sources').select('*').eq('source_id',SOURCE_ID).maybeSingle();
  if(sourceError) throw new Error('TIMELINE_SOURCE_READ_FAILED');

  let cursor={};
  try{cursor=source?.cursor?JSON.parse(source.cursor):{};}catch{cursor={};}

  const results={};
  let inserted=0;
  let latestEventAt=source?.last_event_at||null;
  for(const repo of REPOS){
    try{
      const commits=await listNewCommits(repo,cursor[repo]||null,env.GITHUB_TOKEN||'');
      for(const c of commits){
        const detail=await gh(`/repos/${repo}/commits/${c.sha}`,env.GITHUB_TOKEN||'');
        const classification=classifyMaterialChange({repo,message:c.commit?.message||'',files:detail.files||[]});
        if(!classification.material) continue;

        const eventAt=c.commit?.committer?.date||c.commit?.author?.date||new Date().toISOString();
        await writeMaterialEvent({
          supabase,repo,sha:c.sha,message:c.commit?.message||'',
          occurredAt:eventAt,
          files:detail.files||[],url:c.html_url,classification,
          createdBy:'GITHUB_MATERIAL_COLLECTOR'
        });
        if(!latestEventAt || new Date(eventAt)>new Date(latestEventAt)) latestEventAt=eventAt;
        inserted++;
      }
      if(commits.length) cursor[repo]=commits[commits.length-1].sha;
      results[repo]={status:'PASS',checked:commits.length};
    }catch(e){
      results[repo]={status:'ERROR',error:String(e?.message||e)};
    }
  }

  const statuses=Object.values(results).map(x=>x.status);
  const status=statuses.every(x=>x==='PASS')?'ACTIVE':statuses.some(x=>x==='PASS')?'STALE':'ERROR';
  await supabase.from('company_os_timeline_sources').update({
    status,
    cursor:JSON.stringify(cursor),
    last_attempt_at:new Date().toISOString(),
    last_success_at:statuses.some(x=>x==='PASS')?new Date().toISOString():source?.last_success_at,
    last_event_at:latestEventAt,
    last_error:status==='ACTIVE'?null:JSON.stringify(results),
    metadata:{
      ...(source?.metadata||{}),
      auto_capture:'LIVE',
      collector_status:'LIVE',
      classifier_version:'github-material-v1.2',
      website_classifier_version:'github-material-website-v1.1',
      website_delivery:'VERCEL_CRON',
      last_results:results
    },
    updated_at:new Date().toISOString()
  }).eq('source_id',SOURCE_ID);

  return {ok:status!=='ERROR',status,inserted,results,cursor};
}
