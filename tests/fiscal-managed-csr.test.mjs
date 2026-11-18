import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createManagedSimulationCsr,verifyManagedSimulationCsr} from '../api/_fiscal/managed-csr.js';
const scope={environment:'simulation',accountUid:'owner',workspaceId:'qa',egsId:'egs'};
const issuer={accountUid:'owner',workspaceId:'qa',issuerCountry:'SA',saRegime:'phase-2',legalName:'منشأة اختبار',vatNumber:'300000000000003'};
const unit={egsId:'egs',serialNumber:'1-LOUREX|2-INVOICE|3-qa-unit',organizationUnit:'Riyadh',commonName:'Test unit',registeredAddress:'Riyadh',businessCategory:'Trading',functionalityMap:'1100'};
function fixture(){
 const keys=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),spki=keys.publicKey.export({format:'der',type:'spki'});
 const binding={...scope,keyVersion:'test-only',protectionLevel:'HSM',publicKeyDigest:createHash('sha256').update(spki).digest('hex')};
 const signer={getPublicKey:async()=>spki,sign:async(s,v)=>{assert.deepEqual(s,scope);assert.equal(v.purpose,'csr');assert.equal(v.encoding,'der');return sign('sha256',v.bytes,keys.privateKey);}};
 return {scope,issuer,unit,binding,signer};
}
test('managed CSR independently parses and verifies with OpenSSL and matches exact approved identity',async()=>{
 const f=fixture(),r=await createManagedSimulationCsr(f),csr=Buffer.from(r.csr,'base64');
 assert.equal(createHash('sha256').update(csr).digest('hex'),r.csrDigest);
 const p=spawnSync('openssl',['req','-verify','-noout','-text'],{input:csr,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/secp256k1/);assert.match(p.stdout,/PREZATCA-Code-Signing/);assert.match(p.stdout,/300000000000003/);assert.match(p.stdout,/1-LOUREX/);
 assert.equal(verifyManagedSimulationCsr({...f,csr,publicKey:r.publicKey}),true);
 assert.equal(verifyManagedSimulationCsr({...f,issuer:{...issuer,vatNumber:'300000000000013'},csr,publicKey:r.publicKey}),false);
 assert.equal(verifyManagedSimulationCsr({...f,unit:{...unit,functionalityMap:'1000'},csr,publicKey:r.publicKey}),false);
});
test('production, wrong signer digest, invalid group member and non-HSM key are rejected',async()=>{
 const f=fixture();for(const patch of [{scope:{...scope,environment:'production'}},{binding:{...f.binding,publicKeyDigest:'0'.repeat(64)}},{binding:{...f.binding,protectionLevel:'SOFTWARE'}},{issuer:{...issuer,vatNumber:'300000000010003'}},{unit:{...unit,serialNumber:'bad'}}])await assert.rejects(createManagedSimulationCsr({...f,...patch}));
});
test('CSR tampering, foreign public key and malformed PEM are rejected',async()=>{
 const f=fixture(),r=await createManagedSimulationCsr(f),csr=Buffer.from(r.csr,'base64');
 assert.equal(verifyManagedSimulationCsr({...f,csr:Buffer.from(csr.toString().replace('BEGIN','BEXIN')),publicKey:r.publicKey}),false);
 const other=await createManagedSimulationCsr(fixture());assert.equal(verifyManagedSimulationCsr({...f,csr,publicKey:other.publicKey}),false);
});
