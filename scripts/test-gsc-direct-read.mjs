import assert from 'node:assert/strict';
import {
  parseGoogleServiceAccount,
  chooseGscSite,
  queryGscSearchAnalytics,
  probeGscDirect
} from '../lib/gscDirect.mjs';

const fakeSa={
  type:'service_account',
  client_email:'readonly@example.iam.gserviceaccount.com',
  private_key:'-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n'
};

assert.equal(parseGoogleServiceAccount(JSON.stringify(fakeSa)).client_email,fakeSa.client_email);
assert.equal(parseGoogleServiceAccount(Buffer.from(JSON.stringify(fakeSa)).toString('base64')).client_email,fakeSa.client_email);
assert.throws(()=>parseGoogleServiceAccount(''),/not configured/i);

const selected=chooseGscSite([
  {siteUrl:'https://therev-lab.com/',permissionLevel:'siteFullUser'},
  {siteUrl:'sc-domain:therev-lab.com',permissionLevel:'siteOwner'}
]);
assert.equal(selected.siteUrl,'sc-domain:therev-lab.com');

let captured=null;
const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
const fetchImpl=async(url,options={})=>{
  captured={url,options};
  return response(200,{rows:[{keys:['2026-10-01'],clicks:2,impressions:40,ctr:.05,position:4}]});
};
const q=await queryGscSearchAnalytics({
  siteUrl:'sc-domain:therev-lab.com',
  startDate:'2026-10-01',
  endDate:'2026-10-01',
  dimensions:['date'],
  rowLimit:100,
  accessToken:'test',
  fetchImpl
});
assert.equal(q.rows[0].clicks,2);
assert.match(captured.url,/searchAnalytics\/query$/);
const body=JSON.parse(captured.options.body);
assert.equal(body.dataState,'final');
assert.equal(body.type,'web');
assert.deepEqual(body.dimensions,['date']);

console.log('GSC direct read-side static contract PASS');
