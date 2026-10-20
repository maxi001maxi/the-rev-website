// Read-only official reservation entry/redirect. No customer data or writes.
import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifyBookingMenus} from '../lib/bookingSiteQa.mjs';
const out='qa-out/technical';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({
 headless:true,
 ...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),
 args:['--no-sandbox']
});
const ctx=await browser.newContext({serviceWorkers:'block'});
const log={blockedWrites:0,requests:[],status:'UNVERIFIED',blockedReads:[],blockedWriteDetails:[]};
const allowed=['cl.gyms.jp','gyms-api.saucer-saas.com','s3.ap-northeast-1.wasabisys.com','cdnjs.cloudflare.com','cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com'];
await ctx.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(request.method()!=='GET'){log.blockedWrites++;log.blockedWriteDetails.push({method:request.method(),path:url.origin+url.pathname});await route.abort();return;}
 if(/analytics|googletagmanager|doubleclick|facebook|clarity/.test(url.hostname)){await route.abort();return;}
 if(allowed.includes(url.hostname)){
  log.requests.push(url.origin+url.pathname);
  await route.continue();
 }else{log.blockedReads.push(url.origin+url.pathname);await route.abort();}
});
let page;
try{
 page=await ctx.newPage();
 log.pageErrors=[];log.failedRequests=[];
 page.on('pageerror',e=>log.pageErrors.push(e.message));
 page.on('requestfailed',r=>{if(allowed.includes(new URL(r.url()).hostname))log.failedRequests.push({path:new URL(r.url()).origin+new URL(r.url()).pathname,error:r.failure()?.errorText});});
 log.stage='navigation';
 const masterResponse=page.waitForResponse(r=>r.url().includes('/cli/public/reserve_master.json')&&r.status()===200,{timeout:30000}).then(value=>({value}),error=>({error}));
 const params={utm_source:'website',utm_medium:'referral',utm_campaign:'trial',utm_content:'home_hero'};
 await page.goto('https://cl.gyms.jp/t/CC2237480443/?'+new URLSearchParams(params),{waitUntil:'load',timeout:30000});
 await page.waitForURL('**/trial/CC2237480443/**',{timeout:15000});
 const url=new URL(page.url());
 for(const [key,value] of Object.entries(params))assert.equal(url.searchParams.get(key),value);
 log.finalUrl=page.url();log.redirectStatus='PASS';
 log.stage='public_master';const received=await masterResponse;if(received.error)throw received.error;
 const master=await received.value.json();assert.equal(master.status,'success');
 const menus=master.data.menus.filter(m=>m.name.includes('【初回体験】'));
 const expected=menus.filter(m=>/リカバリー|パーソナルジムトレーニング|パーソナルボクシング/.test(m.name));
 assert.equal(expected.length,3,'three actual trial menus returned by public read-only API');
 log.publicMenuNames=expected.map(m=>m.name);
 log.stage='menu_and_calendar';
 log.menuObservations=await verifyBookingMenus(page,expected,{returnUrl:log.finalUrl,onCalendar:(p,i)=>p.screenshot({path:out+'/booking-calendar-'+i+'.png',fullPage:true})});
 log.formControls=await page.locator('input,select').count();
 log.text=(await page.locator('body').innerText()).slice(0,10000);
 assert.match(log.text,/体験/,'actual reservation selection is displayed');
 await page.screenshot({path:out+'/booking-redirect.png',fullPage:true});
 log.status='PASS';log.redirectStatus='PASS';log.menuDisplay='PASS: actual three trial menu options rendered/operated; no customer input';
}catch(error){
 log.error=error.message;
 // A transport failure is not a successful redirect. A product assertion fails CI.
 if(/net::ERR_|Navigation.*timeout|page.goto: Timeout/.test(error.message))log.status='UNVERIFIED';
 else log.status='FAIL';
 process.exitCode=1; // UNVERIFIED must never produce a green CI acceptance.
}finally{
 if(page){
  log.text=await page.locator('body').innerText().catch(()=>null);
  await page.screenshot({path:out+'/booking-final.png',fullPage:true}).catch(()=>{});
  fs.writeFileSync(out+'/booking-dom.html',await page.content().catch(()=>''));
 }
 fs.writeFileSync(out+'/booking-browser.json',JSON.stringify(log,null,2));
 await browser.close();
 console.log(log.status,log.error||log.finalUrl);
}
