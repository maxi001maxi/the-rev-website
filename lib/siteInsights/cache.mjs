const entries=new Map();
export async function cached(key,ttl,loader) {
  const now=Date.now(), hit=entries.get(key);
  if(hit && hit.until>now) return hit.promise;
  const promise=Promise.resolve().then(loader);
  entries.set(key,{promise,until:now+ttl});
  try { const value=await promise; if(value?.status==='ERROR') entries.delete(key); return value; }
  catch(e) { entries.delete(key); throw e; }
}
export function clearCache(){entries.clear();}
