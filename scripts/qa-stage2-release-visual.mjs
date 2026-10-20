// Release visual evidence; bounded viewport/section shots avoid giant page captures.
import {chromium} from 'playwright';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
const base=process.env.BASE_URL?.replace(/\/$/,'');assert.ok(base,'BASE_URL required');
const out=process.env.VISUAL_OUT||'qa-out/resume/preview';fs.mkdirSync(out,{recursive:true});
const pages=[['top','/'],['recovery','/solution.html'],['trainer','/trainer.html'],['price','/price.html'],['access','/access.html'],['column','/blog/'],['article','/blog/boxing-beginner-first-step/'],['legal','/legal.html'],['privacy','/privacy.html'],['terms','/terms.html'],['404','/404.html']];
const widths=(process.env.WIDTHS||'1440,1280,768,390,375').split(',').map(Number);const origin=new URL(base).origin;
const report={base,candidate:process.env.CANDIDATE_SHA,widths,pages,rows:[],errors:[],network:[],excluded:[],status:'RUNNING'};const save=()=>fs.writeFileSync(path.join(out,'visual-results.json'),JSON.stringify(report,null,2));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of widths){const height=width<=768?844:900;const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 await ctx.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(!['GET','HEAD'].includes(r.method())||u.origin!==origin){report.excluded.push({method:r.method(),url:u.origin+u.pathname});await route.abort();return;}await route.continue({headers:{...r.headers(),...(process.env.VERCEL_BYPASS_SECRET?{"x-vercel-protection-bypass":process.env.VERCEL_BYPASS_SECRET}:{})}});});
 if(process.env.SHARE_URL){const auth=await ctx.newPage();await auth.goto(process.env.SHARE_URL,{waitUntil:'domcontentloaded',timeout:60000});await auth.close();}
 for(const [name,route] of pages){const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push({width,route,message:e.message}));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400&&!(route==='/404.html'&&r.url().endsWith('/404.html')&&r.status()===404))report.network.push({width,route,url:r.url(),status:r.status()});});
 try{
 await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('main h1').filter({visible:true}).first().waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);if(await page.locator('#site-loader').count())await page.locator('#site-loader').waitFor({state:'hidden',timeout:10000});
 // Trigger lazy images through every section, bounded to animation frames.
 await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight*.8){scrollTo({top:y,behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}scrollTo({top:0,behavior:'instant'});});
 await page.waitForFunction(()=>[...document.images].filter(i=>i.getClientRects().length&&getComputedStyle(i).visibility!=='hidden').every(i=>i.complete),{timeout:20000});
 const state=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,images:[...document.images].filter(i=>i.getClientRects().length&&getComputedStyle(i).visibility!=='hidden'&&i.naturalWidth===0).map(i=>i.getAttribute('src')),booking:[...document.querySelectorAll('a[href*="cl.gyms.jp"]')].map(a=>({href:a.href,track:a.dataset.track,placement:a.dataset.placement})),header:document.querySelector('header')?.getBoundingClientRect().toJSON(),topBodyBackground:getComputedStyle(document.body).backgroundColor}));
 assert.ok(state.scrollWidth<=width+1,name+' overflow');assert.deepEqual(state.images,[],name+' missing images');assert.ok(state.booking.length);assert.ok(state.booking.every(a=>a.href.startsWith('https://cl.gyms.jp/t/CC2237480443/')));
 const shots=[];async function shot(label){const file=`${name}-${width}-${label}.png`;await page.screenshot({path:path.join(out,file)});shots.push(file);}
 await shot('top');
 const sections=page.locator('main section');const count=await sections.count();const indices=count>0?[Math.floor(count/2)]:[];
 for(const index of indices){await sections.nth(index).scrollIntoViewIfNeeded();await shot('body');}
 if(!indices.length){await page.evaluate(()=>scrollTo({top:Math.max(0,(document.documentElement.scrollHeight-innerHeight)/2),behavior:'instant'}));await shot('body');}
 await page.locator('footer').scrollIntoViewIfNeeded();await shot('footer');
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 const toggle=page.locator('#menu-toggle');if(await toggle.isVisible()){await toggle.click();const dialog=page.locator('.rev-native-drawer');await dialog.waitFor({state:'visible'});const instagram=dialog.locator('a[href="https://www.instagram.com/the.rev.nara/"],a[href="https://instagram.com/the.rev.nara/"]');assert.equal(await instagram.count(),1,'Instagram in menu');await shot('menu');await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');}
 report.rows.push({name,route,width,height,state,shots,status:'PASS',manualVisual:'PENDING'});save();console.log('CAPTURE',width,name,'PASS');
 }finally{await page.close();}
 }await ctx.close();}
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;process.exitCode=1;console.error(e);}finally{await browser.close();save();}
