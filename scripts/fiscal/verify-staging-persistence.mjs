// Synthetic persistent-key acceptance; does not contact authority or Firebase.
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createPublicKey,verify} from 'node:crypto';
import {createStagingKeyStore} from '../../api/_fiscal/staging-key-store.js';
const dir=mkdtempSync(join(tmpdir(),'lourex-staging-persistence-'));
try{
 const stateDir=join(dir,'state'),tokens=join(dir,'tokens'),configPath=join(dir,'softhsm.conf'),pinSecretPath=join(dir,'pin-secret');
 mkdirSync(stateDir,{mode:0o700});mkdirSync(tokens,{mode:0o700});
 writeFileSync(configPath,'directories.tokendir = '+tokens+'\nobjectstore.backend = file\nlog.level = ERROR\n',{mode:0o600});
 writeFileSync(pinSecretPath,randomBytes(32),{mode:0o600});
 let authorized=true;
 const options={stateDir,configPath,pinSecretPath,authorizeProvision:async()=>authorized,authorizeBinding:async()=>authorized};
 const s={environment:'simulation',accountUid:'synthetic-owner',workspaceId:'test',egsId:'unit-one'},b={...s,egsId:'unit-two'};
 const a=createStagingKeyStore(options),one=await a.provision(s),two=await a.provision(b);
 assert.notEqual(one.publicKeyDigest,two.publicKeyDigest);
 const reopened=createStagingKeyStore(options);assert.deepEqual(await reopened.provision(s),one);
 const signer=await reopened.resolveSigner(s,one),spki=await signer.getPublicKey(s),bytes=Buffer.from('persistent synthetic EGS');
 assert(verify('sha256',bytes,createPublicKey({key:spki,format:'der',type:'spki'}),await signer.sign(s,{purpose:'csr',bytes,encoding:'der'})));
 await assert.rejects(reopened.resolveSigner(b,one));
 await assert.rejects(reopened.provision({...s,environment:'production'}));
 authorized=false;await assert.rejects(signer.sign(s,{purpose:'csr',bytes,encoding:'der'}));
 authorized=true;
 rmSync(tokens,{recursive:true});mkdirSync(tokens,{mode:0o700});
 await assert.rejects(reopened.provision(s)); // Loss must never replace bound key.
 console.log('LOUREX PERSISTENT STAGING KEYS PASSED');
}finally{rmSync(dir,{recursive:true,force:true});}
