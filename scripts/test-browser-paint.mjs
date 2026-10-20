import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ready,traverse} from '../lib/browserPaintQa.mjs';
async function browserTest(fn){const b=await chromium.launch({headless:true,args:['--no-sandbox']});try{await fn(b);}finally{await b.close();}}
test('suspended renderer animation and timers fail within the host deadline',{timeout:6000},()=>browserTest(async b=>{
 const p=await b.newPage();await p.setContent('<p>paint must not be assumed</p>');
 await p.evaluate(()=>{window.requestAnimationFrame=()=>0;window.setTimeout=()=>0;});
 await assert.rejects(()=>ready(p),/Timeout 2000ms/);
}));
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

test('scroll-driven geometry growth cannot make visual traversal unbounded',()=>browserTest(async b=>{
 const p=await b.newPage({viewport:{width:390,height:844}});
 await p.setContent('<div id="extent" style="height:3000px">fixed logical content</div><script>addEventListener("scroll",()=>document.querySelector("#extent").style.height=(3000+scrollY)+"px")</script>');
 const result=await traverse(p);assert(result.height_during_scroll>result.initial_height);
 assert.equal(await p.evaluate(()=>scrollY),0);assert.equal(await p.locator('#extent').innerText(),'fixed logical content');
 assert(result.height_after_reset<result.height_during_scroll);
}));

test('a loaded SVG is rendered without invoking the unreliable optional SVG decoder',()=>browserTest(async b=>{
 const p=await b.newPage({viewport:{width:390,height:844}}),svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="red"/></svg>');
 await p.setContent('<img src="'+svg+'">');await p.evaluate(()=>{window.svgDecodeCalls=0;const previous=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){if(this.currentSrc.startsWith('data:image/svg+xml')){window.svgDecodeCalls++;return new Promise(()=>{});}return previous.call(this);};});
 const result=await traverse(p);assert.equal(await p.evaluate(()=>svgDecodeCalls),0);assert.equal(result.svg_decode_skipped,1);assert.equal(await p.locator('img').evaluate(i=>i.complete&&i.naturalWidth),24);assert((await p.screenshot()).length>100);
}));

