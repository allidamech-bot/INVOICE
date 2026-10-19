import { t } from '../lib/i18n.js';
import type { LourexDocument } from '../types.js';
import { currentCloudUser } from './firebase.js';
import { SECURE_SHARE_FORMAT, SECURE_SHARE_TOKEN_PATTERN, newSecureShareToken, sanitizeDocumentForSecureShare, secureShareAllowsDecision, secureShareExpiry, secureShareIsActive, automaticElectronicDocument, electronicDocumentFingerprint, type SecureShareDecision, type SecureShareRecord } from '../lib/secure-share.js';

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

function buildSharePayload(doc:LourexDocument,uid:string,days:number,allowDecision:boolean):any{
  const snapshot=sanitizeDocumentForSecureShare(doc),customer=doc.customerSnapshot;
  if(!customer)throw new Error('A customer is required before secure sharing.');
  const now=new Date(),expiresAt=secureShareExpiry(days,now),payload={format:SECURE_SHARE_FORMAT,version:1,ownerUid:uid,documentId:doc.id,documentNumber:doc.number,documentKind:doc.kind,documentRole:snapshot.role,customerId:customer.sourceCustomerId,customerNameEn:customer.companyNameEn||'',customerNameAr:customer.companyNameAr||'',customerEmail:customer.email||'',allowDecision:Boolean(allowDecision&&secureShareAllowsDecision(doc)),createdAt:firebase.firestore.Timestamp.fromDate(now),expiresAt:firebase.firestore.Timestamp.fromDate(new Date(expiresAt)),revokedAt:null,viewedAt:null,decision:'',decisionAt:null,customerComment:'',commentAt:null,updatedAt:firebase.firestore.Timestamp.fromDate(now),snapshot};
  return payload;
}
export async function createSecureShare(doc:LourexDocument,days=7,allowDecision=secureShareAllowsDecision(doc)):Promise<SecureShareRecord>{
  const uid=requireOwnerUid(),db=ownerDb(),id=newSecureShareToken(),payload=buildSharePayload(doc,uid,days,allowDecision);
  await db.collection('publicShares').doc(id).set(payload);const item=normalizeShare(id,payload);if(!item)throw new Error('Secure share could not be verified after creation.');return item;
}

/** One immutable public snapshot per issued document version, used by ordinary
 * output and previews. The private index makes concurrent tabs reuse one QR. */
export async function ensureDocumentElectronicCopy(doc:LourexDocument,options:{renew?:boolean;allowInactive?:boolean;isCurrent?:()=>boolean}={}):Promise<SecureShareRecord>{
  if(!automaticElectronicDocument(doc))throw new Error(t('Issue a quotation or invoice before opening its electronic document.','أصدر عرض السعر أو الفاتورة لفتح نسخته الإلكترونية.'));
  let uid:string;try{uid=requireOwnerUid();}catch{throw new Error(t('Connect your LOUREX cloud account to activate the document QR.','اتصل بحساب LOUREX السحابي لتفعيل QR للمستند.'));}
  const db=ownerDb(),fingerprint=await electronicDocumentFingerprint(doc);
  const current=()=>requireOwnerUid()===uid&&(!options.isCurrent||options.isCurrent());
  if(!current())throw new Error('Account or document changed.');
    const binding=db.collection('users').doc(uid).collection('documentElectronicCopies').doc(fingerprint);
    const result=await db.runTransaction(async(transaction:any)=>{
      if(!current())throw new Error('Account or document changed.');
      const found=await transaction.get(binding),token=found.exists?String(found.data()?.token||''):'';
      if(found.exists&&!options.renew){
        if(!SECURE_SHARE_TOKEN_PATTERN.test(token))throw new Error('Electronic document reference is invalid.');
        const snap=await transaction.get(db.collection('publicShares').doc(token)),share=snap.exists?normalizeShare(token,snap.data()):null;
        if(!share||share.ownerUid!==uid||share.documentId!==doc.id||share.snapshot.id!==doc.id)throw new Error('Electronic document is unavailable.');
        if(!current())throw new Error('Account or document changed.');
        if(!options.allowInactive&&!secureShareIsActive(share))throw new Error(t('The document QR is disabled or expired. Open Electronic document to reactivate it.','رابط QR متوقف أو منتهي. افتح النسخة الإلكترونية لإعادة تفعيله.'));
        return share;
      }
      // Creating a read-only electronic rendering never records sent/accepted
      // evidence or executes any accounting/customer decision action.
      const id=newSecureShareToken(),payload=buildSharePayload(doc,uid,3650,false);
      if(!current())throw new Error('Account or document changed.');
      transaction.set(db.collection('publicShares').doc(id),payload);
      transaction.set(binding,{token:id,documentId:doc.id,fingerprint,createdAt:payload.createdAt});
      const share=normalizeShare(id,payload);if(!share)throw new Error('Electronic document could not be verified.');return share;
    });
    if(!current())throw new Error('Account or document changed.');
    return result;
}

export async function revokeSecureShare(id:string):Promise<void>{
  const uid=requireOwnerUid(),db=ownerDb();if(!SECURE_SHARE_TOKEN_PATTERN.test(id))throw new Error('Secure share token is invalid.');const ref=db.collection('publicShares').doc(id),snap=await ref.get();if(!snap.exists||String(snap.data()?.ownerUid||'')!==uid)throw new Error('Secure share was not found for this account.');const now=firebase.firestore.FieldValue.serverTimestamp();await ref.update({revokedAt:now,updatedAt:now});
}

/** Re-read before export so a revoked/expired link cannot be printed as active. */
export async function loadSecureShareForOutput(id:string,documentId:string):Promise<SecureShareRecord>{
  const uid=requireOwnerUid(),db=ownerDb();
  if(!SECURE_SHARE_TOKEN_PATTERN.test(id))throw new Error('Secure share token is invalid.');
  const snap=await db.collection('publicShares').doc(id).get();
  const share=snap.exists?normalizeShare(id,snap.data()):null;
  if(requireOwnerUid()!==uid||!share||share.ownerUid!==uid||share.documentId!==documentId||share.snapshot.id!==documentId||!secureShareIsActive(share))throw new Error('This electronic copy is unavailable, expired, or revoked.');
  return share;
}

export function subscribeOwnerSecureShares(onChange:ShareListener,onError?:(error:unknown)=>void):()=>void{
  let uid='';let db:any;try{uid=requireOwnerUid();db=ownerDb();}catch(error){onError?.(error);return()=>undefined;}
  const off=db.collection('publicShares').where('ownerUid','==',uid).limit(250).onSnapshot((snap:any)=>{const out:SecureShareRecord[]=[];for(const doc of snap.docs||[]){const item=normalizeShare(String(doc.id),doc.data());if(item)out.push(item);}onChange(sorted(out));},(error:any)=>onError?.(error));return typeof off==='function'?off:()=>undefined;
}
