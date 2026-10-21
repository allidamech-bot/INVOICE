import type {PeriodArchive,ArchivedPeriodReport,ArchivedPeriodOperation} from '../lib/period-archive.js';
import type { PlainWorkspaceRecord, VaultPayload } from '../types.js';
import type {LocalPeriodProtection} from '../lib/period-local.js';
import {isIsoDate} from '../lib/id.js';
import { APP_SCHEMA_VERSION } from '../lib/defaults.js';
import { activeAccountStorageUid, cachePlainPeriodProtection, acknowledgePlainWorkspace, acknowledgeIdenticalPlainWorkspace, getPlainWorkspace, replacePlainWorkspaceIfUnchanged } from '../storage/db.js';
import { currentCloudUser, currentCloudIdToken } from './firebase.js';
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
  chunkStorage?:'period-generations-v1';
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
    &&(value.chunkStorage===undefined||value.chunkStorage==='period-generations-v1')
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
/** Reject an unsyncable invoice workspace before any local/cloud replacement. */
export function assertPlainCloudWorkspaceUploadable(payload:VaultPayload):void{
  encodePayload(payload);
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
  const snapshot=await metaRef(uid).get({source:'server'});
  requireUid(uid);
  if(!snapshot.exists)return null;
  const value=snapshot.data();
  if(!validMeta(value))throw new Error('The cloud workspace format is invalid or requires a newer LOUREX version.');
  return value;
}

