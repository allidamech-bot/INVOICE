import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {createProductionScopeAuthority} from '../api/_fiscal/production-scope.js';
import {fiscalCompanySourceDigest} from '../api/_fiscal/production-profile.js';
import {createManagedProductionCsr,verifyManagedProductionCsr,verifyManagedSimulationCsr} from '../api/_fiscal/managed-csr.js';
import {createZatcaProductionClient} from '../api/_fiscal/zatca-simulation.js';
const sha=v=>createHash('sha256').update(v).digest('hex');
const scope={environment:'production',accountUid:'owner',workspaceId:'one',egsId:'egs1'};
const company={country:'SA',nameAr:'شركة اختبار',nameEn:'Synthetic',vatNumber:'300000000000003',commercialRegistration:'1010123456',addressAr:'Test',city:'Riyadh'};
const details={street:'Test',district:'District',buildingNumber:'1234',postalCode:'12345',sellerIdScheme:'CRN',otherSellerId:''};
const project='lourex-fiscal-live',owner={uid:'owner',role:'owner'};
const unit={egsId:'egs1',serialNumber:'1-LOUREX|2-1|3-test',organizationUnit:'Riyadh',commonName:'Test EGS',registeredAddress:'Riyadh',functionalityMap:'1100',businessCategory:'Retail'};
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'secp256k1'});
const spki=publicKey.export({type:'spki',format:'der'});
const signing={getPublicKey:async()=>spki,sign:async(_s,p)=>sign('sha256',p.bytes,privateKey)};
function registration(s=scope,version=1){
 return {scope:s,branchId:'main',issuer:{accountUid:s.accountUid,workspaceId:s.workspaceId,issuerCountry:'SA',saRegime:'phase-2',vatNumber:company.vatNumber,legalName:company.nameAr,profileVersion:1,effectiveFrom:'2026-11-19'},unit:{...unit,egsId:s.egsId},binding:{...s,keyVersion:'projects/'+project+'/locations/global/keyRings/fiscal/cryptoKeys/sign1/cryptoKeyVersions/'+version,publicKeyDigest:sha(spki),protectionLevel:'HSM'},eligibilityEvidenceDigest:sha('test-only')};
}
function fixture(options={}){
 const rows=new Map(),workspaces=new Map(),db={doc:p=>p,runTransaction:async fn=>{const writes=[];const r=await fn({get:async p=>({exists:rows.has(p),data:()=>structuredClone(rows.get(p))}),create:(p,v)=>writes.push(()=>{assert(!rows.has(p));rows.set(p,structuredClone(v));}),update:(p,v)=>writes.push(()=>{assert(rows.has(p));rows.set(p,{...rows.get(p),...structuredClone(v)});})});writes.forEach(f=>f());return r;}};
 for(const workspaceId of ['one','two']){
  workspaces.set(workspaceId,{company:{...company},branches:[{id:'main',workspaceId,active:true}]});
  rows.set('fiscalProductionV1/owner/workspaces/'+workspaceId+'/profiles/current',{environment:'production',accountUid:'owner',workspaceId,state:'pending-verification',version:1,sourceDigest:fiscalCompanySourceDigest(company),details});
 }
 const authority=createProductionScopeAuthority({db,loadWorkspace:async(_tx,s)=>{assert.equal(s.accountUid,'owner');return structuredClone(workspaces.get(s.workspaceId));},verifyRegistration:async()=>true,verifyOperation:async()=>true,verifyResult:async()=>true,kmsProjectId:project,clock:()=> '2026-11-20T00:00:00.000Z',...options});
 return {authority,rows,workspaces};
}
test('registration binds both entire HSM key and public digest to one company and EGS',async()=>{
 const {authority,rows}=fixture();const input=registration();
 await assert.rejects(authority.registerUnit({uid:'other',role:'owner'},input));
 await assert.rejects(authority.registerUnit(owner,{...input,branchId:'bad'}));
 assert.deepEqual(await authority.registerUnit(owner,input),{state:'enrolling',egsId:'egs1'});
 assert.equal(await authority.authorizeBinding(input.binding),true);
 assert.equal(rows.get('fiscalProductionV1/owner/workspaces/one/profiles/registration-lock').profileVersion,1);
 assert.deepEqual(await authority.registerUnit(owner,input),{state:'enrolling',egsId:'egs1'});
 const s={...scope,workspaceId:'two',egsId:'egs2'};
 await assert.rejects(authority.registerUnit(owner,registration(s,2)),/KEY_ALREADY_BOUND/);
 assert.equal(await authority.authorizeBinding({...input.binding,workspaceId:'two'}),false);
 assert.equal(await authority.authorizeBinding({...input.binding,environment:'simulation'}),false);
});
test('source changes and absent independent verification block all key operations',async()=>{
 const blocked=fixture({verifyRegistration:async()=>false});await assert.rejects(blocked.authority.registerUnit(owner,registration()),/NOT_VERIFIED/);
 const {authority,workspaces}=fixture();await authority.registerUnit(owner,registration());
 workspaces.get('one').company.vatNumber='300000000000013';
 assert.equal(await authority.authorizeBinding(registration().binding),false);
});
test('production CSR template, cross-environment rejection, exact one-time authority dispatch',async()=>{
 const {authority,rows}=fixture(),input=registration();await authority.registerUnit(owner,input);
 const csr=await createManagedProductionCsr({scope,issuer:input.issuer,unit,binding:input.binding,signer:signing});
 const bytes=Buffer.from(csr.csr,'base64'),der=Buffer.from(bytes.toString().replace(/-----[^-]+-----|\s/g,''),'base64');
 assert(der.includes(Buffer.from('ZATCA-Code-Signing')));assert(!der.includes(Buffer.from('PREZATCA-Code-Signing')));
 assert(!verifyManagedSimulationCsr({scope:{...scope,environment:'simulation'},issuer:input.issuer,unit,binding:{...input.binding,environment:'simulation'},csr:bytes,publicKey:csr.publicKey}));
 await authority.recordCsr(scope,csr);
 const claim={scope,operation:'compliance-csid',csrDigest:csr.csrDigest};
 await authority.reserveAttempt('compliance-csid',claim);
 await assert.rejects(authority.reserveAttempt('compliance-csid',claim),/HELD/);
 const authorizeOperation=authority.operationAuthorizer(scope,'compliance-csid');
 let calls=0;
 const client=createZatcaProductionClient({environment:'production',authorizedScope:scope,authorizeOperation,fetchImpl:async()=>{calls++;throw Error('simulated timeout');}});
 await assert.rejects(client.requestCompliance({otp:'123456',csr:csr.csr}),/UNCERTAIN/);
 await assert.rejects(client.requestCompliance({otp:'654321',csr:csr.csr}),/HELD/);
 assert.equal(calls,1);
 const row=rows.get('fiscalProductionV1/owner/workspaces/one/egs/egs1/authorityAttempts/compliance-csid');
 assert.equal(row.state,'dispatched');assert(!JSON.stringify(row).includes('123456'));
 await authority.recordResult(scope,'compliance-csid',{digest:sha('receipt'),outcome:'verified-pass'});
 await assert.rejects(client.requestCompliance({otp:'654321',csr:csr.csr}),/HELD/);
});
test('unverified operation and altered CSR cannot dispatch, enrolling unit cannot issue',async()=>{
 const {authority}=fixture({verifyOperation:async()=>false});const input=registration();await authority.registerUnit(owner,input);
 const csr=await createManagedProductionCsr({scope,issuer:input.issuer,unit,binding:input.binding,signer:signing});
 await authority.recordCsr(scope,csr);
 await assert.rejects(authority.reserveAttempt('compliance-csid',{scope,operation:'compliance-csid',csrDigest:csr.csrDigest}),/NOT_VERIFIED/);
 await assert.rejects(authority.reserveAttempt('compliance-csid',{scope,operation:'compliance-csid',csrDigest:sha('altered')}));
 const uuid='11111111-1111-4111-8111-111111111111';
 await assert.rejects(authority.reserveAttempt('submit-'+uuid,{scope,operation:'submit',mode:'reporting',uuid,invoiceHash:Buffer.alloc(32).toString('base64'),artifactDigest:sha('xml'),credentialRequestId:1}));
});
