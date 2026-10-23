import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classify} from '../api/admin/google-business.mjs';

const err=(status,error,stage,message='')=>({
  status,code:'google_api_error',stage,data:{error,message},
  message:message||error
});

test('expired or revoked Testing refresh token has a distinct, actionable status',()=>{
  assert.equal(classify(err(400,'invalid_grant','oauth_refresh')),'oauth_refresh_invalid_grant');
  assert.equal(classify(err(400,'invalid_grant','accounts_list')),'oauth_grant_invalid');
  assert.equal(classify(err(401,'invalid_client','oauth_refresh')),'oauth_client_invalid');
});

test('disabled Google Business Profile API is not confused with OAuth expiry',()=>{
  assert.equal(classify(err(403,{message:'Google API has not been used or is disabled'},'accounts_list')),'required_api_disabled');
  assert.equal(classify(err(403,{status:'SERVICE_DISABLED'},'locations_list')),'required_api_disabled');
});

test('quota zero and ordinary throttling remain distinguishable',()=>{
  const zero=err(429,{status:'RESOURCE_EXHAUSTED',message:'Quota exceeded. quota_limit_value: 0'},'accounts_list');
  assert.equal(classify(zero),'api_access_quota_zero');
  assert.equal(classify(err(429,{message:'Quota exceeded for Requests per minute'},'accounts_list')),'quota_or_access_required');
});

test('request shape failure identifies which Google endpoint is rejecting it',()=>{
  assert.equal(classify(err(400,{message:'Invalid argument'},'accounts_list')),'accounts_api_invalid_request');
  assert.equal(classify(err(400,{message:'Invalid argument'},'locations_list')),'locations_api_invalid_request');
  assert.equal(classify(err(404,{message:'Not found'},'locations_list')),'google_api_resource_not_found');
});

test('management UI distinguishes stored authorization from valid access',()=>{
  const source=fs.readFileSync(new URL('../admin/js/google-business.mjs',import.meta.url),'utf8');
  assert.match(source,/oauth_refresh_invalid_grant/);
  assert.match(source,/api_access_quota_zero/);
  assert.match(source,/Google認証の記録あり（有効性は未確認）/);
  assert.match(source,/Google認証を更新する/);
  assert.doesNotMatch(source,/refresh_token|GBP_GOOGLE_CLIENT_SECRET/);
});
