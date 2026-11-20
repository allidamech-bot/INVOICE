import {createHash,createPublicKey,verify} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ecdsaDerToP1363} from './managed-signing.js';

// Explicit local staging only. Never claim managed hardware HSM protection.
export const STAGING_PROTECTION='SOFTWARE_PKCS11_STAGING';
const instances=new WeakSet(), ID=/^[A-Za-z0-9_-]{1,128}$/, HEX=/^[a-f0-9]{64}$/;
const names=['environment','accountUid','workspaceId','egsId'];
const purposes=new Set(['csr','sdk4-invoice-hash','xades-signed-info','simplified-qr','pades-signed-attributes']);
const helper=fileURLToPath(new URL('../../scripts/fiscal/softhsm_staging.py',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
function need(ok){if(!ok)throw Error('STAGING_SIGNER_DENIED');}
function scope(value){
 need(value?.environment==='simulation'&&names.slice(1).every(k=>typeof value[k]==='string'&&ID.test(value[k])));
 return Object.fromEntries(names.map(k=>[k,value[k]]));
}
export function stagingKeyLocator(value){
 const keyId=sha(JSON.stringify(scope(value)));
 return Object.freeze({keyId,token:'lourex-qa-'+keyId.slice(0,20),keyVersion:'softhsm-staging:'+keyId});
}
export function isSoftHsmStagingSigner(signer){return instances.has(signer);}
export function createSoftHsmStagingSigner({binding,configPath,readPin,pythonExecutable='/usr/bin/python3'}){
 const bound=Object.freeze(scope(binding)),loc=stagingKeyLocator(bound),digest=binding.publicKeyDigest;
 need(binding.protectionLevel===STAGING_PROTECTION&&binding.keyVersion===loc.keyVersion&&HEX.test(digest??'')&&binding.privateKey===undefined&&typeof configPath==='string'&&isAbsolute(configPath)&&typeof pythonExecutable==='string'&&isAbsolute(pythonExecutable)&&typeof readPin==='function');
 function authorize(value){const current=scope(value);need(names.every(k=>current[k]===bound[k]));}
 async function request(op,original){
  const pin=await readPin(bound);
  need(typeof pin==='string'&&/^[0-9]{8,32}$/.test(pin));
  const run=spawnSync(pythonExecutable,['-E','-s',helper],{
   input:JSON.stringify({op,token:loc.token,keyId:loc.keyId,pin,...(original?{data:original.toString('base64')}:{})}),
   env:{SOFTHSM2_CONF:configPath,PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},timeout:30000,maxBuffer:16384
  });
  need(!run.error&&run.status===0);
  let value;try{value=JSON.parse(run.stdout.toString('utf8'));}catch{need(false);}
  need(typeof value?.spki==='string'&&value.spki.length<=1024);
  const spki=Buffer.from(value.spki,'base64');
  need(spki.toString('base64')===value.spki&&sha(spki)===digest);
  const key=createPublicKey({key:spki,format:'der',type:'spki'});
  need(key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails?.namedCurve==='secp256k1');
  return {spki,key,value};
 }
 const signer=Object.freeze({
  async getPublicKey(value){authorize(value);return (await request('public')).spki;},
  async sign(value,{purpose,bytes,encoding}){
   authorize(value);
   need(purposes.has(purpose)&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=524288&&['der','ieee-p1363'].includes(encoding)&&(purpose!=='csr'||encoding==='der')&&(purpose!=='sdk4-invoice-hash'||bytes.length===32&&encoding==='der'));
   const original=Buffer.from(bytes),r=await request('sign',original);
   need(typeof r.value.signature==='string'&&r.value.signature.length<=100);
   const der=Buffer.from(r.value.signature,'base64');
   need(der.toString('base64')===r.value.signature);
   const raw=ecdsaDerToP1363(der);
   need(verify('sha256',original,{key:r.key,dsaEncoding:'ieee-p1363'},raw));
   return encoding==='der'?der:raw;
  }
 });
 instances.add(signer);return signer;
}
