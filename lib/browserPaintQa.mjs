export async function ready(page,{timeout=15000}={}){
 await page.bringToFront();
 await page.waitForLoadState('load',{timeout});
 await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout});
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('BROWSER_PAINT_TIMEOUT:'+document.visibilityState)),2000);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));
 }));
}
export async function traverse(page){await page.bringToFront();await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight*.7){scrollTo({top:y,behavior:'instant'});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SCROLL_PAINT_TIMEOUT:'+document.visibilityState)),2000);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});}
 const images=[...document.images].filter(i=>i.getClientRects().length&&getComputedStyle(i).visibility!=='hidden');
 if(images.some(i=>i.complete&&i.naturalWidth===0))throw new Error('Visible image failed to load before visual proof');
 // decode() is a best-effort paint wait (errors were already ignored). Some
 // Chromium SVG decoders never settle; bound only this wait, not assertions.
 await Promise.all(images.filter(i=>i.complete&&i.naturalWidth).map(async i=>{let timer;try{await Promise.race([i.decode().catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}finally{clearTimeout(timer);}}));
 scrollTo({top:0,behavior:'instant'});});await ready(page);}
