// Operate the public menu -> available time -> blank visitor form flow.
// Never enter customer information, accept terms, submit, or confirm a booking.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=process.env.BOOKING_QA_OUT || 'qa-out/technical';fs.mkdirSync(out,{recursive:true});
const entry='https://cl.gyms.jp/t/CC2237480443/';
const params={utm_source:'website',utm_medium:'referral',utm_campaign:'trial',utm_content:'home_hero'};
const allowed=['cl.gyms.jp','gyms-api.saucer-saas.com','s3.ap-northeast-1.wasabisys.com','cdnjs.cloudflare.com','cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com'];
const report={status:'UNVERIFIED',cases:[],blockedWrites:[],blockedReads:[],errors:[],customerInput:false,submitted:false};
const normalize=s=>s.replace(/\s+/gu,' ').trim();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
try{
 for(const [width,height] of [[1440,900],[390,844]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await ctx.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(!['GET','HEAD','OPTIONS'].includes(req.method())){report.blockedWrites.push({method:req.method(),url:url.origin+url.pathname});await route.abort();return;}
   if(/analytics|googletagmanager|doubleclick|facebook|clarity/.test(url.hostname)){await route.abort();return;}
   if(!allowed.includes(url.hostname)){report.blockedReads.push(url.origin+url.pathname);await route.abort();return;}
   await route.continue();
  });
  const page=await ctx.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',e=>report.errors.push({width,message:e.message}));
  let expected;
  async function openMenus(){
   // Attach rejection handling immediately, even if navigation itself fails.
   const masterWait=page.waitForResponse(r=>r.url().includes('/cli/public/reserve_master.json')&&r.status()===200,{timeout:60000}).then(r=>r.json()).catch(e=>({probeError:e.message}));
   await page.goto(entry+'?'+new URLSearchParams(params),{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForURL('**/trial/CC2237480443/**',{timeout:30000});
   for(const [key,value] of Object.entries(params))assert.equal(new URL(page.url()).searchParams.get(key),value,key+' preserved after redirect');
   const master=await masterWait;assert.equal(master.status,'success',master.probeError||'public menu API');
   const menus=master.data.menus.filter(m=>m.name.includes('【初回体験】')&&/リカバリー|パーソナルジムトレーニング|パーソナルボクシング/.test(m.name));
   assert.equal(menus.length,3,'three actual trial menus from public API');
   await page.locator('.menu_title').first().waitFor({state:'visible',timeout:60000});
   const titles=(await page.locator('.menu_title').allTextContents()).map(normalize);
   for(const menu of menus)assert.ok(titles.includes(normalize(menu.name)),menu.name+' visible in menu cards');
   return {menus,titles};
  }
  try{
   const first=await openMenus();expected=first.menus;
   await page.screenshot({path:path.join(out,`booking-menu-${width}.png`)});
   for(let index=0;index<expected.length;index++){
    const state=index===0?first:await openMenus();
    const menu=expected[index],position=state.titles.indexOf(normalize(menu.name));assert.ok(position>=0);
    await page.locator('.menu_title').nth(position).click();
    const slot=page.locator('td[data-slot-available="true"]').first();await slot.waitFor({state:'visible',timeout:60000});
    const selected=await slot.evaluate(el=>({date:el.dataset.slotDate,time:el.dataset.slotTime,menuUid:el.dataset.slotMenuUid}));
    assert.ok(selected.date&&selected.time&&selected.menuUid,'actual public availability cell');
    await slot.click();
    const form=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'予約フォーム',exact:true})});await form.waitFor({state:'visible'});
    for(const autocomplete of ['name','tel','email'])await form.locator(`input[autocomplete="${autocomplete}"]`).first().waitFor({state:'visible'});
    const values=await form.locator('input:not([type="checkbox"])').evaluateAll(es=>es.map(e=>e.value));assert.ok(values.every(v=>v===''),'customer fields remain blank');
    const next=form.getByRole('button',{name:'入力内容を確認して次へ',exact:true});assert.ok(await next.isDisabled(),'cannot proceed with blank customer information');
    await page.screenshot({path:path.join(out,`booking-form-${width}-${index+1}.png`)});
    report.cases.push({width,height,menu:menu.name,finalUrl:page.url(),redirect:'PASS',utm:'PASS',menuDisplay:'PASS',availability:selected,formDisplay:'PASS',blankFields:values.length,nextDisabled:true,status:'PASS'});
    await form.getByRole('button',{name:'Close',exact:true}).click();await form.waitFor({state:'hidden'});
   }
  }catch(error){
   report.failure={width,message:error.message};
   await page.screenshot({path:path.join(out,`booking-failure-${width}.png`)}).catch(()=>{});
   fs.writeFileSync(path.join(out,`booking-failure-${width}.html`),await page.content().catch(()=>''));
   throw error;
  }finally{await ctx.close();}
 }
 assert.equal(report.cases.length,6);assert.deepEqual(report.errors,[],'external booking page JavaScript errors');
 assert.deepEqual(report.blockedWrites,[],'no booking or customer data write attempted');report.status='PASS';
}catch(error){report.error=error.message;report.status=/net::ERR_|page.goto: Timeout/.test(error.message)?'UNVERIFIED':'FAIL';process.exitCode=1;}
finally{await browser.close();fs.writeFileSync(path.join(out,'booking-browser.json'),JSON.stringify(report,null,2));console.log(report.status,report.cases.length,'menu/form cases;',report.error||'all fields blank; no submission');}
