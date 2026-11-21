// Google Cloud KMS envelope adapters with separate environments.
// No provisioning, billing, signing key generation or production activation.
const PART=/^[A-Za-z0-9_-]{1,128}$/;
const QA=/^[a-z][a-z0-9-]{0,18}-fiscal-qa$/;
const KEY=/^projects\/([a-z][a-z0-9-]+)\/locations\/([a-z0-9-]+)\/keyRings\/([A-Za-z0-9_-]+)\/cryptoKeys\/([A-Za-z0-9_-]+)$/;
export function crc32c(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0x82f63b78:0);}return (crc^0xffffffff)>>>0;}
function checksum(bytes){return String(crc32c(bytes));}
function decode(text,max){if(typeof text!=='string'||!text.length||text.length>Math.ceil(max/3)*4)throw Error('KMS_INVALID_RESULT');const bytes=Buffer.from(text,'base64');if(bytes.length>max||bytes.toString('base64')!==text)throw Error('KMS_INVALID_RESULT');return bytes;}
function aad(c,environment){
  if(c?.environment!==environment||!['compliance','production'].includes(c.kind))throw Error(environment==='simulation'?'KMS_SIMULATION_ONLY':'KMS_PRODUCTION_ONLY');
  const value={};for(const k of ['accountUid','workspaceId','egsId','ref']){if(typeof c[k]!=='string'||!PART.test(c[k]))throw Error('KMS_INVALID_CONTEXT');value[k]=c[k];}
  return Buffer.from(JSON.stringify({...value,environment:c.environment,kind:c.kind}));
}
async function readJson(response){
  if(response?.status!==200||!response.body?.getReader)throw Error('KMS_REQUEST_FAILED');
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>65536){await reader.cancel();throw Error('KMS_RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(r.value));}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}finally{reader.releaseLock();}
}
function createManagedKms({projectId,keyName,getAccessToken,fetchImpl=fetch,timeoutMs=10000},environment){
  const validProject=typeof projectId==='string'&&(environment==='simulation'?QA.test(projectId):/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)&&!projectId.endsWith('-fiscal-qa'));
  if(!validProject||typeof keyName!=='string'||KEY.exec(keyName)?.[1]!==projectId||keyName.length>512||typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw Error('KMS_NOT_CONFIGURED');
  async function request(operation,body){
    const controller=new AbortController();let timer;
    try{return await Promise.race([ (async()=>{
      const token=await getAccessToken();if(typeof token!=='string'||!token||token.length>8192||!/^[A-Za-z0-9._~+\/-]+=*$/.test(token)||controller.signal.aborted)throw Error('KMS_AUTH_FAILED');
      const response=await fetchImpl('https://cloudkms.googleapis.com/v1/'+keyName+':'+operation,{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
      return readJson(response);
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('KMS_TIMEOUT'));},timeoutMs);})]);}catch{throw Error('KMS_REQUEST_FAILED');}finally{clearTimeout(timer);}
  }
  function payload(field,bytes,context){return {[field]:bytes.toString('base64'),[field+'Crc32c']:checksum(bytes),additionalAuthenticatedData:context.toString('base64'),additionalAuthenticatedDataCrc32c:checksum(context)};}
  return Object.freeze({
    async wrapKey({key,context}){
      if(!Buffer.isBuffer(key)||key.length!==32)throw Error('KMS_INVALID_KEY');
      const r=await request('encrypt',payload('plaintext',key,aad(context,environment)));
      if(typeof r?.name!=='string'||!r.name.startsWith(keyName+'/cryptoKeyVersions/')||!/^\d+$/.test(r.name.slice((keyName+'/cryptoKeyVersions/').length))||r.verifiedPlaintextCrc32c!==true||r.verifiedAdditionalAuthenticatedDataCrc32c!==true)throw Error('KMS_INVALID_RESULT');
      const wrapped=decode(r.ciphertext,16384);if(checksum(wrapped)!==String(r.ciphertextCrc32c))throw Error('KMS_INTEGRITY_FAILED');
      return {keyId:keyName,wrappedKey:wrapped};
    },
    async unwrapKey({keyId,wrappedKey,context}){
      if(keyId!==keyName||!Buffer.isBuffer(wrappedKey)||!wrappedKey.length||wrappedKey.length>16384)throw Error('KMS_INVALID_KEY');
      const r=await request('decrypt',payload('ciphertext',wrappedKey,aad(context,environment)));
      const key=decode(r?.plaintext,32);
      if(key.length!==32||checksum(key)!==String(r.plaintextCrc32c)){key.fill(0);throw Error('KMS_INTEGRITY_FAILED');}
      return key;
    }
  });
}

export function createQaManagedKms(options){return createManagedKms(options,'simulation');}
export function createProductionManagedKms(options){return createManagedKms(options,'production');}
