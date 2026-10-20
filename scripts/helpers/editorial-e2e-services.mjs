// Network-boundary doubles only. Real Supabase JS, route handlers, topic
// state machine, job planner, image gates and canonical Preflight still run.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export function editorialTestServices() {
  const tables={admin_article_drafts:[],editorial_topic_proposals:[],editorial_gpt_operator_requests:[],admin_members:[{user_id:'test-owner',active:true,can_publish:true}]};
  const files=new Map(), live=new Map(), calls=[];
  let fault=null;
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  const load=p=>files.get(p) ?? (p==='editorial/automated-image-sources.json' || p.startsWith('assets/') ? (fs.existsSync(p)?fs.readFileSync(p):null) : null);
  const fetch=async (input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url), method=options.method || 'GET';
    calls.push({host:url.hostname,path:url.pathname,method});
    if(fault?.(url,method,options)) return json({message:'injected service failure'},503);
    if(url.hostname==='editorial-test.invalid') {
      if(url.pathname==='/auth/v1/user') return json({id:'test-owner',email:'synthetic@example.invalid'});
      const table=url.pathname.split('/').at(-1);
      if(!tables[table]) throw Error('UNEXPECTED_TABLE '+table);
      const accept=new Headers(options.headers).get('accept') || '';
      const single=accept.includes('vnd.pgrst.object');
      const filters=[...url.searchParams].filter(([k])=>!['select','order','limit','or','on_conflict'].includes(k));
      let rows=tables[table].filter(r=>filters.every(([k,v])=>v.startsWith('eq.')?String(r[k])===v.slice(3):v.startsWith('neq.')?String(r[k])!==v.slice(4):true));
      if(method==='POST') {
        const patches=JSON.parse(options.body), items=Array.isArray(patches)?patches:[patches]; rows=[];
        for(const p of items){const key=url.searchParams.get('on_conflict') || 'id';let existing=tables[table].find(r=>p[key] && r[key]===p[key]);if(!existing){existing={id:p.id || 'test-draft',publish_status:'NOT_PUBLISHED',...p};tables[table].push(existing);}rows.push(existing);}
      }
      if(method==='PATCH'){const patch=JSON.parse(options.body);rows.forEach(r=>Object.assign(r,patch));}
      if(single && rows.length>1)return json({code:'PGRST116',message:'multiple rows'},406);
      return json(single ? rows[0] || null : rows);
    }
    if(url.hostname==='api.github.com') {
      if(!url.pathname.includes('/contents/')) return json(url.pathname.includes('/branches/')?{name:'main'}:{default_branch:'main'});
      const p=decodeURIComponent(url.pathname.split('/contents/')[1]);
      if(method==='PUT') {const body=JSON.parse(options.body);files.set(p,Buffer.from(body.content,'base64'));return json({content:{sha:'synthetic-blob'},commit:{sha:'synthetic-commit'}},201);}
      if(['editorial/image-qa','editorial/hybrid-image-jobs','content/blog'].includes(p))return json([...files.keys()].filter(k=>k.startsWith(p+'/')).map(k=>({path:k,name:k.split('/').at(-1),type:'file'})));
      const bytes=load(p);if(!bytes)return json({message:'Not Found'},404);
      return json({path:p,size:bytes.length,sha:createHash('sha1').update(bytes).digest('hex'),encoding:'base64',content:bytes.toString('base64')});
    }
    if(url.hostname==='editorial-live.invalid') {const bytes=live.get(url.pathname);return bytes?new Response(bytes):new Response('',{status:404});}
    throw Error('UNMOCKED_NETWORK '+url.href);
  };
  return {tables,files,live,calls,fetch,setFault:f=>{fault=f;},
    install(){this.originalFetch=globalThis.fetch;globalThis.fetch=fetch;Object.assign(process.env,{SUPABASE_URL:'https://editorial-test.invalid',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',ADMIN_PUBLISHER_USER_ID:'test-owner',EDITORIAL_BRIDGE_SECRET:'synthetic-secret',GITHUB_TOKEN:'synthetic-github',GITHUB_REPO:'test/editorial',GITHUB_BRANCH:'main',PRODUCTION_URL:'https://editorial-live.invalid'});},
    restore(){globalThis.fetch=this.originalFetch;}};
}

export async function invokeEditorialRoute(handler,{method='GET',body,query={},admin=false}={}) {
  const req={method,body,query,headers:{authorization:`Bearer ${admin?'synthetic-user':'synthetic-secret'}`,host:'editorial-test.invalid'}};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(data){this.data=data;return this;}};
  await handler(req,res);return res;
}
