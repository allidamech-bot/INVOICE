import {createHash} from 'node:crypto';

// Private submission-response evidence, not a proof of acceptance. Firestore
// documents have a 1 MiB cap; preserve up to the transport's 2 MiB limit in
// immutable 512 KiB chunks when needed, within the same ledger transaction.
export const MAX_AUTHORITY_EVIDENCE=2*1024*1024;
const CHUNK=512*1024;
const digest=b=>createHash('sha256').update(b).digest('hex');
export function hashAuthorityEvidence(bytes){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_AUTHORITY_EVIDENCE)throw Error('INVALID_AUTHORITY_EVIDENCE');
  return digest(bytes);
}
function encode(bytes){return {sha256:digest(bytes),bytes:bytes.toString('base64')};}
export function writeAuthorityEvidence(tx,db,ref,bytes,expectedDigest){
  if(hashAuthorityEvidence(bytes)!==expectedDigest)throw Error('AUTHORITY_EVIDENCE_MISMATCH');
  if(bytes.length<=CHUNK){tx.create(ref,encode(bytes));return;}
  const chunkCount=Math.ceil(bytes.length/CHUNK);
  tx.create(ref,{sha256:expectedDigest,encoding:'base64-chunks-v1',byteLength:bytes.length,chunkCount});
  for(let i=0;i<chunkCount;i++)tx.create(db.doc(ref.path+'/chunks/'+String(i)),{index:i,...encode(bytes.subarray(i*CHUNK,(i+1)*CHUNK))});
}
function decode(value){
  if(!value||typeof value.bytes!=='string'||value.bytes.length>Math.ceil(CHUNK/3)*4)throw Error('INVALID_AUTHORITY_CHUNK');
  const bytes=Buffer.from(value.bytes,'base64');
  if(!bytes.length||bytes.length>CHUNK||bytes.toString('base64')!==value.bytes||digest(bytes)!==value.sha256)throw Error('INVALID_AUTHORITY_CHUNK');
  return bytes;
}
export async function readAuthorityEvidence(tx,db,ref,expectedDigest){
  const snapshot=await tx.get(ref), value=snapshot.exists?snapshot.data():null;
  if(!value||value.sha256!==expectedDigest)throw Error('AUTHORITY_EVIDENCE_MISMATCH');
  let bytes;
  if(value.encoding===undefined)bytes=decode(value);
  else {
    if(value.encoding!=='base64-chunks-v1'||!Number.isSafeInteger(value.byteLength)||value.byteLength<=CHUNK||value.byteLength>MAX_AUTHORITY_EVIDENCE||value.chunkCount!==Math.ceil(value.byteLength/CHUNK)||value.bytes!==undefined)throw Error('INVALID_AUTHORITY_MANIFEST');
    const chunks=[];
    for(let i=0;i<value.chunkCount;i++){
      const snapshot=await tx.get(db.doc(ref.path+'/chunks/'+String(i))),chunk=snapshot.exists?snapshot.data():null;
      if(!chunk||chunk.index!==i)throw Error('INVALID_AUTHORITY_CHUNK');
      const data=decode(chunk);
      if(data.length!==Math.min(CHUNK,value.byteLength-i*CHUNK))throw Error('INVALID_AUTHORITY_CHUNK');
      chunks.push(data);
    }
    bytes=Buffer.concat(chunks);
  }
  if(hashAuthorityEvidence(bytes)!==expectedDigest)throw Error('AUTHORITY_EVIDENCE_MISMATCH');
  return bytes;
}
