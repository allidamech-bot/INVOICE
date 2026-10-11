import type { PlainWorkspaceRecord, VaultPayload } from '../types.js';
import { APP_SCHEMA_VERSION } from '../lib/defaults.js';
import { activeAccountStorageUid, acknowledgePlainWorkspace, acknowledgeIdenticalPlainWorkspace, getPlainWorkspace, replacePlainWorkspaceIfUnchanged } from '../storage/db.js';
import { currentCloudUser } from './firebase.js';
import { assertRestorableBackupVault } from '../lib/backup.js';

/**
 * PIN-free Firebase format. Data is JSON carried in base64 chunks ONLY to avoid
 * Firestore document size/Unicode boundary failures. It is NOT client-encrypted.
 * Firebase Auth, Firestore UID rules and HTTPS remain mandatory.
 *
 * Crucially this collection is different from the historical encrypted "vault":
 * mixed-version clients can neither mistake plaintext for ciphertext nor overwrite
 * the new workspace while users migrate.
 */
declare const firebase:any;
const FORMAT='LOUREX_PLAIN_WORKSPACE_V2';
const CHUNK_BYTES=180_000;
const MAX_BYTES=45_000_000;
const MAX_CHUNKS=Math.ceil(MAX_BYTES/CHUNK_BYTES);
const WRITE_BATCH_SIZE=12;

export interface PlainCloudMeta {
  format:typeof FORMAT;
  version:2;
  revision:string;
  schemaVersion:number;
  bytes:number;
  sha256:string;
  chunkCount:number;
  updatedAt:string;
  parentRevision:string|null;
}
export type PlainCloudSyncResult='empty'|'same'|'pushed'|'pulled'|'diverged'|'retry';

