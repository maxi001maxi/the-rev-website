// Real Chromium E2E of the static public site. Does not submit forms or bookings.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
const out=path.resolve(process.env.QA_OUT || 'qa-out/browser');fs.mkdirSync(out,{recursive:true});
const routes=['/','/solution.html','/trainer.html','/price.html','/blog/','/access.html'];
const targets=['/#service','/solution.html','/trainer.html','/price.html','/blog/','/#trial','/access.html'];
const sizes=[[1440,900],[1920,1080],[1366,768],[390,844],[375,812],[360,800],[768,1024]];
let server, snapshotRoot;
let base=process.env.BASE_URL;
if(!base){
 // Freeze the tested build: a separate build must never change served bytes mid-run.
 const root=snapshotRoot=fs.mkdtempSync(path.join(os.tmpdir(),'rev-site-qa-'));
 fs.cpSync(path.resolve('dist'),root,{recursive:true});
 const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon','.xml':'application/xml'};
 server=http.createServer((req,res)=>{
  let file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
}
base=base.replace(/\/$/,'');const origin=new URL(base).origin;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
const results=[],errors=[],network=[],external=[],screenshots=[];
function record(test,size,route,detail,status='PASS'){const row={test,size,route,status,detail};results.push(row);fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({base:origin,results,errors,network,external,screenshots},null,2));return row;}
const slug=route=>route==='/'?'top':route.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'');
const selectAnchor=(scope,target)=>scope.locator('a[href]').filter({hasText:/.*/});
try{
async function runSize([width,height]){
 const size=`${width}x${height}`;
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1, reducedMotion:'reduce',extraHTTPHeaders:process.env.VERCEL_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_BYPASS_SECRET}:{}});
 // Suppress telemetry and non-GET requests during QA. These exclusions are logged.
 await context.route('**/*',async route=>{
  const req=route.request(),url=req.url();
  if(!['GET','HEAD'].includes(req.method()) || /google-analytics|googletagmanager|clarity\.ms|doubleclick/.test(url)) {await route.abort();return;}
  await route.continue();
 });
 if(process.env.SHARE_URL){const auth=await context.newPage();await auth.goto(process.env.SHARE_URL,{waitUntil:'domcontentloaded'});await auth.close();}
 const page=await context.newPage();let currentRoute='';
 page.on('pageerror',e=>errors.push({size,route:currentRoute,message:e.message}));
 page.on('response',res=>{if(res.status()>=400){const row={size,route:currentRoute,url:res.url(),status:res.status()};(res.url().startsWith(origin)?network:external).push(row);}});
 page.on('requestfailed',req=>{if(!req.url().startsWith(origin)&&!/google-analytics|googletagmanager|clarity\.ms|doubleclick/.test(req.url()))external.push({size,route:currentRoute,url:req.url().split('?')[0],error:req.failure()?.errorText});});
 async function ready(){await page.waitForLoadState('domcontentloaded');await page.locator('main h1').filter({visible:true}).first().waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);}
 async function clickMenu(target){
  const desktop=page.locator('header a[href="'+target+'"]');
  if(await desktop.first().isVisible()) {await desktop.first().click();}
  else{
   const opener=page.locator('#menu-toggle,.nav-toggle');await opener.click();
   const dialog=page.locator('[role="dialog"][aria-hidden="false"]');await dialog.waitFor({state:'visible'});
   await dialog.locator('a[href="'+target+'"]').click();
  }
  await ready();
 }
 for(const route of routes){
  currentRoute=route;await page.goto(base+route,{waitUntil:'domcontentloaded'});await ready();
  assert.ok((await page.title()).includes('THE REV'));
  assert.equal(await page.locator('main h1').filter({visible:true}).count(),1,'one visible h1');
  assert.equal(await page.locator('x-dc,[type="text/x-dc"],#demo-dialog').count(),0);
  assert.ok(!(await page.locator('body').innerText()).includes('このページはプレビューに含まれていません'));
  record('render',size,route,'Real content, visible heading, no demo runtime');
  // Traverse the whole document so lazy assets and scrolled header states are exercised.
  await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight*.8){scrollTo(0,y);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}});
  await page.evaluate(()=>scrollTo({top:600,behavior:"instant"}));
  await page.waitForFunction(()=>/scrolled/.test(document.querySelector('header').className));
  const headerState=await page.locator('header').getAttribute('class');
  assert.ok(/scrolled/.test(headerState),'header switches background on scroll');
  record('scroll/header',size,route,headerState);
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,badImages:[...document.images].filter(im=>im.getClientRects().length&&getComputedStyle(im).visibility!=='hidden'&&im.complete&&im.naturalWidth===0).map(im=>im.getAttribute('src')),duplicates:[...document.querySelectorAll('[id]')].map(el=>el.id).filter((id,i,all)=>all.indexOf(id)!==i)}));
  assert.ok(layout.scrollWidth<=width+1,'horizontal overflow '+JSON.stringify(layout));assert.deepEqual(layout.badImages,[]);assert.deepEqual(layout.duplicates,[]);
  record('layout/images',size,route,JSON.stringify(layout));
  await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));
  const shot=`${slug(route)}-${size}.png`;await page.screenshot({path:path.join(out,shot)});screenshots.push(shot);
  // Every menu from every source page; round trip by actual browser history.
  for(const target of targets){
   const prior = page.url();
   await clickMenu(target);
   const actual=new URL(page.url());const expected=new URL(target,base);
   assert.equal(actual.pathname,expected.pathname);assert.equal(actual.hash,expected.hash);
   if(expected.hash){
    const id=expected.hash.slice(1);await page.locator('[id="'+id+'"]').waitFor({state:'attached'});
    await page.waitForFunction(id=>Math.abs(document.getElementById(id).getBoundingClientRect().top)<150,id);
   }
   record('menu/roundtrip',size,route,target);
   if(page.url() === prior) continue;
   // Same-route anchor navigation and normal navigations both produce history entries.
   await page.goBack({waitUntil:'domcontentloaded'});await ready();
   assert.equal(new URL(page.url()).pathname,new URL(route,base).pathname);
   await page.goForward({waitUntil:'domcontentloaded'});await ready();
   assert.equal(new URL(page.url()).pathname,expected.pathname);
   await page.goBack({waitUntil:'domcontentloaded'});await ready();
  }
  // Drawer close, Escape, focus trap, scroll lock and restore at non-zero scroll.
  const opener=page.locator('#menu-toggle,.nav-toggle');
  if(await opener.isVisible()){
   await page.evaluate(()=>scrollTo({top:450,behavior:"instant"}));const saved=await page.evaluate(()=>scrollY);
   await opener.click();const dialog=page.locator('[role="dialog"][aria-hidden="false"]');await dialog.waitFor({state:'visible'});
   assert.ok(await page.evaluate(()=>getComputedStyle(document.body).position==='fixed'||getComputedStyle(document.body).overflow==='hidden'));
   const links=dialog.locator('a[href]');const close=dialog.locator('button').first();
   await close.focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'A');
   await page.keyboard.press('Tab');assert.ok(await close.evaluate(el=>el===document.activeElement));
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   // Wait for Chromium to apply the restored document scroll after fixed-body layout.
   await page.waitForFunction(y=>Math.abs(scrollY-y)<3,saved);
   const restored=await page.evaluate(()=>scrollY);assert.ok(Math.abs(restored-saved)<3,JSON.stringify({size,route,saved,restored}));assert.equal(await opener.getAttribute('aria-expanded'),'false');
   await opener.click();await page.locator('[role="dialog"][aria-hidden="false"] button').first().click();
   record('drawer/focus/escape/scroll-restore',size,route,'PASS');
  } else {
   const item=page.locator('header a[href="/price.html"]');await item.hover();await item.focus();
   assert.ok(await item.evaluate(el=>el===document.activeElement));record('desktop/hover/focus',size,route,'PASS');
  }
  const bookings=await page.locator('a[href^="https://cl.gyms.jp/"]').evaluateAll(a=>a.map(el=>({href:el.href,track:el.dataset.track,placement:el.dataset.placement,target:el.target})));
  assert.ok(bookings.length>0);assert.ok(bookings.every(b=>b.href.startsWith('https://cl.gyms.jp/t/CC2237480443/')));
  record('booking/attributes',size,route,JSON.stringify(bookings));
 }
 await page.goto(base+'/');await ready();
 for(const key of ['boxing','recovery','training']){
  await page.locator('#tab-'+key).click();assert.equal(await page.locator('#tab-'+key).getAttribute('aria-selected'),'true');assert.ok(await page.locator('#trial-'+key).isVisible());
 }
 await page.locator('#tab-training').press('ArrowRight');assert.equal(await page.locator('#tab-boxing').getAttribute('aria-selected'),'true');
 await page.locator('#tab-boxing').press('End');assert.equal(await page.locator('#tab-recovery').getAttribute('aria-selected'),'true');
 await page.locator('#trial').scrollIntoViewIfNeeded();const trialShot=`top-trial-${size}.png`;await page.screenshot({path:path.join(out,trialShot)});screenshots.push(trialShot);
 const next=page.getByRole('button',{name:'次の声へ'});await next.click();await page.waitForFunction(()=>document.getElementById('voice-rail').scrollLeft>0);record('top/tabs/keyboard/voices',size,'/','All three tab panels, arrow/End key, voice rail');
 await page.goto(base+'/solution.html');await ready();const denba=page.locator('.rv-denba-render');if(await denba.count()){await denba.first().scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const im=document.querySelector('.rv-denba-render');return im.complete&&im.naturalWidth>0;});await denba.first().evaluate(im=>im.decode());const file=`recovery-denba-${size}.png`;await page.screenshot({path:path.join(out,file)});screenshots.push(file);}
 const summary=page.locator('summary').first();await summary.click();assert.ok(await summary.evaluate(el=>el.parentElement.open));await summary.click();record('recovery/details',size,'/solution.html','Native expandable research note');
 await page.goto(base+'/solution.html#recovery-precautions');await ready();assert.ok(await page.locator('#recovery-precautions').count());record('recovery/legacy-anchor',size,'/solution.html','Existing article safety link retained');
 await page.goto(base+'/blog/');await ready();
 await page.locator('.blog-card a[href],a.blog-card[href]').first().click();await ready();
 assert.ok(await page.locator('header a[href="/blog/"][aria-current="page"]').count()>0);
 const articleShot=`article-${size}.png`;await page.screenshot({path:path.join(out,articleShot)});screenshots.push(articleShot);
 record('article/common-header',size,new URL(page.url()).pathname,'Article opens from Column and retains current Column state');
 await context.close();console.log('[browser]',size,'PASS');
}
const queue=[...sizes];
await Promise.all(Array.from({length:Math.min(Number(process.env.QA_CONCURRENCY || 7),sizes.length)},async()=>{while(queue.length)await runSize(queue.shift());}));
assert.deepEqual(errors,[],'page JavaScript errors');assert.deepEqual(network,[],'first-party network failures');
} catch(error){record('failure','active','active',error.stack,'FAIL');console.error(error);process.exitCode=1;}
finally{
 await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
 if(snapshotRoot)fs.rmSync(snapshotRoot,{recursive:true,force:true});
 const summary={status:process.exitCode?'FAIL':'PASS',base:origin,browser:'Chromium',testedSizes:sizes,results,errors,network,external,screenshots,exclusions:['Telemetry blocked to avoid analytics pollution; non-GET requests blocked; no form submitted.']};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2));
 const csv=['Test,Size,Route,Status,Detail',...results.map(row=>[row.test,row.size,row.route,row.status,row.detail].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','))];fs.writeFileSync(path.join(out,'QA_MATRIX.csv'),csv.join('\n'));
 console.log('[browser]',summary.status,results.length,'checks;',errors.length,'JS errors;',network.length,'first-party failures; external observations:',external.length);
}
