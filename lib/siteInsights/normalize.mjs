export function strictNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return null;
  const n=Number(value); return Number.isFinite(n) ? n : null;
}
export const wizardCtr = v => { const n=strictNumber(v); return n === null || n<0 || n>100 ? null : n/100; };
export const ga4Rate = v => { const n=strictNumber(v); return n === null || n<0 || n>1 ? null : n; };
export function canonicalPath(input) {
  if (typeof input !== 'string' || !input) return null;
  try {
    const u=new URL(input,'https://therev-lab.com');
    if (!['therev-lab.com','www.therev-lab.com'].includes(u.hostname.toLowerCase())) return null;
    const path=decodeURI(u.pathname).replace(/\/{2,}/g,'/');
    return path.length>1 ? path.replace(/\/+$/,'') : '/';
  } catch { return null; }
}
export const dateShift=(d,n)=>new Date(Date.parse(`${d}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
export function dateList(start,end) { const out=[]; for(let d=start;d<=end;d=dateShift(d,1)) {out.push(d); if(out.length>400) throw new RangeError('date range');} return out; }
export function ga4Rows(report) {
  const names=report?.metricHeaders?.map(x=>x.name);
  if(!Array.isArray(names)||!Array.isArray(report?.rows)) return null;
  return report.rows.map(row=>({key:row.dimensionValues?.map(x=>x.value)||[],metrics:Object.fromEntries(names.map((name,i)=>[name,strictNumber(row.metricValues?.[i]?.value)]))}));
}
