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


test('Threads admin UI exposes authenticated connect flow',()=>{
  const page=fs.readFileSync(new URL('../admin/threads/index.html',import.meta.url),'utf8');
  const client=fs.readFileSync(new URL('../admin/js/threads.mjs',import.meta.url),'utf8');
  const api=fs.readFileSync(new URL('../admin/js/admin-api.mjs',import.meta.url),'utf8');
  const endpoint=fs.readFileSync(new URL('../api/integrations/editorial-status.mjs',import.meta.url),'utf8');
  assert.match(page,/THE REV\. Threadsを接続/);
  assert.match(client,/AdminApi\.getThreadsConnect/);
  assert.match(client,/target\.hostname!=='www\.threads\.com'/);
  assert.match(api,/threads_oauth_status/);
  assert.match(api,/threads_oauth_connect/);
  assert.match(endpoint,/\/admin\/threads\/\?status=connected/);
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
