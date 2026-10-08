import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  THREADS_OAUTH_SCOPES,
  threadsAuthorizationUrl,
  createThreadsOAuthState,
  verifyThreadsOAuthState,
  exchangeThreadsCode,
  threadsOAuthDiagnostics,
  threadsTokenExchangeRequestSummary,
  probeThreadsAppCredentials,
  debugThreadsAccessToken,
  getThreadsConnectionStatus,
  getActiveThreadsAccessToken
} from '../lib/threadsOAuth.mjs';

const env={
  THREADS_APP_ID:'app123',
  THREADS_APP_SECRET:'secret456',
  THREADS_REDIRECT_URI:'https://therev-lab.com/api/integrations/editorial-status?mode=threads_oauth_callback',
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'service'
};

function response(status,payload){
  return {ok:status>=200&&status<300,status,async text(){return JSON.stringify(payload);}};
}

test('Threads OAuth URL requests only read/discovery scopes',()=>{
  const u=new URL(threadsAuthorizationUrl('00000000-0000-0000-0000-000000000001',env));
  assert.equal(u.origin,'https://www.threads.com');
  assert.equal(u.pathname,'/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'),'app123');
  assert.equal(u.searchParams.get('redirect_uri'),env.THREADS_REDIRECT_URI);
  assert.deepEqual(u.searchParams.get('scope').split(','),THREADS_OAUTH_SCOPES);
  assert.equal(u.searchParams.get('scope').includes('threads_content_publish'),false);
});

test('OAuth state is signed and expires',()=>{
  const state=createThreadsOAuthState('00000000-0000-0000-0000-000000000001',1000,env);
  assert.equal(verifyThreadsOAuthState(state,1001,env).userId,'00000000-0000-0000-0000-000000000001');
  assert.throws(()=>verifyThreadsOAuthState(state,1000+11*60*1000,env),/expired_oauth_state/);
});

test('Code exchange upgrades short token to long-lived token',async()=>{
  const calls=[];
  const fetchImpl=async(url,opts={})=>{
    calls.push({url:String(url),opts});
    if(String(url).includes('/oauth/access_token')){
      assert.equal(new URL(String(url)).origin,'https://graph.threads.com');
      assert.equal(opts.method,'POST');
      assert.equal(opts.headers['content-type'],'application/x-www-form-urlencoded');
      const body=new URLSearchParams(opts.body);
      assert.equal(body.get('client_id'),'app123');
      assert.equal(body.get('redirect_uri'),env.THREADS_REDIRECT_URI);
      assert.equal(body.get('code'),'code123');
      return response(200,{access_token:'short',user_id:'u1'});
    }
    if(String(url).includes('/access_token'))return response(200,{access_token:'long',token_type:'bearer',expires_in:5184000});
    return response(404,{error:{message:'not found'}});
  };
  const out=await exchangeThreadsCode('code123',{env,fetchImpl});
  assert.equal(out.access_token,'long');
  assert.equal(out.user_id,'u1');
  assert.equal(calls.length,2);
});

test('Active token loader uses service-only DB token and never needs env token',async()=>{
  const row={connection_key:'primary',access_token:'dbtoken',expires_at:new Date(Date.now()+20*24*60*60*1000).toISOString()};
  const supabase={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:row,error:null})};}};
  const out=await getActiveThreadsAccessToken({supabase,env:{},now:new Date()});
  assert.equal(out.accessToken,'dbtoken');
  assert.equal(out.source,'DB');
});

test('Threads OAuth secrets never appear in browser-facing source',()=>{
  const api=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  assert.match(api,/threads_oauth_connect/);
  assert.match(api,/threads_oauth_callback/);
  assert.doesNotMatch(api,/access_token\s*:\s*c\?\.access_token/);
  const migration=fs.readFileSync(new URL('../supabase/migrations/20261008113000_social_threads_api_oauth.sql',import.meta.url),'utf8');
  assert.match(migration,/service_role/);
  assert.match(migration,/revoke all .* anon, authenticated/);
});


