import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createZatcaSimulationClient,createZatcaProductionClient} from '../api/_fiscal/zatca-simulation.js';
import {startOnboarding,startProductionOnboarding,recordComplianceCheck,assertProductionOnboardingReady} from '../api/_fiscal/onboarding.js';
import {createProductionCredentialVault} from '../api/_fiscal/credential-vault.js';
import {createProductionManagedKms} from '../api/_fiscal/managed-kms.js';
import {createProductionManagedSigner} from '../api/_fiscal/managed-signing.js';
const scope={environment:'production',accountUid:'alice',workspaceId:'company1',egsId:'unit1'};
const credential={...scope,kind:'compliance',requestId:1,binarySecurityToken:'Y2VydA==',secret:'secret'};
const digest=x=>createHash('sha256').update(x).digest('hex');
const response=()=>new Response(JSON.stringify({dispositionMessage:'ISSUED',requestID:1,binarySecurityToken:'Y2VydA==',secret:'secret'}),{status:200});
test('production transport denies absent authority and preserves simulation guard',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return response()};
  assert.throws(()=>createZatcaSimulationClient({environment:'production',authorizedScope:scope,fetchImpl}),/PRODUCTION_DISABLED/);
  assert.throws(()=>createZatcaProductionClient({environment:'production',authorizedScope:scope,fetchImpl}),/NOT_CONFIGURED/);
  const c=createZatcaProductionClient({environment:'production',authorizedScope:scope,fetchImpl,authorizeOperation:async()=>false});
  await assert.rejects(c.requestCompliance({otp:'123456',csr:'Y3Ny'}),/NOT_AUTHORIZED/);assert.equal(calls,0);
});
test('exact production core path and scope claim, no OTP in authorizer',async()=>{
  let claim;const c=createZatcaProductionClient({environment:'production',authorizedScope:scope,authorizeOperation:async x=>{claim=x;return true},fetchImpl:async(url,opts)=>{assert.equal(url,'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/compliance');assert.equal(opts.headers.OTP,'123456');return response()}});
  assert.deepEqual(await c.requestCompliance({otp:'123456',csr:'Y3Ny'}),credential);assert.deepEqual(claim,{scope,operation:'compliance-csid',csrDigest:digest('csr')});
});
test('compliance record cannot cross environments or units; three checks required',()=>{
  const input={functionalityMap:'1000',credentialRef:'ref1',csrDigest:digest('csr'),credential};
  assert.throws(()=>startOnboarding(input),/INVALID_COMPLIANCE_CREDENTIAL/);
  let rec=startProductionOnboarding(input);assert.throws(()=>assertProductionOnboardingReady(rec,credential),/COMPLIANCE_NOT_COMPLETE/);
  for(const type of ['standard-invoice','standard-credit','standard-debit'])rec=recordComplianceCheck(rec,rec.version,{type,outcome:'verified-pass',responseDigest:digest(type+'response'),artifactDigest:digest(type)});
  assert.doesNotThrow(()=>assertProductionOnboardingReady(rec,credential));
  assert.throws(()=>assertProductionOnboardingReady(rec,{...credential,egsId:'unit2'}),/BINDING_MISMATCH/);
});
test('credential vault cannot store or unwrap a denied company; separate private path',async()=>{
  const docs=new Map();let wrapped=0,unwrapped=0;
  const db={doc:x=>x,runTransaction:async fn=>fn({get:async p=>({exists:docs.has(p),data:()=>docs.get(p)}),create:(p,v)=>docs.set(p,v)})};
  const vault=createProductionCredentialVault({db,authorizeScope:async(_tx,c)=>c.workspaceId==='company1',wrapKey:async({key})=>{wrapped++;return {keyId:'test-only',wrappedKey:Buffer.from(key)}},unwrapKey:async({wrappedKey})=>{unwrapped++;return Buffer.from(wrappedKey)}});
  await assert.rejects(vault.store({...scope,workspaceId:'company2'},'ref1',{...credential,workspaceId:'company2'}),/STORE_FAILED/);assert.equal(wrapped,0);
  await vault.store(scope,'ref1',credential);
  assert.equal([...docs.keys()][0],'fiscalProductionV1/alice/workspaces/company1/egs/unit1/productionCredentials/ref1');
  assert.deepEqual(await vault.load(scope,'ref1','compliance'),credential);
  await assert.rejects(vault.load({...scope,workspaceId:'company2'},'ref1','compliance'),/LOAD_FAILED/);assert.equal(unwrapped,1);
  await assert.rejects(vault.load({...scope,environment:'simulation'},'ref1','compliance'),/PRODUCTION_CREDENTIALS_ONLY/);
});
test('production KMS rejects QA project; signer requires registered binding and rejects cross-company scope',async()=>{
  const qa='test-fiscal-qa',keyName='projects/'+qa+'/locations/global/keyRings/r/cryptoKeys/k';
  assert.throws(()=>createProductionManagedKms({projectId:qa,keyName,getAccessToken:async()=>''}),/KMS_NOT_CONFIGURED/);
  const projectId='lourex-prod',binding={...scope,keyVersion:'projects/'+projectId+'/locations/global/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',publicKeyDigest:digest('test'),protectionLevel:'HSM'};
  let calls=0;const opts={projectId,binding,getAccessToken:async()=>{calls++;return 'token'}};
  assert.throws(()=>createProductionManagedSigner(opts),/SIGNING_NOT_CONFIGURED/);
  const signer=createProductionManagedSigner({...opts,authorizeBinding:async()=>false});
  await assert.rejects(signer.getPublicKey(scope),/SIGNING_SCOPE_MISMATCH/);
  await assert.rejects(signer.getPublicKey({...scope,workspaceId:'company2'}),/SIGNING_SCOPE_MISMATCH/);assert.equal(calls,0);
});
