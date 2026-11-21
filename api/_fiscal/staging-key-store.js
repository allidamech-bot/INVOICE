import {createHash,createHmac,createPublicKey} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstatSync,writeFileSync,readFileSync,linkSync,unlinkSync,openSync,fsyncSync,closeSync,constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {readStagingSecret} from './staging-envelope.js';
import {createSoftHsmStagingSigner,stagingKeyLocator,STAGING_PROTECTION} from './softhsm-staging-signer.js';
const helper=fileURLToPath(new URL('../../scripts/fiscal/softhsm_staging.py',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=ok=>{if(!ok)throw Error('STAGING_KEY_STORE_DENIED');};
const same=(a,b)=>['environment','accountUid','workspaceId','egsId','keyVersion','publicKeyDigest','protectionLevel'].every(k=>a?.[k]===b?.[k]);
const HEX=/^[a-f0-9]{64}$/;
export function createStagingKeyStore({stateDir,configPath,pinSecretPath,pythonExecutable='/usr/bin/python3',authorizeProvision,authorizeBinding}){
 need([stateDir,configPath,pinSecretPath,pythonExecutable].every(p=>typeof p==='string'&&isAbsolute(p))&&typeof authorizeProvision==='function'&&typeof authorizeBinding==='function');
 const dir=lstatSync(stateDir);need(dir.isDirectory()&&dir.uid===process.getuid()&&(dir.mode&0o077)===0);
 function pin(scope,purpose){
  const loc=stagingKeyLocator(scope),master=readStagingSecret(pinSecretPath);
  try{
   // Separate administrative and user PIN domains; 32 decimal digits.
   return (BigInt('0x'+createHmac('sha256',master).update('LOUREX-PKCS11-V1:'+purpose+':'+loc.keyId).digest('hex'))%10n**32n).toString().padStart(32,'0');
  }finally{master.fill(0);}
 }
 function recordPath(s){return join(stateDir,stagingKeyLocator(s).keyId+'.json');}
 function read(s){
  const path=recordPath(s);let fd;
  try{fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
  try{
   const v=JSON.parse(readFileSync(fd,'utf8'));
   need(same(v,{environment:s.environment,accountUid:s.accountUid,workspaceId:s.workspaceId,egsId:s.egsId,keyVersion:stagingKeyLocator(s).keyVersion,publicKeyDigest:v.publicKeyDigest,protectionLevel:STAGING_PROTECTION})&&HEX.test(v.publicKeyDigest));
   return Object.freeze(v);
  }finally{closeSync(fd);}
 }
 function commit(s,binding){
  const target=recordPath(s),tmp=target+'.'+randomUUID()+'.tmp';
  try{
   writeFileSync(tmp,JSON.stringify(binding)+'\n',{flag:'wx',mode:0o600});
   const fd=openSync(tmp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
   try{linkSync(tmp,target);}catch(e){if(e.code!=='EEXIST')throw e;}
   const d=openSync(stateDir,'r');try{fsyncSync(d);}finally{closeSync(d);}
   need(same(read(s),binding));
  }finally{try{unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 function rawSigner(binding){
  return createSoftHsmStagingSigner({binding,configPath,pythonExecutable,readPin:async s=>pin(s,'user')});
 }
 async function signer(s,binding){
  const prior=read(s);
  need(prior&&same(prior,binding)&&await authorizeBinding(prior)===true);
  const delegate=rawSigner(prior);
  await delegate.getPublicKey(s);
  // Return a real branded signer for the existing CSR entrypoint. Its PIN
  // resolver rechecks the binding for each operation (including after restart).
  return createSoftHsmStagingSigner({binding:prior,configPath,pythonExecutable,readPin:async scope=>{
   need(same(read(scope),prior)&&await authorizeBinding(prior)===true);
   return pin(scope,'user');
  }});
 }
 return Object.freeze({
  async provision(scope){
   const loc=stagingKeyLocator(scope);
   const s=Object.freeze({environment:scope.environment,accountUid:scope.accountUid,workspaceId:scope.workspaceId,egsId:scope.egsId});
   need(await authorizeProvision(s)===true);
   let prior=read(s);
   if(prior){await rawSigner(prior).getPublicKey(s);return prior;}
   const input=JSON.stringify({op:'ensure',token:loc.token,keyId:loc.keyId,pin:pin(s,'user'),soPin:pin(s,'admin')});
   const r=spawnSync(pythonExecutable,['-E','-s',helper],{input,env:{SOFTHSM2_CONF:configPath,LOUREX_STAGING_LOCK:join(stateDir,'provision.lock'),PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},timeout:30000,maxBuffer:16384});
   if(r.error||r.status!==0){
    const safe=/^STAGING_PKCS11_FAILED (?:input|load|find-token|initialize-token|lock|phase-token|phase-pin|phase-key|initialize-user-pin|open-token|login|key-pair|protected-attributes|public-key)(?: 0x[0-9a-f]{8})?$/.exec(r.stderr?.toString('utf8').trim()??'');
    throw Error(safe?safe[0]:'STAGING_KEY_STORE_DENIED');
   }
   const result=JSON.parse(r.stdout.toString('utf8')),spki=Buffer.from(result.spki,'base64'),key=createPublicKey({key:spki,format:'der',type:'spki'});
   need(spki.toString('base64')===result.spki&&key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails?.namedCurve==='secp256k1');
   const binding=Object.freeze({...s,keyVersion:loc.keyVersion,publicKeyDigest:sha(spki),protectionLevel:STAGING_PROTECTION});
   commit(s,binding);
   need(await authorizeProvision(s)===true);
   return binding;
  },
  resolveSigner:signer,
  signingOptions(binding){
   return Object.freeze({configPath,pythonExecutable,readPin:async scope=>{
    need(same(read(scope),binding)&&await authorizeBinding(binding)===true);
    return pin(scope,'user');
   }});
  }
 });
}
