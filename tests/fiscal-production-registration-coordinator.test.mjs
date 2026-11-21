import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {createProductionRegistrationCoordinator} from '../api/_fiscal/production-registration-coordinator.js';
import {fiscalCompanySourceDigest} from '../api/_fiscal/production-profile.js';
import {crc32c} from '../api/_fiscal/managed-kms.js';
const company={country:'SA',nameAr:'شركة اختبار',nameEn:'Test',vatNumber:'300000000000003',commercialRegistration:'1010123456',addressAr:'Riyadh',city:'Riyadh'};
const id={uid:'owner',role:'owner'},request={workspaceId:'company',branchId:'branch',keyVersion:'projects/lourex-invoice/locations/global/keyRings/test/cryptoKeys/key/cryptoKeyVersions/1',eligibilityEvidenceDigest:'a'.repeat(64),effectiveFrom:'2026-11-20',organizationUnit:'Branch',expectedProfileVersion:1};
function fixture({protectionLevel='HSM',stale=false,owner='owner'}={}){
 const s={environment:'production',accountUid:owner,workspaceId:'company'};
 const p={...s,state:'pending-verification',version:1,sourceDigest:fiscalCompanySourceDigest(company),details:{street:'Street',district:'District',buildingNumber:'1234',postalCode:'12345',sellerIdScheme:'CRN',otherSellerId:''}};
 const q={...s,branchId:'branch',state:'pending',profileVersion:stale?2:1,sourceDigest:p.sourceDigest,functionalityMap:'1100',businessCategory:'Retail'};
 const pem=generateKeyPairSync('ec',{namedCurve:'secp256k1'}).publicKey.export({format:'pem',type:'spki'});
 let calls=0,network=0,registered;
 const db={doc:p=>p,runTransaction:async f=>f({get:async path=>({exists:true,data:()=>path.endsWith('/profiles/current')?p:q})})};
 const register=createProductionRegistrationCoordinator({db,loadWorkspace:async()=>({company,branches:[{id:'branch',workspaceId:'company',active:true}]}),authority:{registerUnit:async(i,v)=>{calls++;registered=v;assert.equal(i.uid,'owner');return {egsId:v.scope.egsId,state:'enrolling'};}},kmsProjectId:'lourex-invoice',getAccessToken:async()=>'synthetic',fetchImpl:async url=>{network++;assert.equal(url,'https://cloudkms.googleapis.com/v1/'+request.keyVersion+'/publicKey');return new Response(JSON.stringify({name:request.keyVersion,algorithm:'EC_SIGN_SECP256K1_SHA256',protectionLevel,pem,pemCrc32c:String(crc32c(Buffer.from(pem)))}));}});
 return {register,get calls(){return calls;},get network(){return network;},get registered(){return registered;}};
}
test('registers deterministic branch scope using actual KMS public key metadata',async()=>{const f=fixture();const a=await f.register(id,request),b=await f.register(id,request);assert.equal(a.egsId,b.egsId);assert.match(a.egsId,/^egs-[a-f0-9]{40}$/);assert.equal(f.registered.binding.protectionLevel,'HSM');assert.match(f.registered.binding.publicKeyDigest,/^[a-f0-9]{64}$/);assert.equal(f.registered.issuer.vatNumber,company.vatNumber);assert.equal(f.calls,2);});
test('rejects software key, stale source, foreign account and client supplied binding',async()=>{const soft=fixture({protectionLevel:'SOFTWARE'});await assert.rejects(soft.register(id,request),/HSM_NOT_VERIFIED/);assert.equal(soft.calls,0);for(const f of [fixture({stale:true}),fixture({owner:'other'})]){await assert.rejects(f.register(id,request));assert.equal(f.network,0);assert.equal(f.calls,0);}const f=fixture();await assert.rejects(f.register(id,{...request,privateKey:'bad'}));assert.equal(f.network,0);});
