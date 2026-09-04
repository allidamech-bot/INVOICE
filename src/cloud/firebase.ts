import type { EncryptedVaultRecord, SecurityMetadata } from '../types.js';
import { createSafetySnapshot, getEncryptedVault, getSecurity, putSecurityAndVault } from '../storage/db.js';

declare const firebase: any;

export interface CloudUser { uid:string; email:string; }
export type CloudSyncResult = 'empty'|'same'|'pushed'|'pulled';

interface CloudVaultMeta {
  format:'LOUREX_CLOUD_V1'; version:1; revision:string; updatedAt:string; schemaVersion:number; iv:string;
  cipherLength:number; cipherSha256:string; chunkCount:number; security:SecurityMetadata;
  parentRevision?:string; deviceId?:string;
}
interface CloudSyncAnchor { revision:string; cipherSha256:string; updatedAt:string; }
interface CloudConflictToken { localHash:string; remoteRevision:string; remoteHash:string; detectedAt:string; }

const FIREBASE_CONFIG={apiKey:'AIzaSyAgakNDqcKlyAFiOyfm1ebA8PB-_HKM-go',authDomain:'lourex-invoice.firebaseapp.com',projectId:'lourex-invoice',storageBucket:'lourex-invoice.firebasestorage.app',messagingSenderId:'985119320046',appId:'1:985119320046:web:58798f19ad368a178510ff'};
const CLOUD_FORMAT='LOUREX_CLOUD_V1';
const CHUNK_SIZE=240_000;
const WRITE_BATCH_CHUNKS=12;
const WRITE_BATCH_CONCURRENCY=3;
const MAX_CIPHER_LENGTH=60_000_000;
const MAX_CHUNKS=Math.ceil(MAX_CIPHER_LENGTH/CHUNK_SIZE);
const HISTORY_LIMIT=12;
const HISTORY_DAILY_DAYS=30;
let initialized=false;

