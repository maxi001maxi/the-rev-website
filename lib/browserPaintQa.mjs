export async function ready(page,{timeout=15000}={}){
 await page.bringToFront();
 await page.waitForLoadState('load',{timeout});
 await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout});
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('BROWSER_PAINT_TIMEOUT:'+document.visibilityState)),2000);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));
 }));
}
export async function traverse(page){await page.bringToFront();const metrics=await page.evaluate(async()=>{
 // Pin the document extent before scrolling: sticky/parallax transforms may
 // grow scrollHeight as we scroll without adding any content.
 const initialHeight=document.documentElement.scrollHeight,step=Math.max(1,innerHeight*.7);
 for(let y=0;y<initialHeight;y+=step){scrollTo({top:y,behavior:'instant'});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SCROLL_PAINT_TIMEOUT:'+document.visibilityState)),2000);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});}
 const images=[...document.images].filter(i=>i.getClientRects().length&&getComputedStyle(i).visibility!=='hidden');
 if(images.some(i=>i.complete&&i.naturalWidth===0))throw new Error('Visible image failed to load before visual proof');
 // decode() is a best-effort paint wait (errors were already ignored). Some
 // Chromium SVG decoders never settle; bound only this wait, not assertions.
 await Promise.all(images.filter(i=>i.complete&&i.naturalWidth).map(async i=>{let timer;try{await Promise.race([i.decode().catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}finally{clearTimeout(timer);}}));
 const heightDuringScroll=document.documentElement.scrollHeight;
 scrollTo({top:0,behavior:'instant'});return {initial_height:initialHeight,height_during_scroll:heightDuringScroll};});await ready(page);
 return {...metrics,height_after_reset:await page.evaluate(()=>document.documentElement.scrollHeight)};}
