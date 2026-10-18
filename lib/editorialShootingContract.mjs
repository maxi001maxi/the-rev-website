// Shared by the free plan check and the actual generation prompt.
export function editorialShootingContract(brief) {
  const shot=brief?.shot_contract || brief?.shooting_brief;
  if (!shot || !String(shot.subject_action || '').trim() || !String(shot.eyeline || '').trim()) {
    throw new Error('EDITORIAL_SHOOTING_CONTRACT_MISSING');
  }
  return shot;
}