function ensureFirebase():void{
  if(typeof firebase==='undefined')throw new Error('Firebase is unavailable. Check your internet connection and reload.');
  if(!initialized){if(!firebase.apps?.length)firebase.initializeApp(FIREBASE_CONFIG);initialized=true;}
}
function auth():any{ensureFirebase();return firebase.auth();}
function db():any{ensureFirebase();return firebase.firestore();}
function userFrom(raw:any):CloudUser|null{return raw?{uid:String(raw.uid),email:String(raw.email||'')}:null;}
function vaultCollection(uid:string):any{return db().collection('users').doc(uid).collection('vault');}
function historyCollection(uid:string):any{return db().collection('users').doc(uid).collection('vaultHistory');}
function requireCurrentUid(uid:string):void{const current=auth().currentUser;if(!current||current.uid!==uid)throw new Error('Cloud session is not available for this account.');}
function markRecentAuth():void{try{sessionStorage.setItem('lourex-auth-just-signed-in','1');}catch{}}
function syncAnchorKey(uid:string):string{return `lourex-cloud-anchor:${uid}`;}
function conflictKey(uid:string):string{return `lourex-cloud-conflict:${uid}`;}
function deviceIdKey():string{return 'lourex-device-id';}
function currentDeviceId():string{
  try{
    const saved=localStorage.getItem(deviceIdKey());
    if(saved&&/^[a-z0-9-]{12,80}$/i.test(saved))return saved;
    const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);
    const created=`device-${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`;
    localStorage.setItem(deviceIdKey(),created);return created;
  }catch{return 'device-unknown';}
}
function readSyncAnchor(uid:string):CloudSyncAnchor|null{
  try{
    const raw=localStorage.getItem(syncAnchorKey(uid));if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed.revision!=='string'||typeof parsed.cipherSha256!=='string'||!/^[0-9a-f]{64}$/i.test(parsed.cipherSha256)||typeof parsed.updatedAt!=='string')return null;
    return {revision:parsed.revision,cipherSha256:parsed.cipherSha256,updatedAt:parsed.updatedAt};
  }catch{return null;}
}
function writeSyncAnchor(uid:string,meta:Pick<CloudVaultMeta,'revision'|'cipherSha256'|'updatedAt'>):void{
  try{localStorage.setItem(syncAnchorKey(uid),JSON.stringify({revision:meta.revision,cipherSha256:meta.cipherSha256,updatedAt:meta.updatedAt} satisfies CloudSyncAnchor));clearConflict(uid);}catch{}
}
function readConflict(uid:string):CloudConflictToken|null{
  try{
    const raw=localStorage.getItem(conflictKey(uid));if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed.localHash!=='string'||typeof parsed.remoteRevision!=='string'||typeof parsed.remoteHash!=='string'||typeof parsed.detectedAt!=='string')return null;
    return parsed as CloudConflictToken;
  }catch{return null;}
}
function writeConflict(uid:string,localHash:string,remote:CloudVaultMeta):void{
  try{localStorage.setItem(conflictKey(uid),JSON.stringify({localHash,remoteRevision:remote.revision,remoteHash:remote.cipherSha256,detectedAt:new Date().toISOString()} satisfies CloudConflictToken));}catch{}
}
function clearConflict(uid:string):void{try{localStorage.removeItem(conflictKey(uid));}catch{}}
function notifyCloudApplied():void{try{window.dispatchEvent(new Event('lourex-cloud-applied'));}catch{}}
function splitCipher(cipher:string):string[]{
  if(cipher.length>MAX_CIPHER_LENGTH)throw new Error('Encrypted vault is too large for cloud sync. Export a local backup and remove oversized images.');
  const out:string[]=[];for(let i=0;i<cipher.length;i+=CHUNK_SIZE)out.push(cipher.slice(i,i+CHUNK_SIZE));return out;
}
function revisionId():string{const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);return `${Date.now().toString(36)}-${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`;}
async function sha256(value:string):Promise<string>{
  const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function validBase64Bytes(value:unknown,minBytes:number,maxBytes:number):value is string{
  if(typeof value!=='string'||!value||value.length%4!==0||value.length>Math.ceil(maxBytes/3)*4+4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))return false;
  try{const bytes=atob(value).length;return bytes>=minBytes&&bytes<=maxBytes;}catch{return false;}
}
function validSecurity(value:any):value is SecurityMetadata{
  return Boolean(value&&value.id==='security'&&value.version===1&&Number.isInteger(value.iterations)&&value.iterations>=10_000&&value.iterations<=2_000_000&&validBase64Bytes(value.salt,16,64)&&validBase64Bytes(value.verifierIv,12,12)&&validBase64Bytes(value.verifierCipher,16,512));
}
function validMeta(data:any):data is CloudVaultMeta{
  return Boolean(data&&data.format===CLOUD_FORMAT&&data.version===1&&typeof data.revision==='string'&&data.revision.length>0&&data.revision.length<160&&typeof data.updatedAt==='string'&&!Number.isNaN(Date.parse(data.updatedAt))&&Number.isInteger(data.schemaVersion)&&data.schemaVersion>0&&data.schemaVersion<100&&validBase64Bytes(data.iv,12,12)&&Number.isInteger(data.cipherLength)&&data.cipherLength>0&&data.cipherLength<=MAX_CIPHER_LENGTH&&typeof data.cipherSha256==='string'&&/^[0-9a-f]{64}$/i.test(data.cipherSha256)&&Number.isInteger(data.chunkCount)&&data.chunkCount>=1&&data.chunkCount<=MAX_CHUNKS&&validSecurity(data.security));
}

