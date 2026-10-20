// Conflicting evidence is a review hold, never permission to alter scores,
// promote a failed asset, or buy another generation hoping for a PASS vote.
export function compareUnchangedPhotoQc(previous,current) {
 const before=previous?.scene_grounding?.asset_hashes,after=current?.scene_grounding?.asset_hashes;
 if(!before?.scene||before.scene!==after?.scene||!before.source||before.source!==after?.source)
   return {comparable:false,conflicts:[],paid_retry_allowed:false,reason:'SOURCE_OR_RAW_CHANGED'};
 const conflicts=[];
 for(const field of ['room_geometry_preserved','equipment_layout_preserved','night_atmosphere_visible']){
  const a=previous.owner_finish_qc?.[field],b=current.owner_finish_qc?.[field];
  if(typeof a==='boolean'&&typeof b==='boolean'&&a!==b)conflicts.push({field,previous:a,current:b});
 }
 if(typeof previous.r7_comparison?.pass==='boolean'&&typeof current.r7_comparison?.pass==='boolean'&&previous.r7_comparison.pass!==current.r7_comparison.pass)
  conflicts.push({field:'r7_photographic_comparison',previous:previous.r7_comparison.pass,current:current.r7_comparison.pass});
 return {comparable:true,source_sha256:before.source,raw_sha256:before.scene,conflicts,
  status:conflicts.length?'INDEPENDENT_QC_CONFLICT_REVIEW_REQUIRED':'NO_RAW_QC_CONFLICT',
  paid_retry_allowed:false,quality_pass:false,
  next_action:conflicts.length?'Review the actual source/RAW and localized evidence; preserve both verdicts. Do not regenerate or repeat QC solely to obtain PASS.':'Honor the current independent QC and normal quality gates.'};
}