function requireUid(uid:string):void {
  if(!uid||currentCloudUser()?.uid!==uid||activeAccountStorageUid()!==uid)
    throw new Error('The signed-in Firebase account or local workspace has changed.');
}
function collection(uid:string):any {return firebase.firestore().collection('users').doc(uid).collection('workspace');}
function metaRef(uid:string):any {return collection(uid).doc('meta');}
function newRevision():string {
  // Revision identity is cryptographically random, never wall-clock ordered.
  // Only Firestore's manifest transaction decides the winner.
  const random=new Uint8Array(16);crypto.getRandomValues(random);
  return Array.from(random,b=>b.toString(16).padStart(2,'0')).join('');
}
function validMeta(value:any):value is PlainCloudMeta {
  return Boolean(value&&value.format===FORMAT&&value.version===2
    &&typeof value.revision==='string'&&/^[a-z0-9-]{12,90}$/i.test(value.revision)
    &&Number.isInteger(value.schemaVersion)&&value.schemaVersion>0&&value.schemaVersion<=APP_SCHEMA_VERSION
    &&Number.isInteger(value.bytes)&&value.bytes>0&&value.bytes<=MAX_BYTES
    &&typeof value.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.sha256)
    &&Number.isInteger(value.chunkCount)&&value.chunkCount===Math.ceil(value.bytes/CHUNK_BYTES)
    &&value.chunkCount>0&&value.chunkCount<=MAX_CHUNKS
    &&typeof value.updatedAt==='string'&&Number.isFinite(Date.parse(value.updatedAt))
    &&(value.parentRevision===null||typeof value.parentRevision==='string'));
}
async function sha256(bytes:Uint8Array):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',bytes as BufferSource);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function encodePayload(payload:VaultPayload):Uint8Array {
  if(!payload||payload.schemaVersion>APP_SCHEMA_VERSION||payload.schemaVersion<1)
    throw new Error('Invalid or newer LOUREX workspace schema.');
  // An invalid invoice/customer payload must never become the authoritative
  // Firebase revision. A cryptographic hash proves transport integrity, not
  // accounting schema validity.
  assertRestorableBackupVault(payload);
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  if(!bytes.length||bytes.length>MAX_BYTES)throw new Error('Workspace is too large for Firebase backup.');
  return bytes;
}
function b64(bytes:Uint8Array):string {
  let binary='';
  for(let i=0;i<bytes.length;i+=0x4000)
    binary+=Array.from(bytes.subarray(i,i+0x4000),b=>String.fromCharCode(b)).join('');
  return btoa(binary);
}
function decodeB64(value:string):Uint8Array {
  if(typeof value!=='string'||value.length>Math.ceil(CHUNK_BYTES/3)*4+8||!/^[a-zA-Z0-9+/]*={0,2}$/.test(value))
    throw new Error('Invalid Firebase workspace chunk.');
  const binary=atob(value),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
function chunkId(revision:string,index:number):string {
  return 'chunk-'+revision+'-'+String(index).padStart(5,'0');
}

export async function getPlainCloudMeta(uid:string):Promise<PlainCloudMeta|null>{
  requireUid(uid);
  const snapshot=await metaRef(uid).get();
  requireUid(uid);
  if(!snapshot.exists)return null;
  const value=snapshot.data();
  if(!validMeta(value))throw new Error('The cloud workspace format is invalid or requires a newer LOUREX version.');
  return value;
}

export async function downloadPlainCloudWorkspace(uid:string,expected?:PlainCloudMeta):Promise<{payload:VaultPayload;meta:PlainCloudMeta}|null>{
  requireUid(uid);
  const meta=expected??await getPlainCloudMeta(uid);
  if(!meta)return null;
  const bytes=new Uint8Array(meta.bytes);
  let written=0;
  for(let offset=0;offset<meta.chunkCount;offset+=8){
    const indices=Array.from({length:Math.min(8,meta.chunkCount-offset)},(_,i)=>offset+i);
    const snapshots=await Promise.all(indices.map(i=>collection(uid).doc(chunkId(meta.revision,i)).get()));
    requireUid(uid);
    for(let i=0;i<snapshots.length;i++){
      const data=snapshots[i]?.data();
      const index=indices[i];
      if(!snapshots[i]?.exists||!Number.isInteger(data?.index)||data.index!==index||data.revision!==meta.revision)
        throw new Error('An account workspace chunk is missing or invalid.');
      const chunk=decodeB64(data.data);
      if(!chunk.length||chunk.length>CHUNK_BYTES||written+chunk.length>meta.bytes)
        throw new Error('An account workspace chunk has an invalid length.');
      bytes.set(chunk,written);written+=chunk.length;
    }
  }
  if(written!==meta.bytes||(await sha256(bytes))!==meta.sha256)
    throw new Error('The cloud workspace failed its integrity check.');
  const latest=await getPlainCloudMeta(uid);
  if(!latest||latest.revision!==meta.revision||latest.sha256!==meta.sha256)
    throw new Error('The cloud workspace changed during download. Retry.');
  const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as VaultPayload;
  assertRestorableBackupVault(payload);
  if(payload.schemaVersion!==meta.schemaVersion)
    throw new Error('The downloaded workspace schema does not match the verified manifest.');
  requireUid(uid);
  return {payload,meta};
}

// Orphan chunks are intentionally left untouched after an ambiguous network
// failure. No unverified cleanup may delete a revision referenced by a
// committed manifest. Garbage collection requires a separate audited job.
export async function uploadPlainCloudWorkspace(uid:string,local:PlainWorkspaceRecord,replaceRemote=false):Promise<'same'|'pushed'|'remote-changed'>{
  requireUid(uid);
  if(local.uid!==uid||local.schemaVersion!==local.payload?.schemaVersion)throw new Error('Invalid local workspace identity.');
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Offline: cloud upload will retry when connected.');
  const bytes=encodePayload(local.payload),hash=await sha256(bytes);
  const previous=await getPlainCloudMeta(uid);
  requireUid(uid);
  if(previous&&previous.sha256===hash){
    await acknowledgeIdenticalPlainWorkspace(uid,local.localRevision,previous.revision,hash);
    return 'same';
  }
  if(!replaceRemote&&(previous?.revision??null)!==(local.baseCloudRevision??null))
    return 'remote-changed';
  const revision=newRevision(),count=Math.ceil(bytes.length/CHUNK_BYTES);
  const meta:PlainCloudMeta={
    format:FORMAT,version:2,revision,schemaVersion:local.schemaVersion,
    bytes:bytes.length,sha256:hash,chunkCount:count,
    updatedAt:local.updatedAt,parentRevision:previous?.revision??null
  };
  try{
    for(let offset=0;offset<count;offset+=WRITE_BATCH_SIZE){
      const batch=firebase.firestore().batch();
      for(let i=offset;i<Math.min(count,offset+WRITE_BATCH_SIZE);i++)
        batch.set(collection(uid).doc(chunkId(revision,i)),{
          revision,index:i,data:b64(bytes.subarray(i*CHUNK_BYTES,Math.min(bytes.length,(i+1)*CHUNK_BYTES)))
        });
      await batch.commit();
      requireUid(uid);
    }
    // Manifest transaction is the commit point. A losing device never replaces
    // the winning revision; its unreferenced staged chunks can be discarded.
    const committed=await firebase.firestore().runTransaction(async(tx:any)=>{
      const ref=metaRef(uid),snap=await tx.get(ref);
      const existing=snap.exists?snap.data():null;
      if(existing&&!validMeta(existing))throw new Error('The existing cloud workspace is invalid.');
      if((existing?.revision??null)!==(previous?.revision??null))return false;
      // Archive the last authoritative manifest atomically with publishing
      // the next one. A second network request must never be required for
      // recovery history; in particular a successful publish can't have a
      // missing archive due to auth loss or connectivity after the commit.
      if(existing){
        const historyRef=firebase.firestore().collection('users').doc(uid)
          .collection('workspaceHistory').doc(existing.revision);
        tx.set(historyRef,{...existing,archivedAt:new Date().toISOString()});
      }
      tx.set(ref,meta);
      return true;
    });
    // A successful Firestore transaction has already committed remotely.
    // Never delete the chunks even if the identity changes right here.
    if(!committed)return 'remote-changed';
    requireUid(uid);
    await acknowledgePlainWorkspace(uid,local.localRevision,revision,hash,local.baseCloudRevision);
    return 'pushed';
  }catch(error){
    // The server might have committed despite a lost response. Retain staged
    // chunks until their reachability can be verified in a separate GC pass.
    throw error;
  }
}

/** Reads remote revisions without overwriting concurrent local work. */
export async function reconcilePlainCloudWorkspace(uid:string):Promise<PlainCloudSyncResult>{
  requireUid(uid);
  const [local,remote]=await Promise.all([getPlainWorkspace(),getPlainCloudMeta(uid)]);
  requireUid(uid);
  if(!local&&!remote)return 'empty';
  if(!local&&remote){
    const result=await downloadPlainCloudWorkspace(uid,remote);
    if(!result)return 'empty';
    const replacement:PlainWorkspaceRecord={
      id:'workspace-v2',uid,payload:result.payload,schemaVersion:result.payload.schemaVersion,
      updatedAt:result.meta.updatedAt,localRevision:crypto.randomUUID(),
      baseCloudRevision:result.meta.revision,baseCloudSha256:result.meta.sha256
    };
    const installed=await replacePlainWorkspaceIfUnchanged(uid,null,replacement);
    return installed?'pulled':'retry';
  }
  if(!local)return 'empty';
  if(!remote){
    if(local.baseCloudRevision)return 'diverged';
    const published=await uploadPlainCloudWorkspace(uid,local);
    return published==='remote-changed'?'diverged':published;
  }
  const hash=await sha256(encodePayload(local.payload));
  if(hash===remote.sha256){
    const acknowledged=await acknowledgeIdenticalPlainWorkspace(uid,local.localRevision,remote.revision,hash);
    return acknowledged?'same':'retry';
  }
  if(local.baseCloudRevision===remote.revision){
    const published=await uploadPlainCloudWorkspace(uid,local);
    return published==='remote-changed'?'diverged':published;
  }
  const localClean=Boolean(local.baseCloudSha256)&&hash===local.baseCloudSha256;
  if(!localClean)return 'diverged';
  const result=await downloadPlainCloudWorkspace(uid,remote);
  if(!result)return 'diverged';
  const replacement:PlainWorkspaceRecord={
    id:'workspace-v2',uid,payload:result.payload,schemaVersion:result.payload.schemaVersion,
    updatedAt:result.meta.updatedAt,localRevision:crypto.randomUUID(),
    baseCloudRevision:result.meta.revision,baseCloudSha256:result.meta.sha256
  };
  // The checked local generation may have changed during the download.
  const installed=await replacePlainWorkspaceIfUnchanged(uid,local.localRevision,replacement,'replaced-by-cloud');
  return installed?'pulled':'retry';
}

/** Notify other devices when a fully committed cloud manifest changes. */
export function subscribePlainCloudChanges(uid:string,onChange:()=>void):()=>void{
  requireUid(uid);
  const off=metaRef(uid).onSnapshot((snapshot:any)=>{
    if(!snapshot.exists)return;
    const data=snapshot.data();
    if(!validMeta(data))return;
    onChange();
  },()=>undefined);
  return typeof off==='function'?off:()=>{};
}
