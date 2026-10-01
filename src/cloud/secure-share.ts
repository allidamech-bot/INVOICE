import type { LourexDocument } from '../types.js';
import { currentCloudUser } from './firebase.js';
import { buildPublicShareSnapshot } from '../lib/secure-share-snapshot.js';

declare const firebase:any;

export type SecureShareResponseStatus='pending'|'commented'|'accepted'|'rejected';
export interface SecureShareRecord{
  id:string;ownerUid:string;documentId:string;customerId:string;documentNumber:string;kind:string;currency:string;
  createdAt:string;updatedAt:string;expiresAt:string;revokedAt:string;viewedAt:string;respondedAt:string;
  responseStatus:SecureShareResponseStatus;customerComment:string;url:string;
}

const COLLECTION='secureShares';
function db():any{
  const user=currentCloudUser();
  if(!user)throw new Error('Connect LOUREX Cloud before creating or managing Secure Shares.');
  if(typeof firebase==='undefined'||typeof firebase.firestore!=='function')throw new Error('Firebase is unavailable. Check your connection and reload.');
  return firebase.firestore();
}
function newToken():string{
  const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function urlFor(id:string):string{return typeof location==='undefined'?`/share.html#${id}`:`${location.origin}/share.html#${id}`;}
function iso(value:any):string{try{return value?.toDate?.().toISOString?.()||'';}catch{return'';}}
function normalize(id:string,data:any):SecureShareRecord{
  const status=String(data?.responseStatus||'pending');
  return{id,ownerUid:String(data?.ownerUid||''),documentId:String(data?.documentId||''),customerId:String(data?.customerId||''),documentNumber:String(data?.documentNumber||''),kind:String(data?.kind||''),currency:String(data?.currency||''),createdAt:iso(data?.createdAt),updatedAt:iso(data?.updatedAt),expiresAt:iso(data?.expiresAt),revokedAt:iso(data?.revokedAt),viewedAt:iso(data?.viewedAt),respondedAt:iso(data?.respondedAt),responseStatus:(status==='commented'||status==='accepted'||status==='rejected')?status:'pending',customerComment:String(data?.customerComment||''),url:urlFor(id)};
}
async function ownerRows():Promise<Array<{id:string;data:any}>>{
  const user=currentCloudUser();if(!user)throw new Error('Cloud account required.');
  const snap=await db().collection(COLLECTION).where('ownerUid','==',user.uid).get();
  return (snap.docs||[]).map((entry:any)=>({id:String(entry.id),data:entry.data()}));
}

export async function createSecureShare(document:LourexDocument,expiresInDays:number):Promise<SecureShareRecord>{
  const user=currentCloudUser();if(!user)throw new Error('Cloud account required.');
  if(!Number.isInteger(expiresInDays)||expiresInDays<1||expiresInDays>90)throw new Error('Secure Share expiry must be between 1 and 90 days.');
  const id=newToken(),snapshot=buildPublicShareSnapshot(document),serverNow=firebase.firestore.FieldValue.serverTimestamp(),expiresAt=firebase.firestore.Timestamp.fromDate(new Date(Date.now()+expiresInDays*86_400_000));
  await db().collection(COLLECTION).doc(id).set({format:'LOUREX_SECURE_SHARE_V1',version:1,ownerUid:user.uid,documentId:document.id,customerId:document.customerSnapshot?.sourceCustomerId||'',documentNumber:document.number,kind:document.kind,currency:document.currency,createdAt:serverNow,updatedAt:serverNow,expiresAt,revokedAt:null,viewedAt:null,respondedAt:null,responseStatus:'pending',customerComment:'',snapshot});
  const saved=await db().collection(COLLECTION).doc(id).get();return normalize(id,saved.data());
}
export async function listSecureSharesForDocument(documentId:string):Promise<SecureShareRecord[]>{
  const rows=await ownerRows();return rows.filter(row=>String(row.data?.documentId||'')===documentId).map(row=>normalize(row.id,row.data)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function listSecureSharesForCustomer(customerId:string):Promise<SecureShareRecord[]>{
  const rows=await ownerRows();return rows.filter(row=>String(row.data?.customerId||'')===customerId).map(row=>normalize(row.id,row.data)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function revokeSecureShare(id:string):Promise<void>{
  if(!/^[A-Za-z0-9_-]{32}$/.test(id))throw new Error('Invalid Secure Share ID.');
  const user=currentCloudUser();if(!user)throw new Error('Cloud account required.');const ref=db().collection(COLLECTION).doc(id),snap=await ref.get();
  if(!snap.exists||snap.data()?.ownerUid!==user.uid)throw new Error('Secure Share not found.');
  await ref.update({revokedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
}
