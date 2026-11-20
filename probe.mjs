import {mkdirSync,writeFileSync} from 'node:fs';
if(process.env.VERCEL_ENV==='preview'){
 mkdirSync('public',{recursive:true});
 writeFileSync('public/index.html','<!doctype html><title>LOUREX OIDC check</title><h1>LOUREX OIDC check</h1><p>Preview only; no production data accessed. Production build probe required.</p>');
 console.log('LOUREX_OIDC_PROBE PREVIEW_ONLY_NO_GOOGLE_ACCESS');
 process.exit(0);
}
import {randomUUID} from 'node:crypto';
const report=(step,status)=>console.log('LOUREX_OIDC_PROBE '+step+' '+status);
const token=process.env.VERCEL_OIDC_TOKEN;
const project='lourex-invoice';
const claims=()=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'));}catch{return null;}};
const c=claims();
if(process.env.VERCEL_ENV!=='production'||process.env.VERCEL_PROJECT_ID!=='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ'||c?.iss!=='https://oidc.vercel.com/alidaamishs-projects'||c?.aud!=='https://vercel.com/alidaamishs-projects'||c?.sub!=='owner:alidaamishs-projects:project:invoice:environment:production'||!(c.exp>Date.now()/1000+60)){report('scope','FAIL');process.exit(1);}
report('scope','PASS');
async function call(step,url,options,accept){
 let r,body;
 try{r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});body=await r.json();}catch{report(step,'NETWORK_FAIL');throw Error('probe failed');}
 if(!accept(r,body)){report(step,'HTTP_'+r.status);throw Error('probe failed');}
 report(step,'PASS');return body;
}
const audience='//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-vercel/providers/vercel';
const s=await call('STS','https://sts.googleapis.com/v1/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:token-exchange',audience,scope:'https://www.googleapis.com/auth/cloud-platform',requested_token_type:'urn:ietf:params:oauth:token-type:access_token',subject_token_type:'urn:ietf:params:oauth:token-type:jwt',subject_token:token})},(r,b)=>r.ok&&typeof b.access_token==='string');
const a=await call('IAM','https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/lourex-fiscal-runtime@lourex-invoice.iam.gserviceaccount.com:generateAccessToken',{method:'POST',headers:{Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:JSON.stringify({scope:['https://www.googleapis.com/auth/cloud-platform'],lifetime:'600s'})},(r,b)=>r.ok&&typeof b.accessToken==='string');
const h={Authorization:'Bearer '+a.accessToken,'Content-Type':'application/json'};
await call('Firestore','https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/fiscalConnectivityProbes/'+randomUUID(),{headers:h},(r,b)=>r.status===404&&b?.error?.status==='NOT_FOUND');
await call('FirebaseAuth','https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:lookup',{method:'POST',headers:h,body:JSON.stringify({localId:['oidc-probe-'+randomUUID()]})},(r,b)=>r.ok&&(!b.users||Array.isArray(b.users)&&b.users.length===0));
report('RESULT','PASS_READ_ONLY');
console.log('LOUREX_OIDC_PROBE INTENTIONAL_BUILD_STOP: no production application will be published');
process.exit(1);