export function cloudSupported():boolean{return typeof firebase!=='undefined';}
export async function waitForCloudUser():Promise<CloudUser|null>{
  ensureFirebase();
  try{await auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch{}
  const immediate=userFrom(auth().currentUser);if(immediate)return immediate;
  let recent=false;try{recent=sessionStorage.getItem('lourex-auth-just-signed-in')==='1';}catch{}
  const timeoutMs=recent?10_000:5_000;
  return new Promise(resolve=>{
    let settled=false;let off:undefined|(()=>void);
    const finish=(value:CloudUser|null)=>{if(settled)return;settled=true;if(off)off();try{if(value)sessionStorage.removeItem('lourex-auth-just-signed-in');}catch{}resolve(value);};
    const timeout=window.setTimeout(()=>finish(userFrom(auth().currentUser)),timeoutMs);
    off=auth().onAuthStateChanged((user:any)=>{window.clearTimeout(timeout);finish(userFrom(user));},()=>{window.clearTimeout(timeout);finish(null);});
  });
}
export function currentCloudUser():CloudUser|null{try{return userFrom(auth().currentUser);}catch{return null;}}
export async function createCloudUser(email:string,password:string):Promise<CloudUser>{ensureFirebase();await auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);const credential=await auth().createUserWithEmailAndPassword(email.trim(),password);const user=userFrom(credential.user);if(!user)throw new Error('Unable to create the cloud account.');markRecentAuth();return user;}
export async function signInCloudUser(email:string,password:string):Promise<CloudUser>{ensureFirebase();await auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);const credential=await auth().signInWithEmailAndPassword(email.trim(),password);const user=userFrom(credential.user);if(!user)throw new Error('Unable to sign in.');markRecentAuth();return user;}
export async function signOutCloudUser():Promise<void>{ensureFirebase();await auth().signOut();}
export async function sendCloudPasswordReset(email:string):Promise<void>{ensureFirebase();await auth().sendPasswordResetEmail(email.trim());}
export function friendlyCloudError(error:unknown):string{
  const code=String((error as any)?.code||'');
  if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found'))return 'Email or password is incorrect.';
  if(code.includes('email-already-in-use'))return 'This email already has a LOUREX cloud account.';
  if(code.includes('weak-password'))return 'Use a stronger password with at least 6 characters.';
  if(code.includes('invalid-email'))return 'Enter a valid email address.';
  if(code.includes('too-many-requests'))return 'Too many attempts. Try again later.';
  if(code.includes('network-request-failed'))return 'Cloud connection failed. Check your internet connection.';
  if(code.includes('permission-denied'))return 'Firebase security rules are not enabled for LOUREX yet.';
  if(String((error as any)?.message||'').includes('payload size exceeds'))return 'Cloud sync data is large. LOUREX will upload it in smaller secure parts; please try Sync Now again.';
  return error instanceof Error?error.message:'Cloud operation failed.';
}
export async function getCloudVaultMeta(uid:string):Promise<CloudVaultMeta|null>{requireCurrentUid(uid);const snap=await vaultCollection(uid).doc('meta').get();if(!snap.exists)return null;const data=snap.data();if(!validMeta(data))throw new Error('Cloud vault metadata is invalid.');return data;}
export function hasCloudConflict(uid:string):boolean{return Boolean(readConflict(uid));}
export async function cloudRemoteChangedSinceAnchor(uid:string):Promise<boolean>{
  requireCurrentUid(uid);const remote=await getCloudVaultMeta(uid);if(!remote)return false;const anchor=readSyncAnchor(uid);if(!anchor)return true;
  return remote.revision!==anchor.revision||remote.cipherSha256!==anchor.cipherSha256;
}
export function subscribeCloudVaultChanges(uid:string,onChanged:()=>void):()=>void{
  requireCurrentUid(uid);
  let lastNotified='';
  const off=vaultCollection(uid).doc('meta').onSnapshot((snap:any)=>{
    if(!snap.exists)return;const data=snap.data();if(!validMeta(data))return;
    window.setTimeout(()=>{
      const anchor=readSyncAnchor(uid);
      const changed=!anchor||anchor.revision!==data.revision||anchor.cipherSha256!==data.cipherSha256;
      if(!changed||lastNotified===data.revision)return;
      lastNotified=data.revision;onChanged();
    },60);
  },()=>undefined);
  return typeof off==='function'?off:()=>undefined;
}

