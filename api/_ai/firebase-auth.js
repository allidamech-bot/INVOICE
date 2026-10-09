import {createVerify} from 'node:crypto';

// Firebase's published Secure Token signing certificates. No admin service-account
// secret or third-party JWT package is required by this read-only verification.
const FIREBASE_PROJECT_ID='lourex-invoice';
const FIREBASE_CERTS_URL='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cachedCerts=null;
let certsExpireAt=0;
let certsRequest=null;

async function firebaseSigningCerts(){
  if(cachedCerts&&Date.now()<certsExpireAt)return cachedCerts;
  if(!certsRequest){
    certsRequest=(async()=>{
      const response=await fetch(FIREBASE_CERTS_URL,{signal:AbortSignal.timeout(6000)});
      if(!response.ok)throw new Error('Firebase signing certificates are temporarily unavailable.');
      const certs=await response.json();
      if(!certs||typeof certs!=='object'||Array.isArray(certs)||!Object.values(certs).some(value=>typeof value==='string'&&value.includes('BEGIN CERTIFICATE')))throw new Error('Invalid Firebase signing certificate response.');
      const match=String(response.headers.get('cache-control')||'').match(/(?:^|,)\s*max-age=(\d+)/i);
      const ttl=Math.max(60,Math.min(Number(match?.[1]||300),21600));
      cachedCerts=certs;
      certsExpireAt=Date.now()+ttl*1000;
      return certs;
    })().finally(()=>{certsRequest=null;});
  }
  return certsRequest;
}

function decodePart(part){
  if(typeof part!=='string'||part.length>12000||!/^[A-Za-z0-9_-]+$/.test(part))return null;
  try{const value=JSON.parse(Buffer.from(part,'base64url').toString('utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
}

export async function verifyFirebaseIdToken(authorization,nowSeconds=Math.floor(Date.now()/1000),certificateProvider=firebaseSigningCerts){
  const match=typeof authorization==='string'?authorization.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i):null;
  if(!match||match[1].length>16000)return null;
  const [headerPart,payloadPart,signaturePart]=match[1].split('.');
  const header=decodePart(headerPart),claims=decodePart(payloadPart);
  if(!header||!claims||header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||header.kid.length>200)return null;
  if(claims.aud!==FIREBASE_PROJECT_ID||claims.iss!==`https://securetoken.google.com/${FIREBASE_PROJECT_ID}`)return null;
  if(typeof claims.sub!=='string'||!claims.sub||claims.sub.length>128)return null;
  if(!Number.isSafeInteger(claims.exp)||claims.exp<=nowSeconds||!Number.isSafeInteger(claims.iat)||claims.iat>nowSeconds||claims.iat<=0)return null;
  if(!Number.isSafeInteger(claims.auth_time)||claims.auth_time>nowSeconds||claims.auth_time<=0)return null;
  const certs=await certificateProvider();
  if(!Object.hasOwn(certs,header.kid)||typeof certs[header.kid]!=='string')return null;
  const verifier=createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  verifier.end();
  if(!verifier.verify(certs[header.kid],Buffer.from(signaturePart,'base64url')))return null;
  return{uid:claims.sub,authTime:claims.auth_time};
}

export async function requireAiAuth(request,response,sendJson){
  let verified=null;
  try{verified=await verifyFirebaseIdToken(request.headers?.authorization);}
  catch{
    sendJson(response,503,{code:'AI_AUTH_UNAVAILABLE',message:'Unable to verify the LOUREX account session right now. Retry shortly.'});
    return null;
  }
  if(!verified){
    sendJson(response,401,{code:'AI_AUTH_REQUIRED',message:'Sign in to your LOUREX account to use AI, then retry.'});
    return null;
  }
  return verified;
}
