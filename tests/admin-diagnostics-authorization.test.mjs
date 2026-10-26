import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {generateKeyPairSync,sign} from 'node:crypto';
import core from '../api/ai-core.js';
import {diagnosticsOwnerUidAllowed} from '../api/_ai/admin-diagnostics-auth.js';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('owner-only diagnostics fail closed for every other Firebase UID',()=>{
 const uid='SyntheticOwnerUid012345678901';
 assert.equal(diagnosticsOwnerUidAllowed(uid,uid),true);
 assert.equal(diagnosticsOwnerUidAllowed('SyntheticOtherUid012345678901',uid),false);
 assert.equal(diagnosticsOwnerUidAllowed(uid,''),false);
 assert.equal(diagnosticsOwnerUidAllowed(uid,undefined),false);
 assert.equal(diagnosticsOwnerUidAllowed('owner','owner'),false);
 const gate=src('api/_ai/admin-diagnostics-auth.js'),endpoint=src('api/ai-core.js');
 assert.match(gate,/requireAiFirebaseAuth\(request,response\)/);
 assert.match(gate,/request\.aiVerifiedUid/);
 assert.match(gate,/process\.env\.LOUREX_AI_DIAGNOSTICS_ADMIN_UID/);
 assert.match(endpoint,/diagnosticsOwnerUidAllowed\(request\.aiVerifiedUid,process\.env\.LOUREX_AI_DIAGNOSTICS_ADMIN_UID\)/);
 assert.match(endpoint,/if\(!sameOriginRequest\(request\)\)/);
});
test('full diagnostics are gated even for direct URLs and generic recovery cannot copy logs',()=>{
 const h=src('public/health.html'),js=src('public/health.js'),ui=src('public/settings-diagnostics-entry-v344.js');
 assert.match(h,/<main hidden>/);
 assert.match(js,/if\(!await ownerPermission\(\)\)/);
 assert.match(js,/if\(main\)main.hidden=false/);
 assert.match(ui,/if\(!ownerDiagnosticsAllowed\)/);
 assert.match(ui,/api\/ai-core/);
 assert.doesNotMatch(src('src/app/AuthScreenSelector.tsx'),/health\.html/);
 assert.doesNotMatch(src('src/app/AppErrorBoundary.tsx'),/health\.html|unified\?\.exportText\(\)/);
});

test('live API gate accepts only a signed token belonging to the configured owner UID',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const kid='owner-qa-signing-key';
 const signingJwk={...publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
 const makeToken=(uid,role='viewer')=>{
   const now=Math.floor(Date.now()/1000);
   const head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid})).toString('base64url');
   const claims={aud:'lourex-invoice',iss:'https://securetoken.google.com/lourex-invoice',sub:uid,iat:now-30,exp:now+3600,auth_time:now-30,lourexAiRole:role};
   const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
   const signed=head+'.'+payload;
   return signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
 };
 const call=async(auth,origin='https://invoice-three-puce.vercel.app',diagnosticAction='access-check',body='{}')=>{
   const req=Readable.from([body]);
   req.method='POST';
   req.headers={host:'invoice-three-puce.vercel.app',origin,'x-requested-with':'LOUREX-Invoice',
     'x-lourex-admin-diagnostics':diagnosticAction,...(auth?{authorization:'Bearer '+auth}:{})};
   const res={statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},
     end(raw){this.body=JSON.parse(String(raw||'{}'));}};
   await core(req,res);return res;
 };
 const owner='SyntheticOwnerUid012345678901',stranger='SyntheticOtherUid012345678901';
 const previousFetch=globalThis.fetch;
 const previousAllow=process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID;
 let providerCalls=0;
 globalThis.fetch=async url=>{
   if(!String(url).includes('service_accounts/v1/jwk/')){providerCalls++;throw Error('AI inference must never run during owner-only diagnostics authorization checks');}
   return{ok:true,headers:new Headers({'cache-control':'public, max-age=30'}),json:async()=>({keys:[signingJwk]})};
 };
 process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID=owner;
 try{
   const missing=await call(null);
   assert.equal(missing.statusCode,401);
   const other=await call(makeToken(stranger,'owner'));
   assert.equal(other.statusCode,403,'signed operational owner role must not grant global diagnostics access');
   const authorized=await call(makeToken(owner,'viewer'));
   assert.equal(authorized.statusCode,200,'correct verified Firebase UID alone grants access');
   assert.deepEqual(authorized.body,{allowed:true});
   assert.equal(authorized.headers['Cache-Control'],'no-store');
   const inventory=await call(makeToken(owner,'viewer'),'https://invoice-three-puce.vercel.app','provider-inventory');
   assert.equal(inventory.statusCode,200);
   assert.equal(inventory.headers['Cache-Control'],'no-store');
   assert.deepEqual(inventory.body.providers.map(row=>row.provider),
     ['groq','cloudflare','gemini','kilo','openrouter','ollama']);
   const deniedInventory=await call(makeToken(stranger,'owner'),
     'https://invoice-three-puce.vercel.app','provider-inventory');
   assert.equal(deniedInventory.statusCode,403);
   const missingInventory=await call(null,'https://invoice-three-puce.vercel.app','provider-inventory');
   assert.equal(missingInventory.statusCode,401);
   const deniedProbe=await call(makeToken(stranger,'owner'),'https://invoice-three-puce.vercel.app','provider-probe');
   assert.equal(deniedProbe.statusCode,403,'team owners are not diagnostics administrators');
   const deniedFinance=await call(makeToken(stranger,'owner'),'https://invoice-three-puce.vercel.app',
     'provider-probe',JSON.stringify({provider:'kilo',mode:'financial'}));
   assert.equal(deniedFinance.statusCode,403,'employee owners cannot trigger the five-case financial QA suite');
   const invalidMode=await call(makeToken(owner,'viewer'),'https://invoice-three-puce.vercel.app',
     'provider-probe',JSON.stringify({provider:'kilo',mode:'paid'}));
   assert.equal(invalidMode.statusCode,400,'the administrator cannot change the fixed financial QA suite');
   assert.equal(invalidMode.body?.code,'INVALID_DIAGNOSTIC_MODE');
   const invalidProvider=await call(makeToken(owner,'viewer'),'https://invoice-three-puce.vercel.app','provider-probe');
   assert.equal(invalidProvider.statusCode,400,'owner may not pick arbitrary provider models');
   assert.equal(invalidProvider.body?.code,'INVALID_DIAGNOSTIC_PROVIDER');
   const foreignOrigin=await call(makeToken(owner),'https://untrusted.example');
   assert.equal(foreignOrigin.statusCode,403,'even an owner token must respect origin guard');
   process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID='';
   const unconfigured=await call(makeToken(owner));
   assert.equal(unconfigured.statusCode,403,'fail closed when no owner UID configured');
   assert.equal(providerCalls,0,'access checks must not call any AI provider');
 }finally{
   globalThis.fetch=previousFetch;
   if(previousAllow===undefined)delete process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID;
   else process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID=previousAllow;
 }
});
