// Actual Chromium, production-equivalent origin served ONLY from local build.
// Google CDN bootstrap is allowed; ALL collection/pixels/third-party writes abort.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve(process.env.TECH_QA_OUT||'qa-out/technical/browser');fs.mkdirSync(out,{recursive:true});
const origin='https://therev-lab.com', root=path.resolve('dist');
const report={origin:'Production hostname fulfilled from local dist; no production server requests',checks:[],cdn:[],collection:[],errors:[],visual:[],ga4Receipt:'UNVERIFIED',analyticsTransmitted:0};
// A CDN/context shutdown stall must fail with evidence before the CI job timeout.
// This never substitutes a timeout for any existing assertion or marks it PASS.
const watchdog=setTimeout(()=>{
 report.status='FAIL';report.failure='Technical browser deadline exceeded (240s); last stage: '+(report.stage||'startup');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
 console.error(report.failure);process.exit(1);
},240000);watchdog.unref();
const check=(name,detail)=>{report.checks.push({name,status:'PASS',detail});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(report,null,2));};
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
async function context({width=1440,height=900,baseline=false,cdn=false,siteOrigin=origin}={}){
 const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 ctx.setDefaultTimeout(15000);
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(/(?:^|\.)google-analytics\.com$|(?:^|\.)analytics\.google\.com$/.test(url.hostname)||/\/g\/collect|\/collect(?:\?|$)/.test(req.url())){
   const params=new URLSearchParams(url.search);for(const line of (req.postData()||'').split('\n')){
    const body=new URLSearchParams(line);report.collection.push({measurementId:params.get('tid')||body.get('tid'),event:body.get('en')||params.get('en'),page:body.get('ep.page_type')||params.get('ep.page_type'),placement:body.get('ep.placement')||params.get('ep.placement'),blocked:true,method:req.method(),sequence:body.get('_s')||params.get('_s')});
   }await route.fulfill({status:204,headers:{'access-control-allow-origin':'*'},body:''});return;
  }
  if(url.origin===siteOrigin && req.method()==='GET'){
   let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)&&file!==root){await route.abort();return;}
   if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
   if(baseline&&['/','/index.html','/solution.html'].includes(url.pathname)){
    const name=url.pathname==='/solution.html'?'solution.html':'index.html';
    const before=path.resolve('qa-out/technical/baseline',name);if(fs.existsSync(before))file=before;
   }
   if(fs.existsSync(file))await route.fulfill({path:file});else await route.fulfill({status:404,body:'Missing local asset'});return;
  }
  if(cdn&&req.method()==='GET'&&url.hostname==='www.googletagmanager.com'&&['/gtm.js','/gtag/js','/gtag/destination'].includes(url.pathname)){
   await route.continue();return;
  }
  await route.abort();
 });
 return ctx;
}
async function ready(page){await page.waitForLoadState('load');await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function traverse(page){await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight*.7){scrollTo({top:y,behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}await Promise.all([...document.images].filter(i=>i.complete&&i.naturalWidth).map(i=>i.decode().catch(()=>{})));scrollTo({top:0,behavior:'instant'});});await ready(page);}
async function preventNavigation(page){await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();},true));}
try{
 // Deterministic browser behavior checks never execute external analytics.
 for(const pathname of ['/','/solution.html','/price.html']){
  const ctx=await context();const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push({pathname,message:e.message}));
  await page.goto(origin+pathname);await ready(page);await preventNavigation(page);
  const anchors=page.locator('a[data-track="reserve_click"]');const count=await anchors.count();
  for(let i=0;i<count;i++){
   const link=anchors.nth(i),placement=await link.getAttribute('data-placement');
   const before=await page.evaluate(()=>dataLayer.filter(e=>e.event==='reserve_click').length);
   await link.evaluate(el=>el.click());
   const events=await page.evaluate(()=>dataLayer.filter(e=>e.event==='reserve_click'));
   assert.equal(events.length,before+1,`${pathname}/${placement} exactly once`);
   const last=events.at(-1);assert.equal(last.placement,placement);assert.equal(last.event_version,'e1_v1');
   if(pathname!=='/price.html'||placement==='pricing_trial')assert.equal(new URL(last.link_url).searchParams.get('utm_content'),placement);
   else assert.equal(new URL(last.link_url).searchParams.get('utm_content'),'pricing_page','preserve existing non-trial Price attribution contract');
   assert.equal(last.page_type,pathname==='/'?'home':pathname==='/price.html'?'price':'recovery');
  }
  check('booking click and UTM',`${pathname}: ${count} actual DOM click events, one reserve_click per anchor; navigation prevented`);
  for(const event of ['line_click','price_click']){
   const locator=page.locator(`a[data-track="${event}"]`);if(!await locator.count())continue;
   const before=await page.evaluate(event=>dataLayer.filter(e=>e.event===event).length,event);
   await locator.first().evaluate(el=>el.click());
   assert.equal(await page.evaluate(event=>dataLayer.filter(e=>e.event===event).length,event),before+1);check(event,`${pathname}: once`);
  }
  if(pathname==='/'){
   for(const id of ['trainer','recovery','trial','faq','access']){
    const el=page.locator(`[data-track-section="${id}"]`);const box=await el.boundingBox();assert.ok(box&&box.width>0&&box.height>0,id+' visible surface');
    await el.scrollIntoViewIfNeeded();await page.waitForFunction(id=>dataLayer.some(e=>e.event==='section_view'&&e.section_id===id),id);
    await el.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(id=>dataLayer.filter(e=>e.event==='section_view'&&e.section_id===id).length,id),1);
   }check('section_view','trainer/recovery/trial/faq/access use actual nonzero content, once per page');
  }
  if(pathname==='/price.html'){
   await page.locator('#cat-trial').scrollIntoViewIfNeeded();await page.waitForFunction(()=>dataLayer.some(e=>e.event==='section_view'));
   const events=await page.evaluate(()=>dataLayer.filter(e=>e.event==='section_view'));assert.equal(events.length,1);assert.equal(events[0].section_id,'pricing_trial');assert.equal(events[0].experiment_id,'REV-EXP-2026-001');assert.equal(events[0].experiment_variant,'control');
   check('Price control exposure','one pricing_trial section_view, unchanged REV-EXP-2026-001/control metadata');
  }
  await ctx.close();
 }
 const article=fs.readdirSync(path.join(root,'blog'),{withFileTypes:true}).find(x=>x.isDirectory()&&fs.existsSync(path.join(root,'blog',x.name,'index.html'))&&fs.readFileSync(path.join(root,'blog',x.name,'index.html'),'utf8').includes('data-track="article_cta_click"'));
 assert.ok(article,'published article fixture');
 {
  const ctx=await context();const page=await ctx.newPage();await page.goto(`${origin}/blog/${article.name}/`);await ready(page);await preventNavigation(page);
  const link=page.locator('a[data-track="article_cta_click"][href^="https://cl.gyms.jp/"]').first();assert.ok(await link.count());await link.evaluate(el=>el.click());
  const ev=await page.evaluate(()=>dataLayer.filter(e=>['article_cta_click','reserve_click'].includes(e.event)));
  assert.deepEqual(ev.map(e=>e.event),['article_cta_click','reserve_click']);assert.ok(ev.every(e=>e.page_type==='blog_article'));assert.equal(ev[1].source_event,'article_cta_click');
  check('article intent','one article_cta_click plus one intentional reserve_click, blog_article classification');await ctx.close();
 }
 // Keyboard skip link is visible on focus and moves the actual focus to main.
 for(const pathname of ['/','/solution.html']){
  const ctx=await context({width:390,height:844});const page=await ctx.newPage();await page.goto(origin+pathname);await ready(page);await page.keyboard.press('Tab');
  assert.match(await page.locator(':focus').getAttribute('href'),/^#main/);assert.ok((await page.locator(':focus').boundingBox()).y>=0);assert.ok(await page.locator(':focus').evaluate(el=>{const b=el.getBoundingClientRect(),top=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return top===el||el.contains(top);}),pathname+' skip link must not be covered by header');await page.keyboard.press('Enter');
  assert.equal(await page.locator(':focus').evaluate(el=>el.tagName),'MAIN');check('keyboard skip',pathname+': Tab → visible skip → Enter → main focus');await ctx.close();
 }
 // Manual preview sessions must not initialize the production container.
 {
  const previewOrigin='https://owner-review.vercel.app';
  const ctx=await context({siteOrigin:previewOrigin}),page=await ctx.newPage();let tagRequests=0;
  page.on('request',request=>{if(request.url().includes('googletagmanager.com'))tagRequests++;});
  for(const pathname of ['/','/solution.html','/trainer.html','/price.html','/blog/','/access.html']){
   await page.goto(previewOrigin+pathname);await ready(page);await preventNavigation(page);
   await page.locator('a[data-track="reserve_click"]').first().evaluate(el=>el.click());
   assert.equal(await page.evaluate(()=>dataLayer.filter(e=>e.event==='gtm.js').length),0);
   assert.equal(await page.evaluate(()=>dataLayer.filter(e=>e.event==='reserve_click').length),1);
  }
  assert.equal(tagRequests,0);check('Preview pollution prevention','six actual pages: no GTM/CDN initialization on Preview; local dataLayer still works');await ctx.close();
 }
 // Actual container/tag execution, with collection intercepted BEFORE transmission.
 report.tagPages=[];
 const articlePath=`/blog/${article.name}/`;
 for(const pathname of ['/','/solution.html','/trainer.html','/price.html','/blog/','/access.html',articlePath]){
  report.stage='external Google CDN / '+pathname;
  const ctx=await context({cdn:true}),page=await ctx.newPage();const start=report.collection.length,cdnStart=report.cdn.length;
  page.on('response',res=>{if(res.url().startsWith('https://www.googletagmanager.com/'))report.cdn.push({page:pathname,url:res.url().replace(/([?&](?!id=)[^=]+)=[^&]*/g,'$1=[redacted]'),status:res.status()});});
  page.on('requestfailed',req=>{if(req.url().startsWith('https://www.googletagmanager.com/'))report.cdn.push({page:pathname,url:req.url().split('?')[0],error:req.failure()?.errorText});});
  await page.goto(origin+pathname);await ready(page);await preventNavigation(page);
  const intent=pathname===articlePath?'a[data-track="article_cta_click"][href^="https://cl.gyms.jp/"]':'a[data-track="reserve_click"]';
  await page.locator(intent).first().evaluate(el=>el.click());
  if(pathname==='/price.html')await page.locator('#cat-trial').scrollIntoViewIfNeeded();
  if(pathname==='/')for(const name of ['line_click','price_click'])await page.locator(`a[data-track="${name}"]`).first().evaluate(el=>el.click());
  const executed=await page.waitForFunction(()=>!!window.google_tag_manager?.['GTM-WFD7R8BT'],null,{timeout:5000}).then(()=>true,()=>false);
  const expectedNames=['page_view','reserve_click',...(pathname==='/'?['line_click','price_click']:[]),...(pathname==='/price.html'?['section_view']:[]),...(pathname===articlePath?['article_cta_click']:[])];
  // GA4 batches custom events. Observe the actual batch, never infer failure
  // from a fixed delay shorter than its flush interval.
  if(executed){
   const deadline=Date.now()+15000;
   while(Date.now()<deadline&&!expectedNames.every(name=>report.collection.slice(start).some(e=>e.measurementId==='G-Q6ZSSJMEZ2'&&e.event===name)))await new Promise(resolve=>setTimeout(resolve,100));
  }
  const state=await page.evaluate(()=>({gtmEvent:window.google_tag_manager?.['GTM-WFD7R8BT']?.dataLayer?.get('event'),tagKeys:Object.keys(window.google_tag_manager||{}),starts:dataLayer.filter(e=>e.event==='gtm.js').length,events:dataLayer.filter(e=>['reserve_click','line_click','price_click','article_cta_click'].includes(e.event)).map(e=>({event:e.event,page_type:e.page_type,placement:e.placement}))}));
  assert.equal(state.starts,1);assert.equal(state.events.filter(e=>e.event==='reserve_click').length,1);
  const collected=report.collection.slice(start).filter(e=>e.measurementId==='G-Q6ZSSJMEZ2');
  const tagLoaded=report.cdn.slice(cdnStart).some(x=>x.status===200&&/\/gtag\//.test(x.url));
  const summary={pathname,...state,containerExecuted:executed,googleTagLoaded:tagLoaded,collectionEvents:collected.map(x=>x.event),status:executed&&tagLoaded?'COLLECTION_PENDING_VERIFICATION':'UNVERIFIED: CDN browser connectivity'};
  report.tagPages.push(summary);
  if(executed&&tagLoaded){
   for(const event of expectedNames)assert.equal(collected.filter(e=>e.event===event).length,1,pathname+' GA4 '+event+' request constructed once');
   summary.status='PASS';
   check('GTM and collection construction',pathname+': actual container + Google tag executed, one page_view/intent; collection intercepted with local 204; never transmitted');
  }
  await ctx.close();
 }
 report.measurementStatus=report.tagPages.every(x=>x.status==='PASS')?'EVENT_NAMES_CONSTRUCTED_NOT_TRANSMITTED':'PARTIALLY_UNVERIFIED';
 const intents=report.collection.filter(x=>x.event==='reserve_click');
 report.parameterMappingStatus=intents.length?(intents.every(x=>x.page&&x.placement)?'OBSERVED':'FAIL_EXISTING_GTM_PARAMETER_MAP'):'UNVERIFIED';
 report.publicationReadiness='FINAL_ACCEPTANCE_REQUIRED: receipt and external parameters are separate from website regression; see docs/qa/2026-10-17/FINAL_ACCEPTANCE.md';
 // Optional baseline images captured before edits; CI still produces current evidence.
 for(const [width,height] of [[1440,900],[390,844]])for(const pathname of ['/','/solution.html']){
  report.stage='visual comparison / '+pathname+' / '+width;
  const images={};const stem=`${pathname==='/'?'top':'recovery'}-${width}`;
  for(const baseline of fs.existsSync('qa-out/technical/baseline/index.html')?[true,false]:[false]){
   const ctx=await context({width,height,baseline}),page=await ctx.newPage();await page.goto(origin+pathname);await ready(page);await traverse(page);
   images[baseline?'before':'after']=await page.screenshot({path:path.join(out,`${stem}-${baseline?'before':'after'}.png`),fullPage:true,animations:'disabled'});await ctx.close();
  }
  const identical=images.before?images.before.equals(images.after):null;report.visual.push({stem,identical,baselineAvailable:!!images.before});
  if(images.before)assert.ok(identical,`${stem}: approved rendering pixel-identical`);
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;process.exitCode=1;}
finally{report.stage='browser shutdown';await browser.close();clearTimeout(watchdog);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
