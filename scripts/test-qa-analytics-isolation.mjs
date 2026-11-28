import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright';
import {blockQaAnalytics} from './qa-block-analytics.mjs';

test('browser audit cannot transmit collection or other writes', async () => {
  const received=[];
  const server=http.createServer((req,res)=>{received.push({method:req.method,path:req.url});res.setHeader('access-control-allow-origin','*');res.end('OK');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  try {
    const context=await browser.newContext();
    const isolation=await blockQaAnalytics(context);
    const page=await context.newPage();
    await page.goto(base+'/');
    const results=await page.evaluate(async()=>{
      const get=await fetch('/g/collect?en=page_view');
      const post=await fetch('/g/collect',{method:'POST',body:'en=reserve_click'});
      const write=await fetch('/write',{method:'POST',body:'must never arrive'}).then(()=>false,()=>true);
      const asset=await fetch('/asset.js');
      return {get:get.status,post:post.status,writeBlocked:write,asset:asset.status};
    });
    assert.deepEqual(results,{get:204,post:204,writeBlocked:true,asset:200});
    assert.equal(received.filter(r=>r.path.startsWith('/g/collect')||r.path==='/write').length,0);
    assert.equal(received.filter(r=>r.path==='/asset.js').length,1);
    assert.equal(isolation.collectionIntercepted,2);
    assert.equal(isolation.otherWritesBlocked,1);
    assert.equal(isolation.externalAnalyticsTransmitted,0);
    assert.equal(isolation.ga4Receipt,'UNVERIFIED');
    await context.close();
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
