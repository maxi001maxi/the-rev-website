import { createHash } from 'node:crypto';
export const sha256Bytes = bytes => createHash('sha256').update(bytes).digest('hex');

export function editorialQaBindsAsset(qa, variant, file) {
  const expected=qa?.scene_grounding?.asset_hashes?.[variant] || qa?.thumbnail_typography_acceptance?.deterministic?.variants?.[variant]?.asset_sha256;
  // Legacy accepted cards predate hash-bearing QC. New grounded images must
  // match the exact pixels inspected by QC as well as the delivery bytes.
  return expected ? file?.sha256===expected : !qa?.scene_grounding_version;
}

export async function verifyLiveEditorialAsset(publicPath, file, env = process.env) {
  if (!String(publicPath).startsWith('/assets/') || !file?.sha256 || !(file.size > 0)) return false;
  const base=String(env.PRODUCTION_URL || 'https://therev-lab.com').replace(/\/+$/,'');
  try {
    const response=await fetch(`${base}${publicPath}?rev_asset_check=${Date.now()}`, {
      cache:'no-store', headers:{'Cache-Control':'no-cache'}, signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) return false;
    const bytes=Buffer.from(await response.arrayBuffer());
    return bytes.length===file.size && sha256Bytes(bytes)===file.sha256;
  } catch { return false; }
}
