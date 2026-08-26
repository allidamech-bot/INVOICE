import type { EncryptedVaultRecord, SecurityMetadata } from '../types.js';
import { getEncryptedVault, getSecurity, putSecurityAndVault } from '../storage/db.js';

declare const firebase: any;

export interface CloudUser { uid:string; email:string; }
export type CloudSyncResult = 'empty'|'same'|'pushed'|'pulled';

interface CloudVaultMeta {
  format:'LOUREX_CLOUD_V1';
  version:1;
  revision:string;
  updatedAt:string;
  schemaVersion:number;
  iv:string;
  cipherLength:number;
  cipherSha256:string;
  chunkCount:number;
  security:SecurityMetadata;
}

const FIREBASE_CONFIG={
  apiKey:'AIzaSyAgakNDqcKlyAFiOyfm1ebA8PB-_HKM-go',
  authDomain:'lourex-invoice.firebaseapp.com',
  projectId:'lourex-invoice',
  storageBucket:'lourex-invoice.firebasestorage.app',
  messagingSenderId:'985119320046',
  appId:'1:985119320046:web:58798f19ad368a178510ff'
};
const CLOUD_FORMAT='LOUREX_CLOUD_V1';
const CHUNK_SIZE=400_000;
const MAX_CIPHER_LENGTH=60_000_000;
const MAX_CHUNKS=Math.ceil(MAX_CIPHER_LENGTH/CHUNK_SIZE);
let initialized=false;

