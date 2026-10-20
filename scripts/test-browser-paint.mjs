import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ready,traverse} from '../lib/browserPaintQa.mjs';
async function browserTest(fn){const b=await chromium.launch({headless:true,args:['--no-sandbox']});try{await fn(b);}finally{await b.close();}}
test('a previously background page is brought forward for actual mobile paint',()=>browserTest(async b=>{
 const ctx=await b.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage();await p.setContent('<p>mobile proof</p>');const other=await ctx.newPage();await other.setContent('<p>other</p>');await other.bringToFront();await ready(p);assert.equal(await p.evaluate(()=>document.visibilityState),'visible');assert.equal(await p.locator('p').innerText(),'mobile proof');
}));
test('long-page traversal preserves visible-image rejection',()=>browserTest(async b=>{
 const p=await b.newPage({viewport:{width:390,height:844}});await p.route('https://proof.test/missing.png',r=>r.fulfill({status:404,body:''}));await p.setContent('<div style="height:3000px">long page</div><img src="https://proof.test/missing.png">');await assert.rejects(()=>traverse(p),/Visible image failed/);
}));
test('an unresolved font fails with a bounded wait rather than accepting unstable paint',()=>browserTest(async b=>{
 const p=await b.newPage();let release;await p.route('https://fonts.test/blocked.woff2',async r=>{await new Promise(resolve=>{release=resolve;});await r.abort();});
 try{const request=p.waitForRequest('https://fonts.test/blocked.woff2');await p.setContent('<style>@font-face{font-family:blocked;src:url(https://fonts.test/blocked.woff2)}p{font-family:blocked}</style><p>pending font</p>',{waitUntil:'domcontentloaded'});await request;await assert.rejects(()=>ready(p,{timeout:300}),/Timeout/);}finally{if(release)release();}
}));
