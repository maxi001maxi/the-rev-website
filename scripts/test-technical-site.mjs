// Regression contracts for the approved native v7/v8 HTML and its built output.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const root=process.env.SITE_ROOT || '.';
for(const name of ['index.html','solution.html']){
 const html=fs.readFileSync(`${root}/${name}`,'utf8');
 assert.equal((html.match(/GTM-WFD7R8BT'\)/g)||[]).length,1,`${name}: one GTM bootstrap`);
 assert.equal((html.match(/ns\.html\?id=GTM-WFD7R8BT/g)||[]).length,1);
 if(root!=='.'){
  const bootstrap=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(x=>x[1].includes('GTM-WFD7R8BT'))?.[1];
  assert.ok(bootstrap);
  for(const hostname of ['therev-lab.com','www.therev-lab.com','localhost','review.vercel.app','therev-lab.com.evil.example']){
   let loads=0;
   const window={location:{hostname}};
   const document={getElementsByTagName:()=>[{parentNode:{insertBefore:()=>loads++}}],createElement:()=>({})};
   vm.runInNewContext(bootstrap,{window,document});
   assert.equal(loads,/^(www\.)?therev-lab\.com$/.test(hostname)?1:0,hostname+' production-only initialization');
  }
 }
 assert.doesNotMatch(html,/gtag\/js|gtag\(['"]config/,'GTM owns Google tag');
 const schemas=[...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(x=>JSON.parse(x[1]));
 const clubs=schemas.filter(x=>x['@type']==='HealthClub');assert.equal(clubs.length,1);
 const club=clubs[0];assert.equal(club['@id'],'https://therev-lab.com/#business');
 assert.equal(club.name,'THE REV. CONDITIONING LAB.');
 assert.equal(club.address.postalCode,'630-8001');assert.equal(club.address.addressCountry,'JP');
 assert.equal(club.openingHoursSpecification.length,4);assert.equal(club.priceRange,undefined);
 assert.equal(club.aggregateRating,undefined);assert.equal(club.potentialAction.target,'https://cl.gyms.jp/t/CC2237480443/');
 const anchors=[...html.matchAll(/<a\b[^>]*>/g)].map(x=>x[0]).filter(x=>x.includes('https://cl.gyms.jp/'));
 assert.equal(anchors.length,7,`${name}: every header/body/footer/drawer/sticky CTA`);
 for(const tag of anchors){
  const placement=tag.match(/data-placement="([^"]+)"/)?.[1];assert.ok(placement);
  assert.match(tag,/data-track="reserve_click"/);
  const url=new URL(tag.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&'));
  assert.equal(url.origin+url.pathname,'https://cl.gyms.jp/t/CC2237480443/');
  for(const [key,value] of Object.entries({utm_source:'website',utm_medium:'referral',utm_campaign:'trial',utm_content:placement})){
   assert.deepEqual(url.searchParams.getAll(key),[value],`${name}/${placement}/${key}`);
  }
 }
 for(const tag of ['og:locale','og:image:width','og:image:height','twitter:title','twitter:description','twitter:image']) assert.ok(html.includes(`"${tag}"`));
}
const main=fs.readFileSync('assets/js/main.js','utf8');
const tracking=main.slice(main.indexOf('  var TRACK_EVENT_VERSION'),main.indexOf('  /* ---------- 起動'));
for(const [pathname,expected] of Object.entries({'/':'home','/index.html':'home','/blog/':'blog_index','/blog/index.html':'blog_index','/blog/page/2/':'blog_index','/blog/category/training/index.html':'blog_category','/blog/an-article/index.html':'blog_article','/price.html':'price','/solution.html':'recovery'})){
 const listeners=[];const window={location:{pathname,hostname:'therev-lab.com'},dataLayer:[]};
 const document={documentElement:{getAttribute:()=>null},querySelector:()=>null,addEventListener:(_,cb)=>listeners.push(cb)};
 const ctx=vm.createContext({window,document,Map});
 vm.runInContext(tracking+'\ninitTrackingDataLayer();initTrackingDataLayer();',ctx);
 assert.equal(vm.runInContext('trackingPageType()',ctx),expected,pathname);
 assert.equal(listeners.length,1,'repeated load installs only one analytics listener');
 assert.equal(vm.runInContext('trackingBase().page_path',ctx),pathname,'keep actual page_path');
}
console.log('Technical site PASS: GTM singleton, verified HealthClub, 14 attributed booking anchors, metadata, page classification, listener deduplication.');
