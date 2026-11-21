import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync,rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {prepareFiscalQaPreviewCredential} from '../api/_fiscal/vercel-qa-federation.js';

const envKeys=['VERCEL_ENV','VERCEL_PROJECT_ID','LOUREX_FISCAL_QA_AUTH_MODE','LOUREX_FISCAL_QA_PROJECT_ID','GOOGLE_APPLICATION_CREDENTIALS'];
const owner='alidaamishs-projects',project='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=(now,jti)=>{
 const claim={iss:'https://oidc.vercel.com/'+owner,aud:'https://vercel.com/'+owner,
  sub:'owner:'+owner+':project:invoice:environment:preview',owner,
  project:'invoice',project_id:project,environment:'preview',
  iat:now,nbf:now,exp:now+3600,jti};
 return b64({alg:'RS256',typ:'JWT',kid:'synthetic'})+'.'+b64(claim)+'.'+'x'.repeat(128);
};

test('QA keyless ADC stores only the platform token in a restricted, atomically refreshed private directory',()=>{
 const before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 const now=Math.floor(Date.now()/1000);
 let dir;
 try{
  Object.assign(process.env,{
   VERCEL_ENV:'preview',VERCEL_PROJECT_ID:project,
   LOUREX_FISCAL_QA_AUTH_MODE:'vercel-oidc',LOUREX_FISCAL_QA_PROJECT_ID:'lourex-fiscal-qa'});
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const a=token(now,'one'),b=token(now,'two');
  const path=prepareFiscalQaPreviewCredential({headers:{'x-vercel-oidc-token':a}});
  dir=dirname(path);
  assert.equal(statSync(dir).mode&0o777,0o700);
  assert.equal(statSync(path).mode&0o777,0o600);
  const adc=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(adc.type,'external_account');
  assert(!JSON.stringify(adc).includes(a));
  assert.equal(statSync(adc.credential_source.file).mode&0o777,0o600);
  assert.equal(readFileSync(adc.credential_source.file,'utf8'),a);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS,path);
  const next=prepareFiscalQaPreviewCredential({headers:{'x-vercel-oidc-token':b}});
  assert.equal(next,path);
  assert.equal(readFileSync(adc.credential_source.file,'utf8'),b);
  assert(!JSON.stringify(adc).includes(b));
  process.env.GOOGLE_APPLICATION_CREDENTIALS='/tmp/unauthorized-admin.json';
  assert.throws(()=>prepareFiscalQaPreviewCredential({headers:{'x-vercel-oidc-token':b}}),/FISCAL_QA_FEDERATION_UNAVAILABLE/);
 }finally{
  for(const k of envKeys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
  if(dir)rmSync(dir,{recursive:true,force:true});
 }
});
