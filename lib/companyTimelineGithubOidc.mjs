import crypto from 'node:crypto';

const ISSUER='https://token.actions.githubusercontent.com';
const AUDIENCE='the-rev-company-timeline';
const ALLOWED_REPOSITORY='maxi001maxi/the-rev-ops';

function b64url(input){
  const s=String(input||'').replace(/-/g,'+').replace(/_/g,'/');
  return Buffer.from(s+'='.repeat((4-s.length%4)%4),'base64');
}

export async function verifyGithubActionsOidc(token,{fetchImpl=fetch,now=Date.now()}={}){
  const parts=String(token||'').split('.');
  if(parts.length!==3) throw new Error('OIDC_MALFORMED');
  let header,payload;
  try{
    header=JSON.parse(b64url(parts[0]).toString('utf8'));
    payload=JSON.parse(b64url(parts[1]).toString('utf8'));
  }catch{
    throw new Error('OIDC_MALFORMED');
  }
  if(header.alg!=='RS256'||!header.kid) throw new Error('OIDC_HEADER_INVALID');

  const jwksRes=await fetchImpl(`${ISSUER}/.well-known/jwks`,{headers:{Accept:'application/json'}});
  if(!jwksRes.ok) throw new Error('OIDC_JWKS_UNAVAILABLE');
  const jwks=await jwksRes.json();
  const jwk=(jwks.keys||[]).find(k=>k.kid===header.kid);
  if(!jwk) throw new Error('OIDC_KID_UNKNOWN');

  const key=crypto.createPublicKey({key:jwk,format:'jwk'});
  const valid=crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    b64url(parts[2])
  );
  if(!valid) throw new Error('OIDC_SIGNATURE_INVALID');

  const nowSec=Math.floor(now/1000);
  if(payload.iss!==ISSUER) throw new Error('OIDC_ISSUER_INVALID');
  const aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(!aud.includes(AUDIENCE)) throw new Error('OIDC_AUDIENCE_INVALID');
  if(Number(payload.exp||0)<=nowSec) throw new Error('OIDC_EXPIRED');
  if(payload.nbf&&Number(payload.nbf)>nowSec+30) throw new Error('OIDC_NOT_YET_VALID');
  if(payload.repository!==ALLOWED_REPOSITORY) throw new Error('OIDC_REPOSITORY_INVALID');
  if(payload.ref!=='refs/heads/main') throw new Error('OIDC_REF_INVALID');
  if(payload.event_name!=='push') throw new Error('OIDC_EVENT_INVALID');

  return payload;
}