async function writeChunkBatch(uid:string,revision:string,chunks:string[],offset:number):Promise<void>{
  const col=vaultCollection(uid);const batch=db().batch();
  chunks.slice(offset,offset+WRITE_BATCH_CHUNKS).forEach((data,index)=>batch.set(col.doc(`chunk-${revision}-${String(offset+index).padStart(5,'0')}`),{revision,index:offset+index,data}));
  await batch.commit();
}
async function writeChunks(uid:string,revision:string,chunks:string[]):Promise<void>{
  const offsets:Array<number>=[];for(let offset=0;offset<chunks.length;offset+=WRITE_BATCH_CHUNKS)offsets.push(offset);
  let cursor=0;const worker=async()=>{while(true){const slot=cursor++;if(slot>=offsets.length)return;await writeChunkBatch(uid,revision,chunks,offsets[slot]??0);}};
  await Promise.all(Array.from({length:Math.min(WRITE_BATCH_CONCURRENCY,offsets.length)},()=>worker()));
}
async function cleanupRevision(uid:string,revision:string,count:number):Promise<void>{
  if(!revision||count<=0||count>MAX_CHUNKS)return;const col=vaultCollection(uid);
  for(let offset=0;offset<count;offset+=200){const batch=db().batch();for(let i=offset;i<Math.min(count,offset+200);i++)batch.delete(col.doc(`chunk-${revision}-${String(i).padStart(5,'0')}`));try{await batch.commit();}catch{}}
}
async function archivePreviousRevision(uid:string,previous:CloudVaultMeta|null):Promise<void>{if(!previous)return;try{await historyCollection(uid).doc(previous.revision).set({...previous,archivedAt:new Date().toISOString()},{merge:true});}catch{}}
async function pruneCloudHistory(uid:string):Promise<void>{
  try{
    const snap=await historyCollection(uid).orderBy('updatedAt','desc').get();const docs=snap.docs||[];const keep=new Set<string>();
    docs.slice(0,HISTORY_LIMIT).forEach((doc:any)=>keep.add(String(doc.id)));
    const cutoff=Date.now()-HISTORY_DAILY_DAYS*24*60*60*1000;const keptDays=new Set<string>();
    for(const doc of docs){const data=doc.data();if(!validMeta(data))continue;const ms=Date.parse(data.updatedAt);if(!Number.isFinite(ms)||ms<cutoff)continue;const day=new Date(ms).toISOString().slice(0,10);if(!keptDays.has(day)){keptDays.add(day);keep.add(String(doc.id));}}
    for(const doc of docs){if(keep.has(String(doc.id)))continue;const data=doc.data();if(validMeta(data))await cleanupRevision(uid,data.revision,data.chunkCount);try{await doc.ref.delete();}catch{}}
  }catch{}
}
async function commitMetaIfUnchanged(uid:string,meta:CloudVaultMeta,previous:CloudVaultMeta|null):Promise<void>{
  const ref=vaultCollection(uid).doc('meta');
  await db().runTransaction(async(transaction:any)=>{
    const snap=await transaction.get(ref);
    if(previous){if(!snap.exists)throw new Error('Cloud changed during sync. Nothing was overwritten. Sync again to compare both copies.');const current=snap.data();if(!validMeta(current)||current.revision!==previous.revision||current.cipherSha256!==previous.cipherSha256)throw new Error('Cloud changed during sync. Nothing was overwritten. Sync again to compare both copies.');}
    else if(snap.exists)throw new Error('Cloud changed during sync. Nothing was overwritten. Sync again to compare both copies.');
    transaction.set(ref,meta);
  });
}
async function commitSingleChunkIfUnchanged(uid:string,meta:CloudVaultMeta,previous:CloudVaultMeta|null,cipher:string):Promise<void>{
  const col=vaultCollection(uid);const metaRef=col.doc('meta');const chunkRef=col.doc(`chunk-${meta.revision}-00000`);
  await db().runTransaction(async(transaction:any)=>{
    const snap=await transaction.get(metaRef);
    if(previous){if(!snap.exists)throw new Error('Cloud changed during sync. Nothing was overwritten. Sync again to compare both copies.');const current=snap.data();if(!validMeta(current)||current.revision!==previous.revision||current.cipherSha256!==previous.cipherSha256)throw new Error('Cloud changed during sync. Nothing was overwritten. Sync again to compare both copies.');}
    else if(snap.exists)throw new Error('Cloud changed during sync. Nothing was overwritten. Sync again to compare both copies.');
    transaction.set(chunkRef,{revision:meta.revision,index:0,data:cipher});transaction.set(metaRef,meta);
  });
}
async function publishVault(uid:string,security:SecurityMetadata,vault:EncryptedVaultRecord,previous:CloudVaultMeta|null):Promise<CloudVaultMeta>{
  if(vault.cipher.length>MAX_CIPHER_LENGTH)throw new Error('Encrypted vault is too large for cloud sync. Export a local backup and remove oversized images.');
  const cipherSha256=await sha256(vault.cipher);const chunks=splitCipher(vault.cipher);const revision=revisionId();
  const meta:CloudVaultMeta={format:CLOUD_FORMAT,version:1,revision,updatedAt:vault.updatedAt,schemaVersion:vault.schemaVersion,iv:vault.iv,cipherLength:vault.cipher.length,cipherSha256,chunkCount:chunks.length,security,parentRevision:previous?.revision||'',deviceId:currentDeviceId()};
  await archivePreviousRevision(uid,previous);
  try{
    if(chunks.length===1)await commitSingleChunkIfUnchanged(uid,meta,previous,chunks[0]??'');
    else{await writeChunks(uid,revision,chunks);await commitMetaIfUnchanged(uid,meta,previous);}
  }catch(error){if(chunks.length>1)await cleanupRevision(uid,revision,chunks.length);throw error;}
  writeSyncAnchor(uid,meta);if(previous&&previous.revision!==revision)void pruneCloudHistory(uid);return meta;
}

