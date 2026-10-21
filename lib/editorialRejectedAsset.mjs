import {rejectedEditorialAssets} from '../editorial/image-review/rejected-assets.mjs';
export function editorialAssetRejected(draft={},qa={}) {
  const versions=[draft.image_asset_version,draft.asset_version,qa.asset_version].filter(Boolean);
  const hashes=Object.entries(qa.scene_grounding?.asset_hashes||{}).filter(([key])=>key!=='source').map(([,value])=>value);
  for(const v of Object.values(qa.thumbnail_typography_acceptance?.deterministic?.variants||{}))if(v.asset_sha256)hashes.push(v.asset_sha256);
  return rejectedEditorialAssets.some(r=>versions.includes(r.asset_version)||r.sha256.some(h=>hashes.includes(h)));
}
