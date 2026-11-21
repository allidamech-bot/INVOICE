import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
import {isAbsolute} from 'node:path';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const need=ok=>{if(!ok)throw Error('STAGING_SECRET_UNAVAILABLE');};
// Root-installed or systemd credential file, never env, argv, repository or Firestore.
// The service must have a separately backed up 32-byte binary key.
export function readStagingSecret(path){
 need(typeof path==='string'&&isAbsolute(path));
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const s=fstatSync(fd);
  need(s.isFile()&&s.nlink===1&&s.size===32&&(s.mode&0o077)===0&&(s.uid===0||s.uid===process.getuid()));
  const key=readFileSync(fd);need(key.length===32);return key;
 }finally{closeSync(fd);}
}
function aad(c){
 need(c?.environment==='simulation'&&['compliance','production'].includes(c.kind)&&['accountUid','workspaceId','egsId','ref'].every(k=>typeof c[k]==='string'&&ID.test(c[k])));
 return Buffer.from(JSON.stringify(['LOUREX_STAGING_WRAP_V1',c.environment,c.accountUid,c.workspaceId,c.egsId,c.ref,c.kind]));
}
const keyId=k=>'local-staging-v1:'+createHash('sha256').update(k).digest('hex');
export function createStagingEnvelopeWrapper({secretPath}){
 need(typeof secretPath==='string'&&isAbsolute(secretPath));
 return Object.freeze({
  async wrapKey({key,context}){
   need(Buffer.isBuffer(key)&&key.length===32);
   const data=aad(context),master=readStagingSecret(secretPath);
   try{
    const nonce=randomBytes(12),c=createCipheriv('aes-256-gcm',master,nonce);c.setAAD(data);
    const wrapped=Buffer.concat([nonce,c.update(key),c.final(),c.getAuthTag()]);
    return {keyId:keyId(master),wrappedKey:wrapped};
   }finally{master.fill(0);}
  },
  async unwrapKey({keyId:id,wrappedKey,context}){
   need(Buffer.isBuffer(wrappedKey)&&wrappedKey.length===60);const data=aad(context),master=readStagingSecret(secretPath);
   try{
    need(id===keyId(master));
    const d=createDecipheriv('aes-256-gcm',master,wrappedKey.subarray(0,12));d.setAAD(data);d.setAuthTag(wrappedKey.subarray(44));
    const first=d.update(wrappedKey.subarray(12,44));
    try{return Buffer.concat([first,d.final()]);}finally{first.fill(0);}
   }finally{master.fill(0);}
  }
 });
}