test('Threads admin UI uses authenticated Direct Token mode and pauses OAuth UI',()=>{
  const page=fs.readFileSync(new URL('../admin/threads/index.html',import.meta.url),'utf8');
  const client=fs.readFileSync(new URL('../admin/js/threads.mjs',import.meta.url),'utf8');
  const api=fs.readFileSync(new URL('../admin/js/admin-api.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  assert.match(page,/DIRECT TOKEN MODE/);
  assert.match(page,/type="password"/);
  assert.match(page,/OAuth callback方式は現在PAUSED/);
  assert.match(client,/AdminApi\.saveThreadsDirectToken/);
  assert.match(client,/AdminApi\.probeThreadsDirectToken/);
  assert.doesNotMatch(client,/getThreadsConnect/);
  assert.match(api,/threads_direct_token_connect/);
  assert.match(api,/threads_direct_token_probe/);
  assert.match(endpoint,/handleThreadsDirectTokenConnect/);
  assert.match(endpoint,/handleThreadsDirectTokenProbe/);
});


test('Production redirect is byte-identical at authorization and exchange',async()=>{
  for(const redirect of ['https://the-rev-website.vercel.app/api/threads/oauth/callback/','https://example.test/callback/?next=a%2Fb&lang=ja']){
    const current={...env,THREADS_REDIRECT_URI:redirect};
    const url=new URL(threadsAuthorizationUrl('admin',current));
    const state=verifyThreadsOAuthState(url.searchParams.get('state'),Date.now(),current);
    const diagnostic=threadsOAuthDiagnostics(state,{env:current,callbackUrl:redirect+'?code=SECRET&state=SECRET'});
    assert.equal(diagnostic.redirect_uri_equal,true);
    assert.equal(diagnostic.app_id_equal,true);
    assert.equal(JSON.stringify(diagnostic).includes('SECRET'),false);
    await exchangeThreadsCode('code',{env:current,authorizationContext:state,fetchImpl:async(url,options)=>{
      if(String(url).includes('/oauth/access_token')){
        assert.deepEqual(Buffer.from(new URLSearchParams(options.body).get('redirect_uri')),Buffer.from(new URL(threadsAuthorizationUrl('admin',current)).searchParams.get('redirect_uri')));
        return response(200,{access_token:'short',user_id:'u'});
      }
      return response(200,{access_token:'long',expires_in:5184000});
    }});
    await assert.rejects(exchangeThreadsCode('code',{env:{...current,THREADS_REDIRECT_URI:redirect+'changed'},authorizationContext:state,fetchImpl:()=>assert.fail('Must reject before sending code')}),/configuration_changed/);
  }
});

test('Status reads metadata only using privileged server path after admin guard',async()=>{
  const supabase={from(){return {select(columns){assert.equal(columns.includes('access_token'),false);return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})};}};
  assert.equal(await getThreadsConnectionStatus({supabase}),null);
  const api=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  assert.match(api,/getThreadsConnectionStatus\(\)/);
  assert.doesNotMatch(api,/getThreadsConnectionStatus\(\{supabase:ctx.supabase/);
});

test('Missing long token cannot silently save a short-lived token',async()=>{
  await assert.rejects(exchangeThreadsCode('code',{env,fetchImpl:async url=>response(200,String(url).includes('/oauth/access_token')?{access_token:'short'}:{})}),/threads_long_token_missing/);
});


test('Wire body matches official form serialization and summary excludes secret/code',async()=>{
  const current={...env,THREADS_REDIRECT_URI:'https://the-rev-website.vercel.app/api/threads/oauth/callback/'};
  await exchangeThreadsCode('wire-code',{env:current,fetchImpl:async(url,options)=>{
    if(new URL(url).pathname==='/oauth/access_token'){
      const wire=new Request(url,options);
      const body=await wire.text();
      const official=new URLSearchParams({client_id:current.THREADS_APP_ID,client_secret:current.THREADS_APP_SECRET,grant_type:'authorization_code',redirect_uri:current.THREADS_REDIRECT_URI,code:'wire-code'}).toString();
      assert.equal(body,official);
      assert.equal(new URL(url).search,'');
      const summary=threadsTokenExchangeRequestSummary(current);
      assert.equal(summary.client_id,current.THREADS_APP_ID);
      assert.equal(summary.redirect_uri,new URLSearchParams(body).get('redirect_uri'));
      assert.equal(summary.parameter_placement,'body');
      assert.equal(JSON.stringify(summary).includes(current.THREADS_APP_SECRET),false);
      assert.equal(JSON.stringify(summary).includes('wire-code'),false);
      return response(200,{access_token:'short'});
    }
    return response(200,{access_token:'long'});
  }});
});

test('App credential probe validates pair without OAuth code or exposing returned token',async()=>{
  const result=await probeThreadsAppCredentials({env,fetchImpl:async(url,options)=>{
    assert.equal(options.method,'GET');
    assert.equal(new URL(url).pathname,'/oauth/access_token');
    assert.equal(new URL(url).searchParams.get('grant_type'),'client_credentials');
    assert.equal(new URL(url).searchParams.get('client_secret'),env.THREADS_APP_SECRET);
    assert.equal(new URL(url).searchParams.has('code'),false);
    return response(200,{access_token:'PRIVATE-APP-TOKEN'});
  }});
  assert.equal(result.credentials_accepted,true);
  assert.equal(JSON.stringify(result).includes('PRIVATE-APP-TOKEN'),false);
  const rejected=await probeThreadsAppCredentials({env,fetchImpl:async()=>response(400,{error:{message:'secret456 PRIVATE-CODE',code:190,fbtrace_id:'trace-test'}})});
  assert.deepEqual(rejected,{credentials_accepted:false,http_status:400,provider_code:190,provider_trace_id:'trace-test'});
  const unavailable=await probeThreadsAppCredentials({env,fetchImpl:async()=>{throw new Error('network contains secret456');}});
  assert.equal(unavailable.credentials_accepted,null);
  assert.equal(JSON.stringify(unavailable).includes('secret456'),false);
});

test('Diagnostics require POST and admin membership, and never perform connection save',()=>{
  const api=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  const handler=api.split('async function handleThreadsOAuthDiagnostics')[1].split('async function handleThreadsOAuthCallback')[0];
  assert.match(handler,/req.method!=='POST'/);
  assert.match(handler,/requireThreadsAdmin\(req,res\)/);
  assert.match(handler,/Cache-Control','no-store/);
  assert.doesNotMatch(handler,/saveThreadsConnection|authorizationUrl|exchangeThreadsCode/);
});


test('Direct Token handler verifies token server-side and never returns access_token',()=>{
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  const section=endpoint.split('async function handleThreadsDirectTokenConnect')[1].split('async function handleThreadsDirectTokenProbe')[0];
  assert.match(section,/requireThreadsAdmin\(req,res\)/);
  assert.match(section,/getThreadsProfile\(accessToken\)/);
  assert.match(section,/saveThreadsConnection/);
  assert.doesNotMatch(section,/json\([^)]*accessToken/);
  assert.doesNotMatch(section,/console\.(log|info|error)\([^\n]*accessToken/);
});


test('Token debugger returns scopes only and never exposes user/app secrets',async()=>{
  const result=await debugThreadsAccessToken('USER-TOKEN-SECRET',{env,fetchImpl:async(url,options)=>{
    const u=new URL(url);
    assert.equal(u.origin,'https://graph.threads.com');
    assert.equal(u.pathname,'/debug_token');
    assert.equal(u.searchParams.get('input_token'),'USER-TOKEN-SECRET');
    assert.equal(u.searchParams.get('access_token'),'app123|secret456');
    assert.equal(options.method,'GET');
    return response(200,{data:{
      is_valid:true,
      app_id:'app123',
      user_id:'u1',
      type:'USER',
      expires_at:2000000000,
      scopes:['threads_basic','threads_read_replies','threads_manage_mentions']
    }});
  }});
  assert.equal(result.is_valid,true);
  assert.equal(result.app_id_matches,true);
  assert.deepEqual(result.scopes,['threads_basic','threads_read_replies','threads_manage_mentions']);
  assert.equal(JSON.stringify(result).includes('USER-TOKEN-SECRET'),false);
  assert.equal(JSON.stringify(result).includes('secret456'),false);
});

test('Direct Token scope diagnostics are admin-only and browser output is secret-free',()=>{
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  const client=fs.readFileSync(new URL('../admin/js/threads.mjs',import.meta.url),'utf8');
  const section=endpoint.split('async function handleThreadsDirectTokenScopes')[1].split('async function handleThreadsDirectTokenProbe')[0];
  assert.match(section,/requireThreadsAdmin\(req,res\)/);
  assert.match(section,/debugThreadsAccessToken/);
  assert.match(section,/actualScopes/);
  assert.match(section,/missingScopes/);
  assert.doesNotMatch(section,/accessToken\s*:/);
  assert.match(client,/Token実権限/);
});
