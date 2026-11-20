#!/usr/bin/env bash
set -euo pipefail
# One-off staged build. No Git push, alias assignment, database write or ZATCA call.
# The operator must already have an authenticated Vercel CLI session.
command -v vercel >/dev/null || { echo 'Install Vercel CLI: npm install -g vercel'; exit 1; }
vercel whoami >/dev/null || { echo 'Run vercel login first'; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/.vercel"
cat > "$work/.vercel/project.json" <<'JSON'
{"orgId":"team_HjifUInQJEFAzzyuhFW9o6Wh","projectId":"prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ","projectName":"invoice"}
JSON
cat > "$work/package.json" <<'JSON'
{"name":"lourex-oidc-readonly-probe","private":true,"type":"module","scripts":{"build":"node probe.mjs"},"engines":{"node":"24.x"}}
JSON
cat > "$work/vercel.json" <<'JSON'
{"framework":null,"buildCommand":"node probe.mjs","installCommand":"echo No dependencies","outputDirectory":"public","git":{"deploymentEnabled":false}}
JSON
cat > "$work/probe.mjs" <<'JS'
import {mkdirSync,writeFileSync} from 'node:fs';
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
mkdirSync('public',{recursive:true});writeFileSync('public/index.html','<!doctype html><title>LOUREX probe</title>Read-only connectivity probe completed.');
JS
cd "$work"
echo 'Staging a read-only build for invoice; never promotes or updates the live domain.'
vercel deploy --prod --skip-domain --scope alidaamishs-projects --yes --logs
echo 'Inspect LOUREX_OIDC_PROBE lines only. Do not promote this deployment.'