export async function downloadPlainCloudWorkspace(uid:string,expected?:PlainCloudMeta):Promise<{payload:VaultPayload;meta:PlainCloudMeta;protection:LocalPeriodProtection|null}|null>{
  requireUid(uid);
  if(expected&&!validMeta(expected))throw new Error('The cloud workspace manifest format is invalid.');
  const protection=await getPeriodCloudControl(uid);
  const meta=expected??await getPlainCloudMeta(uid);
  if(!meta)return null;
  if(!validMeta(meta))throw new Error('The cloud workspace manifest format is invalid.');
  const bytes=new Uint8Array(meta.bytes);
  let written=0;
  for(let offset=0;offset<meta.chunkCount;offset+=8){
    const indices=Array.from({length:Math.min(8,meta.chunkCount-offset)},(_,i)=>offset+i);
    const chunks=meta.chunkStorage==='period-generations-v1'
      ?firebase.firestore().collection('users').doc(uid).collection('periodGenerations').doc(meta.revision).collection('chunks')
      :collection(uid);
    const snapshots=await Promise.all(indices.map(i=>chunks.doc(chunkId(meta.revision,i)).get()));
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
  if(!latest||latest.revision!==meta.revision||latest.sha256!==meta.sha256||latest.chunkStorage!==meta.chunkStorage)
    throw new Error('The cloud workspace changed during download. Retry.');
  const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as VaultPayload;
  assertRestorableBackupVault(payload);
  if(payload.schemaVersion!==meta.schemaVersion)
    throw new Error('The downloaded workspace schema does not match the verified manifest.');
  requireUid(uid);
  return {payload,meta,protection};
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
  const control=await getPeriodCloudControl(uid);
  if(previous?.chunkStorage==='period-generations-v1'&&!control)throw new Error('Trusted period control enrollment is unavailable.');
  if(previous&&previous.sha256===hash){
    await acknowledgeIdenticalPlainWorkspace(uid,local.localRevision,previous.revision,hash);
    return 'same';
  }
  if(!replaceRemote&&(previous?.revision??null)!==(local.baseCloudRevision??null))
    return 'remote-changed';
  if(control){
    if((previous?.revision??null)!==(local.baseCloudRevision??null))return 'remote-changed';
    if(!previous||previous.chunkStorage!=='period-generations-v1')throw new Error('Invalid protected workspace manifest.');
    return publishProtectedWorkspace(uid,local,bytes,hash,previous,control.generation);
  }
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
  await getPeriodCloudControl(uid);
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
    const installed=await replacePlainWorkspaceIfUnchanged(uid,null,replacement,null,result.protection??undefined);
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
  const installed=await replacePlainWorkspaceIfUnchanged(uid,local.localRevision,replacement,'replaced-by-cloud',result.protection??undefined);
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
  const controlOff=firebase.firestore().collection('users').doc(uid).collection('accounting').doc('control').onSnapshot((snapshot:any)=>{
    if(snapshot.exists)onChange();
  },()=>undefined);
  return ()=>{if(typeof off==='function')off();if(typeof controlOff==='function')controlOff();};
}

/** Always consult the authenticated server: cached absence cannot downgrade an enrolled account. */
export async function getPeriodCloudControl(uid:string):Promise<LocalPeriodProtection|null>{
  requireUid(uid);
  const snapshot=await firebase.firestore().collection('users').doc(uid).collection('accounting').doc('control').get({source:'server'});
  requireUid(uid);
  if(!snapshot.exists)return null;
  const value=snapshot.data();
  if(value?.format!=='LOUREX_PERIOD_CONTROL_V1'||value.version!==1||value.ownerUid!==uid
    ||!Number.isSafeInteger(value.generation)||value.generation<1||!Array.isArray(value.boundaries)
    ||value.boundaries.some((b:any)=>!b||typeof b.workspaceId!=='string'||!b.workspaceId
      ||typeof b.through!=='string'||!isIsoDate(b.through)
      ||typeof b.reportId!=='string'||!/^[a-f0-9]{32}$/.test(b.reportId))
    ||new Set(value.boundaries.map((b:any)=>b.workspaceId)).size!==value.boundaries.length)
    throw new Error('Invalid trusted period control. Account data was not published.');
  const reports:LocalPeriodProtection['reports']=[];
  for(const boundary of value.boundaries){
    const {state}=await readPeriodReport(uid,boundary);
    reports.push({...boundary,state});
  }
  const latest=await firebase.firestore().collection('users').doc(uid).collection('accounting').doc('control').get({source:'server'});requireUid(uid);
  if(!latest.exists||JSON.stringify(latest.data())!==JSON.stringify(value))throw new Error('Trusted period control changed during verification. Retry.');
  const protection:LocalPeriodProtection={version:1,uid,generation:value.generation,reports};
  await cachePlainPeriodProtection(uid,protection);requireUid(uid);
  return protection;
}

async function readPeriodReport(uid:string,boundary:{reportId:string;workspaceId:string;through:string}):Promise<{meta:any;state:any}>{
    const ref=firebase.firestore().collection('users').doc(uid).collection('periodReports').doc(boundary.reportId);
    const snapshot=await ref.get({source:'server'});requireUid(uid);const report=snapshot.data();
    if(!snapshot.exists||report?.format!=='LOUREX_PERIOD_REPORT_V1'||report.version!==1||report.reportId!==boundary.reportId
      ||report.workspaceId!==boundary.workspaceId||report.through!==boundary.through||!Number.isSafeInteger(report.bytes)||report.bytes<1||report.bytes>135_000_000
      ||report.chunkCount!==Math.ceil(report.bytes/CHUNK_BYTES)||typeof report.sha256!=='string'||!/^[a-f0-9]{64}$/.test(report.sha256))
      throw new Error('Invalid trusted closed period report. Reconnect before saving.');
    const bytes=new Uint8Array(report.bytes);
    for(let start=0;start<report.chunkCount;start+=8){
      const snapshots=await Promise.all(Array.from({length:Math.min(8,report.chunkCount-start)},(_,i)=>ref.collection('chunks').doc(chunkId(boundary.reportId,start+i)).get({source:'server'})));
      requireUid(uid);
      for(let offset=0;offset<snapshots.length;offset++){
        const index=start+offset,doc=snapshots[offset],chunk=doc.data();
        if(!doc.exists||chunk?.revision!==boundary.reportId||chunk.index!==index)throw new Error('Invalid trusted closed period report chunk.');
        const part=decodeB64(chunk.data),expected=Math.min(CHUNK_BYTES,report.bytes-index*CHUNK_BYTES);
        if(part.length!==expected)throw new Error('Invalid trusted closed period report chunk length.');
        bytes.set(part,index*CHUNK_BYTES);
      }
    }
    if(await sha256(bytes)!==report.sha256)throw new Error('Trusted closed period report failed integrity verification.');
    const state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(state?.version!==1||state.workspaceId!==boundary.workspaceId||state.through!==boundary.through)throw new Error('Invalid trusted closed period report state.');
    return {meta:report,state};
}

/** Complete immutable report/audit catalog. No imported evidence ever writes these namespaces. */
export async function getPeriodReportArchive(uid:string):Promise<PeriodArchive|undefined>{
  const known=await getPeriodCloudControl(uid);if(!known)return undefined;requireUid(uid);
  const root=firebase.firestore().collection('users').doc(uid),controlRef=root.collection('accounting').doc('control');
  const initial=await controlRef.get({source:'server'});requireUid(uid);const control=initial.data();
  if(!initial.exists||control.generation!==known.generation)throw new Error('Period history changed during backup. Retry.');
  const catalog=async(name:string,max:number)=>{
    const rows:any[]=[];let last='';
    for(;;){
      let query=root.collection(name).orderBy(firebase.firestore.FieldPath.documentId()).limit(100);
      if(last)query=query.startAfter(last);
      const page=await query.get({source:'server'});requireUid(uid);
      for(const doc of page.docs){if(doc.id<=last||!/^[a-f0-9]{32}$/.test(doc.id))throw new Error('Invalid period archive catalog.');rows.push({id:doc.id,data:doc.data()});last=doc.id;}
      if(rows.length>max)throw new Error('Period archive is too large. No partial backup was saved.');
      if(page.docs.length<100)return rows;
    }
  };
  const timestamp=(value:any):string=>typeof value==='string'?value:typeof value?.toDate==='function'?value.toDate().toISOString():'';
  const reports:ArchivedPeriodReport[]=[];let bytes=0;
  for(const row of await catalog('periodReports',10000)){
    const meta=row.data;bytes+=Number(meta?.bytes);
    if(!Number.isSafeInteger(bytes)||bytes>50*1024*1024)throw new Error('Period archive exceeds 50 MB. No partial backup was saved.');
    if(meta?.reportId!==row.id)throw new Error('Invalid period archive report identity.');
    const {state}=await readPeriodReport(uid,{reportId:row.id,workspaceId:meta.workspaceId,through:meta.through});
    reports.push({reportId:row.id,workspaceId:meta.workspaceId,through:meta.through,sourceRevision:meta.sourceRevision,actorUid:meta.actorUid,reason:meta.reason,publishedAt:timestamp(meta.publishedAt),sha256:meta.sha256,state});
  }
  const operations:ArchivedPeriodOperation[]=(await catalog('periodOperations',50000)).map(row=>({opId:row.id,operation:row.data.operation,actorUid:row.data.actorUid,reason:row.data.reason??'',workspaceId:row.data.workspaceId??'',at:timestamp(row.data.at),result:row.data.result}));
  const latest=await controlRef.get({source:'server'});requireUid(uid);
  if(!latest.exists||JSON.stringify(latest.data())!==JSON.stringify(control))throw new Error('Period history changed during backup. Retry.');
  return {format:'LOUREX_PERIOD_ARCHIVE_V1',version:1,sourceUid:uid,generation:control.generation,reports,operations,boundaries:control.boundaries};
}

async function publishProtectedWorkspace(uid:string,local:PlainWorkspaceRecord,bytes:Uint8Array,hash:string,previous:PlainCloudMeta,generation:number):Promise<'pushed'|'remote-changed'>{
  const opId=newRevision(),count=Math.ceil(bytes.length/CHUNK_BYTES);
  const root=firebase.firestore().collection('users').doc(uid).collection('periodStaging').doc(opId);
  const meta:PlainCloudMeta={format:FORMAT,version:2,revision:opId,schemaVersion:local.schemaVersion,bytes:bytes.length,sha256:hash,chunkCount:count,updatedAt:local.updatedAt,parentRevision:previous.revision};
  // Create-only rules preserve staged bytes. Never overwrite or clean up an
  // ambiguous request: only the trusted server can publish authoritative data.
  for(let offset=0;offset<count;offset+=WRITE_BATCH_SIZE){
    requireUid(uid);
    const batch=firebase.firestore().batch();
    for(let i=offset;i<Math.min(count,offset+WRITE_BATCH_SIZE);i++)batch.set(root.collection('chunks').doc(String(i).padStart(5,'0')),{revision:opId,index:i,data:b64(bytes.subarray(i*CHUNK_BYTES,Math.min(bytes.length,(i+1)*CHUNK_BYTES)))});
    await batch.commit();
  }
  requireUid(uid);
  const batch=firebase.firestore().batch();batch.set(root,meta);await batch.commit();
  const token=await currentCloudIdToken();requireUid(uid);
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),60_000);
  try{
    const response=await fetch('/api/workspace-commit',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:'Bearer '+token},body:JSON.stringify({operation:'commit',opId,expectedRevision:previous.revision,expectedGeneration:generation}),signal:abort.signal});
    requireUid(uid);
    if(!response.ok){
      if(response.status===409)return 'remote-changed';
      const body=await response.json().catch(()=>null);
      if(body?.code==='PERIOD_CHANGED')throw new Error('PERIOD_CHANGED: This edit changes a closed period. Your device draft is retained.');
      throw new Error('Protected workspace synchronization failed. Your device draft is retained.');
    }
    // Never treat an HTTP response as proof of the exact payload. Re-read the
    // authoritative manifest and verify the staged hash before acknowledging.
    const committed=await getPlainCloudMeta(uid);
    if(!committed||committed.sha256!==hash||committed.chunkStorage!=='period-generations-v1')return 'remote-changed';
    await acknowledgePlainWorkspace(uid,local.localRevision,committed.revision,hash,local.baseCloudRevision);
    return 'pushed';
  }catch(error){
    // A lost response may follow a successful commit. Only an exact hash from
    // the authenticated account reconciles it; rejected/local work stays intact.
    requireUid(uid);
    const committed=await getPlainCloudMeta(uid).catch(()=>null);requireUid(uid);
    if(committed?.sha256===hash&&committed.chunkStorage==='period-generations-v1'){
      await acknowledgePlainWorkspace(uid,local.localRevision,committed.revision,hash,local.baseCloudRevision);
      return 'pushed';
    }
    throw error;
  }finally{clearTimeout(timer);}
}

