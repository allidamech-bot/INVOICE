/**
 * R07B server-only bridge: verified Firebase JWT -> R03 VerifiedPrincipal.
 *
 * Token payload timestamps are read ONLY AFTER verifying the exact same JWT
 * with the existing RSA-signature/audience/issuer/expiry/role verifier.
 * A decoded JWT by itself is NEVER evidence of identity.
 *
 * This module creates no endpoint, imports no financial backend, and never
 * accepts company/branch authority from JWT custom strings or browser JSON.
 */
import {verifyFirebaseIdToken} from '../_ai/firebase-auth.js';

export const R07B_AUTHENTICATED_API_ENABLED=false;
const MAX_JWT_BYTES=8192;
const ROLES=new Set(['owner','admin','finance','sales','purchasing','viewer']);

export class R07BIdentityError extends Error {
  constructor(code){super(code);this.code=code;}
}
function decodeVerifiedPayload(token){
  const part=token.split('.')[1];
  if(!part||!/^[A-Za-z0-9_-]+$/.test(part)||part.length>MAX_JWT_BYTES)
    throw new R07BIdentityError('R07_INVALID_TOKEN_ENCODING');
  let parsed;
  try{parsed=JSON.parse(Buffer.from(part,'base64url').toString('utf8'));}
  catch{throw new R07BIdentityError('R07_INVALID_TOKEN_ENCODING');}
  if(!parsed || Array.isArray(parsed) || typeof parsed!=='object')
    throw new R07BIdentityError('R07_INVALID_TOKEN_ENCODING');
  return parsed;
}
/**
 * Production call MUST omit verify; it defaults to the existing real
 * cryptographic Firebase verifier. The optional verifier is a test seam.
 * No callback or secret material is returned in the principal.
 */
export async function verifyR07FirebasePrincipal(token,serverNowEpochSeconds,
  verify=verifyFirebaseIdToken){
  if(typeof token!=='string'||token.length<100||token.length>MAX_JWT_BYTES||
    token.split('.').length!==3||!Number.isSafeInteger(serverNowEpochSeconds)||
    serverNowEpochSeconds<1)
    throw new R07BIdentityError('R07_INVALID_AUTH_REQUEST');
  let signed;
  try{signed=await verify(token);}
  catch{throw new R07BIdentityError('R07_TOKEN_NOT_VERIFIED');}
  // Identity and role originate exclusively in the signature-verified result.
  if(!signed||typeof signed.uid!=='string'||signed.uid.length<1||
    signed.uid.length>128||!ROLES.has(signed.role))
    throw new R07BIdentityError('R07_INVALID_VERIFIED_IDENTITY');
  const payload=decodeVerifiedPayload(token);
  if(payload.sub!==signed.uid||
    !Number.isSafeInteger(payload.iat)||!Number.isSafeInteger(payload.exp)||
    !Number.isSafeInteger(payload.auth_time)||
    payload.iat<1||payload.auth_time<1||payload.iat>serverNowEpochSeconds+60||
    payload.auth_time>serverNowEpochSeconds+60||
    payload.exp<=serverNowEpochSeconds||
    payload.firebase?.sign_in_provider==='anonymous')
    throw new R07BIdentityError('R07_INVALID_SIGNED_TOKEN_CLAIMS');
  return Object.freeze({
    uid:signed.uid,
    role:signed.role,
    tokenIssuedAt:payload.iat,
    tokenExpiresAt:payload.exp,
    authenticatedAt:payload.auth_time,
    anonymous:false,
  });
}