async function pullCloudVaultFromMeta(uid:string,meta:CloudVaultMeta):Promise<{security:SecurityMetadata;vault:EncryptedVaultRecord}>{
  const col=vaultCollection(uid);const chunks:string[]=[];
  for(let offset=0;offset<meta.chunkCount;offset+=24){
    const snaps=await Promise.all(Array.from({length:Math.min(24,meta.chunkCount-offset)},(_,j)=>{const i=offset+j;return col.doc(`chunk-${meta.revision}-${String(i).padStart(5,'0')}`).get();}));
    snaps.forEach((snap:any,j:number)=>{const i=offset+j;if(!snap.exists)throw new Error(`Cloud vault chunk ${i+1} is missing.`);const data=snap.data();if(data?.revision!==meta.revision||data?.index!==i||typeof data?.data!=='string'||data.data.length>CHUNK_SIZE)throw new Error('Cloud vault is incomplete.');chunks.push(data.data as string);});
  }
  const cipher=chunks.join('');if(cipher.length!==meta.cipherLength||await sha256(cipher)!==meta.cipherSha256)throw new Error('Cloud vault integrity check failed.');
  return {security:meta.security,vault:{id:'vault',schemaVersion:meta.schemaVersion,iv:meta.iv,cipher,updatedAt:meta.updatedAt}};
}
export async function pullCloudVault(uid:string):Promise<{security:SecurityMetadata;vault:EncryptedVaultRecord}|null>{requireCurrentUid(uid);const meta=await getCloudVaultMeta(uid);if(!meta)return null;return pullCloudVaultFromMeta(uid,meta);}
export async function installCloudVault(uid:string,notify=false):Promise<boolean>{
  const meta=await getCloudVaultMeta(uid);if(!meta)return false;const remote=await pullCloudVaultFromMeta(uid,meta);
  await createSafetySnapshot('pre-restore');await putSecurityAndVault(remote.security,remote.vault);writeSyncAnchor(uid,meta);clearConflict(uid);if(notify)notifyCloudApplied();return true;
}