function ensureFirebase():void{
  if(typeof firebase==='undefined')throw new Error('Firebase is unavailable. Check your internet connection and reload.');
  if(!initialized){
    if(!firebase.apps?.length)firebase.initializeApp(FIREBASE_CONFIG);
    initialized=true;
  }
}
function auth():any{ensureFirebase();return firebase.auth();}
function db():any{ensureFirebase();return firebase.firestore();}
function userFrom(raw:any):CloudUser|null{return raw?{uid:String(raw.uid),email:String(raw.email||'')}:null;}
function vaultCollection(uid:string):any{return db().collection('users').doc(uid).collection('vault');}
function requireCurrentUid(uid:string):void{const current=auth().currentUser;if(!current||current.uid!==uid)throw new Error('Cloud session is not available for this account.');}
function splitCipher(cipher:string):string[]{if(cipher.length>MAX_CIPHER_LENGTH)throw new Error('Encrypted vault is too large for cloud sync. Export a local backup and remove oversized images.');const out:string[]=[];for(let i=0;i<cipher.length;i+=CHUNK_SIZE)out.push(cipher.slice(i,i+CHUNK_SIZE));return out;}
function revisionId():string{const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);return `${Date.now().toString(36)}-${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`;}
async function sha256(value:string):Promise<string>{const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
function validSecurity(value:any):value is SecurityMetadata{
  return Boolean(
    value&&value.id==='security'&&value.version===1&&
    Number.isInteger(value.iterations)&&value.iterations>=10_000&&value.iterations<=2_000_000&&
    typeof value.salt==='string'&&value.salt.length>=16&&value.salt.length<=128&&
    typeof value.verifierIv==='string'&&value.verifierIv.length>=12&&value.verifierIv.length<=128&&
    typeof value.verifierCipher==='string'&&value.verifierCipher.length>=16&&value.verifierCipher.length<=2048
  );
}
function validMeta(data:any):data is CloudVaultMeta{
  return Boolean(data&&data.format===CLOUD_FORMAT&&data.version===1&&typeof data.revision==='string'&&data.revision.length>0&&data.revision.length<160&&typeof data.updatedAt==='string'&&!Number.isNaN(Date.parse(data.updatedAt))&&Number.isInteger(data.schemaVersion)&&data.schemaVersion>0&&data.schemaVersion<100&&typeof data.iv==='string'&&data.iv.length>=12&&Number.isInteger(data.cipherLength)&&data.cipherLength>0&&data.cipherLength<=MAX_CIPHER_LENGTH&&typeof data.cipherSha256==='string'&&/^[0-9a-f]{64}$/i.test(data.cipherSha256)&&Number.isInteger(data.chunkCount)&&data.chunkCount>=1&&data.chunkCount<=MAX_CHUNKS&&validSecurity(data.security));
}

export function cloudSupported():boolean{return typeof firebase!=='undefined';}

export async function waitForCloudUser():Promise<CloudUser|null>{
  ensureFirebase();
  try{await auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch{}
  return new Promise(resolve=>{const off=auth().onAuthStateChanged((user:any)=>{off();resolve(userFrom(user));},()=>resolve(null));});
}
export function currentCloudUser():CloudUser|null{try{return userFrom(auth().currentUser);}catch{return null;}}
export async function createCloudUser(email:string,password:string):Promise<CloudUser>{
  ensureFirebase();
  await auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const credential=await auth().createUserWithEmailAndPassword(email.trim(),password);
  const user=userFrom(credential.user);if(!user)throw new Error('Unable to create the cloud account.');return user;
}
export async function signInCloudUser(email:string,password:string):Promise<CloudUser>{
  ensureFirebase();
  await auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const credential=await auth().signInWithEmailAndPassword(email.trim(),password);
  const user=userFrom(credential.user);if(!user)throw new Error('Unable to sign in.');return user;
}
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
  return error instanceof Error?error.message:'Cloud operation failed.';
}

export async function getCloudVaultMeta(uid:string):Promise<CloudVaultMeta|null>{
  requireCurrentUid(uid);
  const snap=await vaultCollection(uid).doc('meta').get();
  if(!snap.exists)return null;
  const data=snap.data();
  if(!validMeta(data))throw new Error('Cloud vault metadata is invalid.');
  return data;
}

async function writeChunks(uid:string,revision:string,chunks:string[]):Promise<void>{
  const col=vaultCollection(uid);
  for(let offset=0;offset<chunks.length;offset+=400){
    const batch=db().batch();
    chunks.slice(offset,offset+400).forEach((data,index)=>batch.set(col.doc(`chunk-${revision}-${String(offset+index).padStart(5,'0')}`),{revision,index:offset+index,data}));
    await batch.commit();
  }
}
async function cleanupRevision(uid:string,revision:string,count:number):Promise<void>{
  if(!revision||count<=0||count>MAX_CHUNKS)return;
  const col=vaultCollection(uid);
  for(let offset=0;offset<count;offset+=400){
    const batch=db().batch();
    for(let i=offset;i<Math.min(count,offset+400);i++)batch.delete(col.doc(`chunk-${revision}-${String(i).padStart(5,'0')}`));
    try{await batch.commit();}catch{}
  }
}

export async function pushLocalVaultToCloud(uid:string):Promise<void>{
  requireCurrentUid(uid);
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('You are offline. Your local changes are safe and will sync when you reconnect.');
  const [security,vault,previous]=await Promise.all([getSecurity(),getEncryptedVault(),getCloudVaultMeta(uid)]);
  if(!security||!vault)throw new Error('There is no local LOUREX vault to sync.');
  if(vault.cipher.length>MAX_CIPHER_LENGTH)throw new Error('Encrypted vault is too large for cloud sync. Export a local backup and remove oversized images.');
  if(previous&&previous.updatedAt>vault.updatedAt)throw new Error('Cloud has newer changes from another device. Use Sync Now before making more cloud changes.');
  const cipherSha256=await sha256(vault.cipher);
  if(previous&&previous.updatedAt===vault.updatedAt){
    if(previous.cipherSha256===cipherSha256)return;
    throw new Error('Cloud conflict detected: two different encrypted vaults have the same modification time. Sync manually before continuing.');
  }
  const chunks=splitCipher(vault.cipher);
  const revision=revisionId();
  const meta:CloudVaultMeta={format:CLOUD_FORMAT,version:1,revision,updatedAt:vault.updatedAt,schemaVersion:vault.schemaVersion,iv:vault.iv,cipherLength:vault.cipher.length,cipherSha256,chunkCount:chunks.length,security};
  try{
    await writeChunks(uid,revision,chunks);
    await vaultCollection(uid).doc('meta').set(meta);
  }catch(error){
    await cleanupRevision(uid,revision,chunks.length);
    throw error;
  }
  if(previous&&previous.revision!==revision)void cleanupRevision(uid,previous.revision,previous.chunkCount);
}

export async function pullCloudVault(uid:string):Promise<{security:SecurityMetadata;vault:EncryptedVaultRecord}|null>{
  requireCurrentUid(uid);
  const meta=await getCloudVaultMeta(uid);if(!meta)return null;
  const col=vaultCollection(uid);
  const snaps=await Promise.all(Array.from({length:meta.chunkCount},(_,i)=>col.doc(`chunk-${meta.revision}-${String(i).padStart(5,'0')}`).get()));
  const chunks=snaps.map((snap:any,i:number)=>{if(!snap.exists)throw new Error(`Cloud vault chunk ${i+1} is missing.`);const data=snap.data();if(data?.revision!==meta.revision||data?.index!==i||typeof data?.data!=='string'||data.data.length>CHUNK_SIZE)throw new Error('Cloud vault is incomplete.');return data.data as string;});
  const cipher=chunks.join('');
  if(cipher.length!==meta.cipherLength||await sha256(cipher)!==meta.cipherSha256)throw new Error('Cloud vault integrity check failed.');
  return {security:meta.security,vault:{id:'vault',schemaVersion:meta.schemaVersion,iv:meta.iv,cipher,updatedAt:meta.updatedAt}};
}

export async function installCloudVault(uid:string):Promise<boolean>{const remote=await pullCloudVault(uid);if(!remote)return false;await putSecurityAndVault(remote.security,remote.vault);return true;}

export async function reconcileCloudVault(uid:string):Promise<CloudSyncResult>{
  requireCurrentUid(uid);
  const [local,remote]=await Promise.all([getEncryptedVault(),getCloudVaultMeta(uid)]);
  if(!local&&!remote)return 'empty';
  if(local&&!remote){await pushLocalVaultToCloud(uid);return 'pushed';}
  if(!local&&remote){await installCloudVault(uid);return 'pulled';}
  if(!local||!remote)return 'empty';
  if(remote.updatedAt>local.updatedAt){await installCloudVault(uid);return 'pulled';}
  if(local.updatedAt>remote.updatedAt){await pushLocalVaultToCloud(uid);return 'pushed';}
  const localHash=await sha256(local.cipher);
  if(localHash!==remote.cipherSha256)throw new Error('Cloud conflict detected: two different encrypted vaults have the same modification time.');
  return 'same';
}
