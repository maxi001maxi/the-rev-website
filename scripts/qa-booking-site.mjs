// Read-only official reservation entry/redirect. No customer data or writes.
import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='qa-out/technical';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({
 headless:true,
 ...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),
 args:['--no-sandbox']
});
const ctx=await browser.newContext({serviceWorkers:'block'});
const log={blockedWrites:0,requests:[],status:'UNVERIFIED',blockedReads:[]};
const allowed=['cl.gyms.jp','gyms-api.saucer-saas.com','s3.ap-northeast-1.wasabisys.com','cdnjs.cloudflare.com','cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com'];
await ctx.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(request.method()!=='GET'){log.blockedWrites++;await route.abort();return;}
 if(/analytics|googletagmanager|doubleclick|facebook|clarity/.test(url.hostname)){await route.abort();return;}
 if(allowed.includes(url.hostname)){
  log.requests.push(url.origin+url.pathname);
  await route.continue();
 }else{log.blockedReads.push(url.origin+url.pathname);await route.abort();}
});
try{
 const page=await ctx.newPage();
 const params={utm_source:'website',utm_medium:'referral',utm_campaign:'trial',utm_content:'home_hero'};
 await page.goto('https://cl.gyms.jp/t/CC2237480443/?'+new URLSearchParams(params),{waitUntil:'load',timeout:30000});
 await page.waitForURL('**/trial/CC2237480443/**',{timeout:15000});
 const url=new URL(page.url());
 for(const [key,value] of Object.entries(params))assert.equal(url.searchParams.get(key),value);
 log.finalUrl=page.url();
 await page.waitForFunction(()=>{const text=document.body.innerText;return /パーソナル/.test(text)&&/ボクシング/.test(text)&&/酸素|リカバリー/.test(text);},null,{timeout:15000});
 log.text=(await page.locator('body').innerText()).slice(0,10000);
 assert.match(log.text,/体験/,'actual reservation selection is displayed');
 await page.screenshot({path:out+'/booking-redirect.png',fullPage:true});
 log.status='PASS';log.menuDisplay='Three trial menu types actually rendered';
}catch(error){
 log.error=error.message;
 // A transport failure is not a successful redirect. A product assertion fails CI.
 if(/net::ERR_|Navigation.*timeout|page.goto: Timeout/.test(error.message))log.status='UNVERIFIED';
 else{log.status='FAIL';process.exitCode=1;}
}finally{
 fs.writeFileSync(out+'/booking-browser.json',JSON.stringify(log,null,2));
 await browser.close();
 console.log(log.status,log.error||log.finalUrl);
}