export async function pushLocalVaultToCloud(uid:string,localSnapshot?:EncryptedVaultRecord|null):Promise<void>{
  requireCurrentUid(uid);
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('You are offline. Your local changes are safe and will sync when you reconnect.');
  const [security,storedVault,previous]=await Promise.all([getSecurity(),localSnapshot?Promise.resolve(localSnapshot):getEncryptedVault(),getCloudVaultMeta(uid)]);const vault=storedVault;
  if(!security||!vault)throw new Error('There is no local LOUREX vault to sync.');
  const localHash=await sha256(vault.cipher);
  if(previous&&previous.cipherSha256===localHash){writeSyncAnchor(uid,previous);return;}
  if(previous){
    const anchor=readSyncAnchor(uid);
    if(!anchor){writeConflict(uid,localHash,previous);throw new Error('This device and your LOUREX account contain different data and this device has no verified sync checkpoint. Nothing was overwritten. Choose which copy to keep in Cloud Sync.');}
    const localChanged=localHash!==anchor.cipherSha256;
    const remoteChanged=previous.revision!==anchor.revision||previous.cipherSha256!==anchor.cipherSha256;
    if(remoteChanged&&!localChanged){const installed=await installCloudVault(uid,true);if(!installed)throw new Error('The account copy disappeared during sync. Try again.');return;}
    if(remoteChanged&&localChanged){writeConflict(uid,localHash,previous);throw new Error('Your LOUREX account changed on another device while this device also has local changes. Nothing was overwritten. Both copies are safe; choose which copy to keep in Cloud Sync.');}
  }
  await publishVault(uid,security,vault,previous);
}

export async function resolveCloudConflictWithLocal(uid:string):Promise<void>{
  requireCurrentUid(uid);if(!readConflict(uid))throw new Error('There is no cloud conflict to resolve.');
  const [security,vault,previous]=await Promise.all([getSecurity(),getEncryptedVault(),getCloudVaultMeta(uid)]);if(!security||!vault)throw new Error('There is no local LOUREX data to publish.');
  await publishVault(uid,security,vault,previous);clearConflict(uid);
}
export async function resolveCloudConflictWithCloud(uid:string):Promise<void>{
  requireCurrentUid(uid);if(!readConflict(uid))throw new Error('There is no cloud conflict to resolve.');
  const installed=await installCloudVault(uid);if(!installed)throw new Error('The cloud copy is no longer available.');clearConflict(uid);
}

export async function reconcileCloudVault(uid:string):Promise<CloudSyncResult>{
  requireCurrentUid(uid);
  const [local,remote]=await Promise.all([getEncryptedVault(),getCloudVaultMeta(uid)]);
  if(!local&&!remote){clearConflict(uid);return 'empty';}
  const startup=Boolean(document.querySelector('.loading-screen'));
  if(local&&!remote){clearConflict(uid);if(startup){window.setTimeout(()=>void pushLocalVaultToCloud(uid).catch(()=>undefined),900);return 'same';}const security=await getSecurity();if(!security)throw new Error('Security settings are missing.');await publishVault(uid,security,local,null);return 'pushed';}
  if(!local&&remote){await installCloudVault(uid);return 'pulled';}
  if(!local||!remote)return 'empty';
  const localHash=await sha256(local.cipher);
  if(localHash===remote.cipherSha256){writeSyncAnchor(uid,remote);return 'same';}
  const anchor=readSyncAnchor(uid);
  if(!anchor){writeConflict(uid,localHash,remote);throw new Error('Cloud safety check found different local and account data with no verified sync checkpoint. Nothing was overwritten. Both copies are safe; choose which copy to keep in Cloud Sync.');}
  const localChanged=localHash!==anchor.cipherSha256;
  const remoteChanged=remote.revision!==anchor.revision||remote.cipherSha256!==anchor.cipherSha256;
  if(remoteChanged&&!localChanged){await installCloudVault(uid);return 'pulled';}
  if(localChanged&&!remoteChanged){if(startup){window.setTimeout(()=>void pushLocalVaultToCloud(uid).catch(()=>undefined),900);return 'same';}const security=await getSecurity();if(!security)throw new Error('Security settings are missing.');await publishVault(uid,security,local,remote);return 'pushed';}
  if(localChanged&&remoteChanged){writeConflict(uid,localHash,remote);throw new Error('Cloud conflict detected: this device and another device both changed since the last successful sync. Nothing was overwritten. Both copies are safe; choose which copy to keep in Cloud Sync.');}
  writeSyncAnchor(uid,remote);return 'same';
}
