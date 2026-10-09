import {createPublicKey,verify as verifySignature} from 'node:crypto';

const FIREBASE_PROJECT_ID='lourex-invoice';
const PUBLIC_KEYS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_TOKEN_LENGTH=8192;
const CLOCK_SKEW_SECONDS=60;
let cachedKeys=null;
let refreshPromise=null;
let unknownKeyRefreshAfter=0;

class AuthVerifierUnavailable extends Error {}

async function publicKeys(force=false){
  const now=Date.now();
  if(!force&&cachedKeys&&cachedKeys.expiresAt>now)return cachedKeys.keys;
  // An unsigned JWT can claim any kid. Bound forced re-fetches to avoid a
  // public endpoint causing repeated Google JWKS requests on unknown key IDs.
  if(force&&cachedKeys&&cachedKeys.expiresAt>now&&now<unknownKeyRefreshAfter)return cachedKeys.keys;
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    if(force)unknownKeyRefreshAfter=Date.now()+30_000;
    let response;
    try{
      response=await fetch(PUBLIC_KEYS_URL,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    }catch{throw new AuthVerifierUnavailable('Firebase verification keys are temporarily unavailable.');}
    if(!response.ok)throw new AuthVerifierUnavailable('Firebase verification keys are temporarily unavailable.');
    let data;
    try{data=await response.json();}catch{throw new AuthVerifierUnavailable('Firebase verification keys returned invalid JSON.');}
    if(!Array.isArray(data?.keys))throw new AuthVerifierUnavailable('Firebase verification keys are missing.');
    const keys=new Map();
    for(const key of data.keys){
      if(typeof key?.kid==='string'&&key.kty==='RSA'&&key.alg==='RS256'&&key.n&&key.e)keys.set(key.kid,key);
    }
    if(!keys.size)throw new AuthVerifierUnavailable('Firebase verification keys are missing.');
    const match=String(response.headers?.get?.('cache-control')||'').match(/max-age=(\d+)/i);
    const ttl=Math.max(30,Math.min(3600,match?Number(match[1]):300));
    cachedKeys={keys,expiresAt:Date.now()+ttl*1000};
    return keys;
  })().finally(()=>{refreshPromise=null;});
  return refreshPromise;
}

function parsePart(value){
  if(!/^[A-Za-z0-9_-]+$/.test(value)||value.length>8192)throw new Error('Invalid Firebase ID token.');
  return JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
}

export async function verifyFirebaseIdToken(token){
  if(typeof token!=='string'||token.length<100||token.length>MAX_TOKEN_LENGTH)throw new Error('Invalid Firebase ID token.');
  const parts=token.split('.');
  if(parts.length!==3)throw new Error('Invalid Firebase ID token.');
  const [encodedHeader,encodedPayload,encodedSignature]=parts;
  const header=parsePart(encodedHeader),payload=parsePart(encodedPayload);
  if(header?.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||header.typ&&header.typ!=='JWT')throw new Error('Invalid Firebase ID token.');
  const now=Math.floor(Date.now()/1000);
  if(payload?.aud!==FIREBASE_PROJECT_ID||payload.iss!==`https://securetoken.google.com/${FIREBASE_PROJECT_ID}`||
    typeof payload.sub!=='string'||payload.sub.length<1||payload.sub.length>128||
    !Number.isInteger(payload.exp)||payload.exp<=now||
    !Number.isInteger(payload.iat)||payload.iat<=0||payload.iat>now+CLOCK_SKEW_SECONDS||
    !Number.isInteger(payload.auth_time)||payload.auth_time<=0||payload.auth_time>now+CLOCK_SKEW_SECONDS)throw new Error('Invalid Firebase ID token.');
  let keys=await publicKeys();
  if(!keys.has(header.kid))keys=await publicKeys(true);
  const jwk=keys.get(header.kid);
  if(!jwk)throw new Error('Invalid Firebase ID token.');
  let valid=false;
  try{
    valid=verifySignature('RSA-SHA256',Buffer.from(`${encodedHeader}.${encodedPayload}`),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(encodedSignature,'base64url'));
  }catch{throw new Error('Invalid Firebase ID token.');}
  if(!valid)throw new Error('Invalid Firebase ID token.');
  return{uid:payload.sub};
}

export async function requireAiFirebaseAuth(request,response){
  const value=String(request.headers?.authorization||'');
  const match=value.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  if(!match){
    response.statusCode=401;response.setHeader('WWW-Authenticate','Bearer');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('Content-Type','application/json; charset=utf-8');
    response.end(JSON.stringify({code:'AI_AUTH_REQUIRED',message:'Sign in to your LOUREX account to use AI.'}));
    return false;
  }
  try{
    const identity=await verifyFirebaseIdToken(match[1]);
    request.aiVerifiedUid=identity.uid;
    return true;
  }catch(error){
    const unavailable=error instanceof AuthVerifierUnavailable;
    response.statusCode=unavailable?503:401;
    response.setHeader('Cache-Control','no-store');
    response.setHeader('Content-Type','application/json; charset=utf-8');
    if(!unavailable)response.setHeader('WWW-Authenticate','Bearer');
    response.end(JSON.stringify({code:unavailable?'AI_AUTH_UNAVAILABLE':'AI_AUTH_INVALID',
      message:unavailable?'Account verification is temporarily unavailable. Try again.':'Your account session expired. Sign in again.'}));
    return false;
  }
}
