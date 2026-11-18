import {createHash,createPublicKey,verify} from 'node:crypto';
import {crc32c} from './managed-kms.js';

// Private simulation-only HSM adapter. No key creation, export, billing or route.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const QA=/^[a-z][a-z0-9-]{0,18}-fiscal-qa$/;
const KEY=/^projects\/([a-z][a-z0-9-]+)\/locations\/[a-z0-9-]+\/keyRings\/[A-Za-z0-9_-]+\/cryptoKeys\/[A-Za-z0-9_-]+\/cryptoKeyVersions\/[1-9][0-9]*$/;
const HEX=/^[a-f0-9]{64}$/;
const PURPOSES=new Set(['csr','xades-signed-info','simplified-qr','pades-signed-attributes']);
const HSM=new Set(['HSM','HSM_SINGLE_TENANT']);
const sha=b=>createHash('sha256').update(b).digest();
const checksum=b=>String(crc32c(b));
function scope(s){
  if(s?.environment!=='simulation'||['accountUid','workspaceId','egsId'].some(k=>typeof s[k]!=='string'||!ID.test(s[k])))throw Error('SIGNING_SCOPE_INVALID');
  return {environment:s.environment,accountUid:s.accountUid,workspaceId:s.workspaceId,egsId:s.egsId};
}
function decode(value,max){
  if(typeof value!=='string'||!value.length||value.length>Math.ceil(max/3)*4)throw Error('SIGNING_RESULT_INVALID');
  const bytes=Buffer.from(value,'base64');if(!bytes.length||bytes.length>max||bytes.toString('base64')!==value)throw Error('SIGNING_RESULT_INVALID');return bytes;
}
// Strict ECDSA DER decoding, not a guessed fixed-size slice. Reject negative,
// non-minimal, trailing and out-of-range scalars before exposing P1363.
export function ecdsaDerToP1363(der){
  const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  if(!Buffer.isBuffer(der)||der.length<8||der.length>72||der[0]!==48||der[1]!==der.length-2)throw Error('INVALID_ECDSA_DER');
  let p=2;
  function scalar(){
    if(der[p++]!==2)throw Error('INVALID_ECDSA_DER');const n=der[p++];
    if(!n||n>33||p+n>der.length||der[p]&128||(n>1&&der[p]===0&&!(der[p+1]&128)))throw Error('INVALID_ECDSA_DER');
    const value=BigInt('0x'+der.subarray(p,p+n).toString('hex'));p+=n;
    if(value===0n||value>=order)throw Error('INVALID_ECDSA_DER');return Buffer.from(value.toString(16).padStart(64,'0'),'hex');
  }
  const r=scalar(),s=scalar();if(p!==der.length)throw Error('INVALID_ECDSA_DER');return Buffer.concat([r,s]);
}
async function readJson(response){
  if(response?.status!==200||!response.body?.getReader)throw Error('SIGNING_REQUEST_FAILED');
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>16384){await reader.cancel();throw Error('SIGNING_RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(r.value));}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}finally{reader.releaseLock();}
}
export function createQaManagedSigner({projectId,binding,getAccessToken,fetchImpl=fetch,timeoutMs=10000}){
  const bound=scope(binding);
  const keyVersion=binding.keyVersion,publicKeyDigest=binding.publicKeyDigest,protectionLevel=binding.protectionLevel;
  if(typeof projectId!=='string'||!QA.test(projectId)||typeof keyVersion!=='string'||keyVersion.length>768||KEY.exec(keyVersion)?.[1]!==projectId||typeof publicKeyDigest!=='string'||!HEX.test(publicKeyDigest)||!HSM.has(protectionLevel)||typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('SIGNING_NOT_CONFIGURED');
  function authorized(c){const v=scope(c);if(Object.keys(bound).some(k=>bound[k]!==v[k]))throw Error('SIGNING_SCOPE_MISMATCH');}
  async function request(suffix,body){
    const controller=new AbortController();let timer;
    try{return await Promise.race([(async()=>{
      const token=await getAccessToken();if(typeof token!=='string'||!token||token.length>8192||!/^[A-Za-z0-9._~+\/-]+=*$/.test(token)||controller.signal.aborted)throw Error('SIGNING_AUTH_FAILED');
      const response=await fetchImpl('https://cloudkms.googleapis.com/v1/'+keyVersion+suffix,{method:body?'POST':'GET',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      return readJson(response);
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('SIGNING_TIMEOUT'));},timeoutMs);})]);}catch{throw Error('SIGNING_REQUEST_FAILED');}finally{clearTimeout(timer);}
  }
  async function publicKey(){
    const p=await request('/publicKey');
    if(p?.name!==keyVersion||p.algorithm!=='EC_SIGN_SECP256K1_SHA256'||p.protectionLevel!==protectionLevel||typeof p.pem!=='string'||p.pem.length>4096||checksum(Buffer.from(p.pem))!==String(p.pemCrc32c))throw Error('SIGNING_PUBLIC_KEY_INVALID');
    const key=createPublicKey(p.pem),spki=key.export({type:'spki',format:'der'});
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='secp256k1'||sha(spki).toString('hex')!==publicKeyDigest)throw Error('SIGNING_PUBLIC_KEY_MISMATCH');
    return {key,spki};
  }
  return Object.freeze({
    async getPublicKey(c){authorized(c);return Buffer.from((await publicKey()).spki);},
    async sign(c,{purpose,bytes,encoding}){
      authorized(c);if(!PURPOSES.has(purpose)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>512*1024||!['der','ieee-p1363'].includes(encoding))throw Error('SIGNING_INPUT_INVALID');
      const original=Buffer.from(bytes),key=await publicKey(),digest=sha(original);
      const r=await request(':asymmetricSign',{digest:{sha256:digest.toString('base64')},digestCrc32c:checksum(digest)});
      if(r?.name!==keyVersion||r.protectionLevel!==protectionLevel||r.verifiedDigestCrc32c!==true)throw Error('SIGNING_RESULT_INVALID');
      const der=decode(r.signature,72);if(checksum(der)!==String(r.signatureCrc32c))throw Error('SIGNING_INTEGRITY_FAILED');
      const raw=ecdsaDerToP1363(der);
      if(!verify('sha256',original,{key:key.key,dsaEncoding:'ieee-p1363'},raw))throw Error('SIGNING_SIGNATURE_INVALID');
      return encoding==='der'?der:raw;
    }
  });
}
