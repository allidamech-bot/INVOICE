import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {createManagedEnrollmentLifecycle} from '../api/_fiscal/managed-enrollment.js';
const scope={environment:'simulation',accountUid:'owner',workspaceId:'qa',egsId:'egs'},base='fiscalPrivateV1/owner/workspaces/qa',unit=base+'/egs/egs';
function fixture(){
 const keys=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),spki=keys.publicKey.export({type:'spki',format:'der'});
 const config={...scope,state:'approved',pilotAuthorized:true,issuer:{accountUid:'owner',workspaceId:'qa',issuerCountry:'SA',saRegime:'phase-2',legalName:'Synthetic company',vatNumber:'300000000000003'},unit:{egsId:'egs',serialNumber:'1-LOUREX|2-INVOICE|3-test',organizationUnit:'Riyadh',commonName:'Test unit',registeredAddress:'Riyadh',businessCategory:'Trading',functionalityMap:'1100'},keyBinding:{...scope,keyVersion:'synthetic',publicKeyDigest:createHash('sha256').update(spki).digest('hex'),protectionLevel:'HSM'}};
 const rows=new Map([[base,{...scope,syntheticOnly:true,commandsEnabled:true,selectedEgsId:'egs'}],[unit,{...scope,active:false}],[unit+'/enrollment/config',config]]);
 let tail=Promise.resolve(),signed=0;
 const db={doc:path=>({path}),runTransaction(fn){const job=tail.then(async()=>{const staged=new Map(structuredClone([...rows]));let wrote=false;const tx={async get(r){assert(!wrote);return {exists:staged.has(r.path),data:()=>structuredClone(staged.get(r.path))};},create(r,v){wrote=true;assert(!staged.has(r.path));staged.set(r.path,structuredClone(v));},update(r,v){wrote=true;staged.set(r.path,{...staged.get(r.path),...structuredClone(v)});}};const ret=await fn(tx);rows.clear();for(const [k,v] of staged)rows.set(k,v);return ret;});tail=job.catch(()=>{});return job;}};
 const lifecycle=createManagedEnrollmentLifecycle({db,resolveSigner:async()=>({getPublicKey:async()=>spki,sign:async(s,v)=>{signed++;return sign('sha256',v.bytes,keys.privateKey);}}),vault:{load:async()=>{throw Error('no certificate');}},resolveProtectedSession:async()=>{throw Error('no protected session');}});
 return {rows,config,lifecycle,signed:()=>signed};
}
test('CSR prepared from approved private configuration, persisted once and verified against exact key and identity',async()=>{
 const f=fixture(),r=await f.lifecycle.prepareCsr(scope);assert.equal(r.state,'csr-ready');assert.deepEqual(await f.lifecycle.prepareCsr(scope),r);assert.equal(f.signed(),1);
 const p=f.rows.get(unit+'/enrollment/approved');assert.equal(await f.lifecycle.verifyCsr({scope,issuer:p.issuer,keyBinding:p.keyBinding,csr:Buffer.from(p.csr,'base64'),functionalityMap:p.functionalityMap}),true);
 assert.equal(await f.lifecycle.verifyCsr({scope,issuer:{...p.issuer,legalName:'Other'},keyBinding:p.keyBinding,csr:Buffer.from(p.csr,'base64'),functionalityMap:p.functionalityMap}),false);
});
test('no approved pilot, modified identity, foreign scope or incomplete enrollment can activate',async()=>{
 const f=fixture();await assert.rejects(f.lifecycle.activate(scope));await f.lifecycle.prepareCsr(scope);await assert.rejects(f.lifecycle.activate(scope));
 f.rows.set(unit+'/enrollment/config',{...f.config,pilotAuthorized:false});await assert.rejects(f.lifecycle.prepareCsr(scope));
 f.rows.set(unit+'/enrollment/config',{...f.config,issuer:{...f.config.issuer,legalName:'Different'}});await assert.rejects(f.lifecycle.prepareCsr(scope));
 await assert.rejects(f.lifecycle.prepareCsr({...scope,accountUid:'other'}));assert.equal(f.rows.get(unit).active,false);
});
