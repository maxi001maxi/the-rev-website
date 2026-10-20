async function frames(page){
 await page.evaluate(()=>{globalThis.__revQaPaintFrames=0;});
 // Playwright owns the deadline outside the renderer; one long evaluate()
 // awaiting animation frames can stall despite renderer-side timeout timers.
 await page.waitForFunction(()=>++globalThis.__revQaPaintFrames>=3,null,{polling:'raf',timeout:2000});
}
export async function ready(page,{timeout=15000}={}){
 await page.bringToFront();
 await page.waitForLoadState('load',{timeout});
 await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout});
 await frames(page);
}
export async function traverse(page){await page.bringToFront();
 // Pin the document extent before scrolling: sticky/parallax transforms may
 // grow scrollHeight as we scroll without adding any content.
 const {initialHeight,step}=await page.evaluate(()=>({initialHeight:document.documentElement.scrollHeight,step:Math.max(1,innerHeight*.7)}));
 for(let y=0;y<initialHeight;y+=step){
  await page.evaluate(y=>{console.debug('REV_QA_PAINT '+JSON.stringify({phase:'scroll',y}));scrollTo({top:y,behavior:'instant'});},y);
  await frames(page);
 }
 const metrics=await page.evaluate(async()=>{
 console.debug('REV_QA_PAINT '+JSON.stringify({phase:'image-check'}));
 const images=[...document.images].filter(i=>i.getClientRects().length&&getComputedStyle(i).visibility!=='hidden');
 if(images.some(i=>i.complete&&i.naturalWidth===0))throw new Error('Visible image failed to load before visual proof');
 // decode() is a best-effort paint wait (errors were already ignored). Some
 // Chromium SVG decoders never settle; bound only this wait, not assertions.
 const decodable=images.filter(i=>{
  const url=(i.currentSrc||i.src).toLowerCase();
  return i.complete&&i.naturalWidth&&!url.startsWith('data:image/svg+xml')&&!url.split(/[?#]/)[0].endsWith('.svg');
 });
 console.debug('REV_QA_PAINT '+JSON.stringify({phase:'decode',count:decodable.length}));
 await Promise.all(decodable.map(async i=>{let timer;try{await Promise.race([i.decode().catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}finally{clearTimeout(timer);}}));
 console.debug('REV_QA_PAINT '+JSON.stringify({phase:'reset'}));
 const heightDuringScroll=document.documentElement.scrollHeight;
 scrollTo({top:0,behavior:'instant'});return {height_during_scroll:heightDuringScroll,svg_decode_skipped:images.length-decodable.length,raster_decode_count:decodable.length};});await ready(page);
 return {initial_height:initialHeight,...metrics,height_after_reset:await page.evaluate(()=>document.documentElement.scrollHeight)};}

