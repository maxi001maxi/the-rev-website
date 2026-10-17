import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {chromium} from 'playwright';

test('returning visitor replaces a seven-day cached main.js on all page types', async()=>{
 const root=path.resolve('dist'),requests=[];
 const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/js/main.js'))).digest('hex').slice(0,12);
 let published=false;
 const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
 const server=http.createServer((req,res)=>{
  // Keep a real HTTP cache while suppressing external frames and telemetry.
  res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'none'; connect-src 'self'");
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/__warm'){
   res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
   res.end('<!doctype html><script src="/assets/js/main.js"></script>');return;
  }
  if(u.pathname==='/assets/js/main.js'){
   requests.push(u.pathname+u.search);res.setHeader('Content-Type','application/javascript');res.setHeader('Cache-Control','public,max-age=604800');
   if(!published){res.end('window.__oldMainCache = true;');return;}
  } else res.setHeader('Cache-Control',u.pathname.endsWith('.html')||u.pathname==='/'?'no-store':'public,max-age=604800');
  let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
 try{
  // No routing: Playwright route interception would disable the real HTTP cache.
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(base+'/__warm',{waitUntil:'load'});assert.equal(await page.evaluate(()=>window.__oldMainCache),true);
  // Prove this context really reuses the old cached URL before release.
  await page.reload({waitUntil:'load'});assert.equal(requests.length,1,'unversioned script is served from the real browser cache');
  published=true;
  for(const [route,type] of [['/','home'],['/solution.html','recovery'],['/price.html','price']]){
   await page.goto(base+route,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>Array.isArray(window.dataLayer));
   const state=await page.evaluate(()=>{
    document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();},true);
    document.querySelector('a[data-track="reserve_click"]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
    return {oldMarker:window.__oldMainCache,events:window.dataLayer.filter(e=>e.event==='reserve_click')};
   });
   assert.equal(state.oldMarker,undefined);assert.equal(state.events.length,1,route+' one current intent listener');
   assert.equal(state.events[0].page_type,type);assert.equal(state.events[0].event_version,'e1_v1');
  }
  assert.deepEqual(requests,['/assets/js/main.js','/assets/js/main.js?v='+hash]);
  await context.close();
 } finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
