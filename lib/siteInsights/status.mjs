export const STATES = Object.freeze(['VALUE','ZERO','UNKNOWN','NOT_CONFIGURED','DELAYED','ERROR','STALE']);
export const ok = m => m?.status === 'VALUE' || m?.status === 'ZERO';
export function metric(value, unit, source, meta = {}) {
  const valid = typeof value === 'number' && Number.isFinite(value);
  return { status: valid ? (value === 0 ? 'ZERO' : 'VALUE') : 'UNKNOWN', value: valid ? value : null, unit, source, asOf: meta.asOf || null, ...meta };
}
export function unavailable(status, unit, source, reasonCode, meta = {}) {
  if (!STATES.includes(status) || status === 'ZERO' || status === 'VALUE') throw new TypeError('Invalid unavailable state');
  return { status, value:null, unit, source, asOf:null, reasonCode, ...meta };
}
export function delta(current, previous) {
  const source = current.source;
  if (!ok(current) || !ok(previous)) return {absolute:unavailable('UNKNOWN',current.unit,source,'comparison_unavailable'),percent:unavailable('UNKNOWN','ratio',source,'comparison_unavailable')};
  const absolute = metric(current.value-previous.value,current.unit,source);
  return {absolute,percent:previous.value === 0 ? unavailable('UNKNOWN','ratio',source,'baseline_zero') : metric((current.value-previous.value)/previous.value,'ratio',source)};
}
export function overallStatus(health) {
  const good=['search','ga4'].filter(key=>['VALUE','ZERO'].includes(health[key]?.status)).length;
  return good===2?'OK':good===1?'PARTIAL':'UNAVAILABLE';
}
