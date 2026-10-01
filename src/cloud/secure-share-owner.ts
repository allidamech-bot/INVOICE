import type { LourexDocument } from '../types.js';
import { currentCloudUser } from './firebase.js';
import { SECURE_SHARE_FORMAT, SECURE_SHARE_TOKEN_PATTERN, newSecureShareToken, sanitizeDocumentForSecureShare, secureShareAllowsDecision, secureShareExpiry, type SecureShareDecision, type SecureShareRecord } from '../lib/secure-share.js';

declare const firebase:any;
type ShareListener=(shares:SecureShareRecord[])=>void;

function ownerDb():any{
  const user=currentCloudUser();if(!user?.uid)throw new Error('Connect your LOUREX cloud account before using secure customer links.');
  return firebase.firestore();
}
function requireOwnerUid():string{const user=currentCloudUser();if(!user?.uid)throw new Error('Connect your LOUREX cloud account before using secure customer links.');return user.uid;}
function timestamp(value:any):string{if(!value)return'';try{if(typeof value.toDate==='function')return value.toDate().toISOString();}catch{}const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toISOString();}
function normalizeShare(id:string,data:any):SecureShareRecord|null{
  if(!SECURE_SHARE_TOKEN_PATTERN.test(id)||!data||data.format!==SECURE_SHARE_FORMAT||data.version!==1||typeof data.ownerUid!=='string'||typeof data.documentId!=='string'||typeof data.customerId!=='string'||!data.snapshot)return null;
  const decision:SecureShareDecision=data.decision==='accepted'||data.decision==='rejected'?data.decision:'';
  return{id,format:SECURE_SHARE_FORMAT,version:1,ownerUid:data.ownerUid,documentId:String(data.documentId),documentNumber:String(data.documentNumber||''),documentKind:data.documentKind,documentRole:data.documentRole,customerId:String(data.customerId),customerNameEn:String(data.customerNameEn||''),customerNameAr:String(data.customerNameAr||''),customerEmail:String(data.customerEmail||''),allowDecision:Boolean(data.allowDecision),createdAt:timestamp(data.createdAt),expiresAt:timestamp(data.expiresAt),revokedAt:timestamp(data.revokedAt),viewedAt:timestamp(data.viewedAt),decision,decisionAt:timestamp(data.decisionAt),customerComment:String(data.customerComment||''),commentAt:timestamp(data.commentAt),updatedAt:timestamp(data.updatedAt),snapshot:data.snapshot as LourexDocument};
}
function sorted(items:SecureShareRecord[]):SecureShareRecord[]{return items.sort((a,b)=>(b.createdAt||b.updatedAt).localeCompare(a.createdAt||a.updatedAt));}

export async function createSecureShare(doc:LourexDocument,days=7,allowDecision=secureShareAllowsDecision(doc)):Promise<SecureShareRecord>{
  const uid=requireOwnerUid(),db=ownerDb(),id=newSecureShareToken(),snapshot=sanitizeDocumentForSecureShare(doc),customer=doc.customerSnapshot;if(!customer)throw new Error('A customer is required before secure sharing.');
  const now=new Date(),expiresAt=secureShareExpiry(days,now),payload={format:SECURE_SHARE_FORMAT,version:1,ownerUid:uid,documentId:doc.id,documentNumber:doc.number,documentKind:doc.kind,documentRole:doc.role,customerId:customer.sourceCustomerId,customerNameEn:customer.companyNameEn||'',customerNameAr:customer.companyNameAr||'',customerEmail:customer.email||'',allowDecision:Boolean(allowDecision&&secureShareAllowsDecision(doc)),createdAt:firebase.firestore.Timestamp.fromDate(now),expiresAt:firebase.firestore.Timestamp.fromDate(new Date(expiresAt)),revokedAt:null,viewedAt:null,decision:'',decisionAt:null,customerComment:'',commentAt:null,updatedAt:firebase.firestore.Timestamp.fromDate(now),snapshot};
  await db.collection('publicShares').doc(id).set(payload);const item=normalizeShare(id,payload);if(!item)throw new Error('Secure share could not be verified after creation.');return item;
}

export async function revokeSecureShare(id:string):Promise<void>{
  const uid=requireOwnerUid(),db=ownerDb();if(!SECURE_SHARE_TOKEN_PATTERN.test(id))throw new Error('Secure share token is invalid.');const ref=db.collection('publicShares').doc(id),snap=await ref.get();if(!snap.exists||String(snap.data()?.ownerUid||'')!==uid)throw new Error('Secure share was not found for this account.');const now=firebase.firestore.FieldValue.serverTimestamp();await ref.update({revokedAt:now,updatedAt:now});
}

export function subscribeOwnerSecureShares(onChange:ShareListener,onError?:(error:unknown)=>void):()=>void{
  let uid='';let db:any;try{uid=requireOwnerUid();db=ownerDb();}catch(error){onError?.(error);return()=>undefined;}
  const off=db.collection('publicShares').where('ownerUid','==',uid).limit(250).onSnapshot((snap:any)=>{const out:SecureShareRecord[]=[];for(const doc of snap.docs||[]){const item=normalizeShare(String(doc.id),doc.data());if(item)out.push(item);}onChange(sorted(out));},(error:any)=>onError?.(error));return typeof off==='function'?off:()=>undefined;
}
