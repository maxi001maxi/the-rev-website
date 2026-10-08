import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  THREADS_OAUTH_SCOPES,
  threadsAuthorizationUrl,
  createThreadsOAuthState,
  verifyThreadsOAuthState,
  exchangeThreadsCode,
  getActiveThreadsAccessToken
} from '../lib/threadsOAuth.mjs';

const env={
  THREADS_APP_ID:'app123',
  THREADS_APP_SECRET:'secret456',
  THREADS_REDIRECT_URI:'https://therev-lab.com/api/admin/threads/callback',
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'service'
};

function response(status,payload){
  return {ok:status>=200&&status<300,status,async text(){return JSON.stringify(payload);}};
}

test('Threads OAuth URL requests only read/discovery scopes',()=>{
  const u=new URL(threadsAuthorizationUrl('00000000-0000-0000-0000-000000000001',env));
  assert.equal(u.origin,'https://threads.net');
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
    calls.push(String(url));
    if(String(url).includes('/oauth/access_token'))return response(200,{access_token:'short',user_id:'u1'});
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
  const api=fs.readFileSync(new URL('../api/admin/threads.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(api,/access_token.*json/i);
  const migration=fs.readFileSync(new URL('../supabase/migrations/20261008113000_social_threads_api_oauth.sql',import.meta.url),'utf8');
  assert.match(migration,/service_role/);
  assert.match(migration,/revoke all .* anon, authenticated/);
});