export interface OwnerPeriodCommand {
  operation:'inspect'|'enroll'|'close'|'reopen';opId:string;expectedRevision:string;expectedGeneration:number;
  workspaceId?:string;reason?:string;through?:string;
}
export interface OwnerPeriodStatus {format:'LOUREX_PERIOD_STATUS_V1';version:1;enrolled:boolean;revision:string;sha256:string;generation:number;boundaries:Array<{workspaceId:string;through:string;reportId:string}>;}
export class PeriodOwnerError extends Error {constructor(public code:string,public status=0){super(code);}}
/** Owner authority is decided by the authenticated endpoint, never the selected local operator. */
export async function requestOwnerPeriodCommand(uid:string,input:OwnerPeriodCommand):Promise<any>{
  requireUid(uid);
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new PeriodOwnerError('PERIOD_OFFLINE');
  const command:any={operation:input.operation,opId:input.opId,expectedRevision:input.expectedRevision,expectedGeneration:input.expectedGeneration};
  if(input.operation==='close'||input.operation==='reopen'){command.workspaceId=input.workspaceId;command.reason=input.reason?.trim();}
  if(input.operation==='close')command.through=input.through;
  const body=JSON.stringify(command);
  if(new TextEncoder().encode(body).length>16_000)throw new PeriodOwnerError('INVALID_COMMAND');
  const token=await currentCloudIdToken();requireUid(uid);
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),60_000);
  try{
    const response=await fetch('/api/workspace-commit',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:'Bearer '+token},body,signal:abort.signal});
    const data=await response.json().catch(()=>null);requireUid(uid);
    if(!response.ok)throw new PeriodOwnerError(String(data?.code||(response.status===403?'PERIOD_OWNER_REQUIRED':response.status===401?'PERIOD_SIGN_IN_REQUIRED':'PERIOD_SERVICE_UNAVAILABLE')),response.status);
    if(!data||!Number.isSafeInteger(data.generation)||typeof data.revision!=='string')throw new PeriodOwnerError('PERIOD_INVALID_RESPONSE');
    return data;
  }catch(error){
    requireUid(uid);
    if(input.operation!=='inspect'&&(!(error instanceof PeriodOwnerError)||error.status>=500)){
      const receipt=await firebase.firestore().collection('users').doc(uid).collection('periodOperations').doc(input.opId).get({source:'server'}).catch(()=>null);requireUid(uid);
      const value=receipt?.data();
      if(receipt?.exists&&value?.actorUid===uid&&value.fingerprint===await sha256(new TextEncoder().encode(body))&&Number.isSafeInteger(value.result?.generation)&&typeof value.result?.revision==='string')return value.result;
    }
    throw error instanceof PeriodOwnerError?error:new PeriodOwnerError('PERIOD_NETWORK_UNKNOWN');
  }finally{clearTimeout(timer);}
}
