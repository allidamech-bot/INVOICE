// Real local PKCS#11 smoke test: synthetic-only, no network, no persistent credentials.
import assert from 'node:assert/strict';
import {createHash,createPublicKey,randomInt,verify} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSoftHsmStagingSigner,stagingKeyLocator,STAGING_PROTECTION} from '../../api/_fiscal/softhsm-staging-signer.js';
import {createSoftHsmStagingCsr,verifySoftHsmStagingCsr,createManagedSimulationCsr,createManagedProductionCsr} from '../../api/_fiscal/managed-csr.js';

process.umask(0o077);
const dir=mkdtempSync(join(tmpdir(),'lourex-pkcs11-qa-'));
const configPath=join(dir,'softhsm.conf'),tokens=join(dir,'tokens');
const helper=fileURLToPath(new URL('./softhsm_staging.py',import.meta.url));
const env={SOFTHSM2_CONF:configPath,PATH:'/usr/bin:/bin',LANG:'C.UTF-8'};
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=()=>String(randomInt(100000000,999999999));
function run(cmd,args,input){
 const r=spawnSync(cmd,args,{input,env,timeout:30000,maxBuffer:16384});
 if(r.error||r.status!==0)throw Error('QA_COMMAND_FAILED: '+cmd);
 return r.stdout;
}
function create(workspaceId){
 const scope={environment:'simulation',accountUid:'synthetic-owner',workspaceId,egsId:'synthetic-egs'};
 const locator=stagingKeyLocator(scope),userPin=pin(),soPin=pin();
 // Only throwaway synthetic PINs are passed to the token-init utility.
 run('/usr/bin/softhsm2-util',['--init-token','--free','--label',locator.token,'--so-pin',soPin,'--pin',userPin]);
 const result=JSON.parse(run('/usr/bin/python3',['-E','-s',helper],JSON.stringify({op:'provision',token:locator.token,keyId:locator.keyId,pin:userPin})));
 const spki=Buffer.from(result.spki,'base64');
 const binding={...scope,keyVersion:locator.keyVersion,publicKeyDigest:sha(spki),protectionLevel:STAGING_PROTECTION};
 const options={binding,configPath,readPin:async()=>userPin};
 return {scope,binding,spki,options,signer:createSoftHsmStagingSigner(options)};
}
try{
 mkdirSync(tokens,{mode:0o700});writeFileSync(configPath,'directories.tokendir = '+tokens+'\nobjectstore.backend = file\nlog.level = ERROR\n');
 const a=create('synthetic-a'),b=create('synthetic-b');
 assert.notDeepEqual(a.spki,b.spki);
 const msg=Buffer.from('synthetic LOUREX protected signing');
 for(const f of [a,b]){
   assert.deepEqual(await f.signer.getPublicKey(f.scope),f.spki);
   const der=await f.signer.sign(f.scope,{purpose:'csr',bytes:msg,encoding:'der'});
   const key=createPublicKey({key:f.spki,format:'der',type:'spki'});
   assert(verify('sha256',msg,key,der));
   const digest=createHash('sha256').update(msg).digest();
   const sig=await f.signer.sign(f.scope,{purpose:'sdk4-invoice-hash',bytes:digest,encoding:'der'});
   assert(verify('sha256',digest,key,sig));
   const raw=await f.signer.sign(f.scope,{purpose:'xades-signed-info',bytes:msg,encoding:'ieee-p1363'});
   assert.equal(raw.length,64);assert(verify('sha256',msg,{key,dsaEncoding:'ieee-p1363'},raw));
   const fresh=createSoftHsmStagingSigner(f.options);
   assert.deepEqual(await fresh.getPublicKey(f.scope),f.spki);
 }
 console.log('PASS: real PKCS11 key generation, protected attributes, DER/P1363, process reopen');
 await assert.rejects(a.signer.getPublicKey(b.scope));
 await assert.rejects(a.signer.sign(b.scope,{purpose:'csr',bytes:msg,encoding:'der'}));
 await assert.rejects(createSoftHsmStagingSigner({...a.options,readPin:b.options.readPin}).getPublicKey(a.scope));
 await assert.rejects(createSoftHsmStagingSigner({...a.options,binding:{...a.binding,publicKeyDigest:b.binding.publicKeyDigest}}).getPublicKey(a.scope));
 assert.throws(()=>createSoftHsmStagingSigner({...a.options,binding:{...a.binding,environment:'production'}}));
 console.log('PASS: cross-tenant scope, wrong PIN, wrong key digest, production denied');
 const issuer={accountUid:a.scope.accountUid,workspaceId:a.scope.workspaceId,issuerCountry:'SA',saRegime:'phase-2',vatNumber:'399999999900003',legalName:'LOUREX Synthetic QA'};
 const unit={egsId:a.scope.egsId,serialNumber:'1-LOUREX|2-INVOICE|3-SYNTHETIC',organizationUnit:'Riyadh',commonName:'LOUREX Synthetic QA',functionalityMap:'1100',registeredAddress:'Riyadh',businessCategory:'Trading'};
 const input={scope:a.scope,issuer,unit,binding:a.binding,signer:a.signer};
 const result=await createSoftHsmStagingCsr(input);
 const csr=Buffer.from(result.csr,'base64');
 assert(verifySoftHsmStagingCsr({...input,csr,publicKey:result.publicKey}));
 const file=join(dir,'synthetic.csr');writeFileSync(file,csr);
 run('/usr/bin/openssl',['req','-in',file,'-verify','-noout']);
 await assert.rejects(createManagedSimulationCsr(input));
 await assert.rejects(createManagedProductionCsr(input));
 console.log('PASS: LOUREX CSR generated with real software PKCS11 and verified by OpenSSL');
 console.log('===== LOUREX SOFTHSM STAGING QA PASSED =====');
}finally{rmSync(dir,{recursive:true,force:true});}
