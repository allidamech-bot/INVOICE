import type { LourexDocument } from '../types.js';
import { isQuoteLikeDocument } from './commercial-flow.js';
import { isIsoDate } from './id.js';

export const SECURE_SHARE_FORMAT='LOUREX_SECURE_SHARE_V1' as const;
export const SECURE_SHARE_TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;
export const SECURE_SHARE_MAX_COMMENT=1000;
export const SECURE_SHARE_MAX_SNAPSHOT_BYTES=760_000;

export type SecureShareDecision=''|'accepted'|'rejected';

export interface SecureShareRecord {
  id:string;
  format:typeof SECURE_SHARE_FORMAT;
  version:1;
  ownerUid:string;
  documentId:string;
  documentNumber:string;
  documentKind:LourexDocument['kind'];
  documentRole:LourexDocument['role'];
  customerId:string;
  customerNameEn:string;
  customerNameAr:string;
  customerEmail:string;
  allowDecision:boolean;
  createdAt:string;
  expiresAt:string;
  revokedAt:string;
  viewedAt:string;
  decision:SecureShareDecision;
  decisionAt:string;
  customerComment:string;
  commentAt:string;
  updatedAt:string;
  snapshot:LourexDocument;
}

export function secureShareEligible(doc:LourexDocument):boolean{
  if(doc.status!=='final'||doc.lifecycleStatus==='voided'||!doc.customerSnapshot?.sourceCustomerId)return false;
  if(doc.kind==='draft'||doc.kind==='rfq'||doc.kind==='purchase-order')return false;
  return true;
}

export function secureShareAllowsDecision(doc:LourexDocument):boolean{return isQuoteLikeDocument(doc);}

export function automaticElectronicDocument(doc:LourexDocument):boolean{
  return ['proforma','proforma-invoice','invoice'].includes(doc.kind)&&secureShareEligible(doc);
}

/** Identity of customer-visible content; saves/internal cost changes do not
 * create a second electronic document. Revisions and visible edits do. */
export async function electronicDocumentFingerprint(doc:LourexDocument):Promise<string>{
  const snapshot=sanitizeDocumentForSecureShare(doc);snapshot.updatedAt='';
  const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(snapshot))));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function sanitizeDocumentForSecureShare(doc:LourexDocument):LourexDocument{
  if(!secureShareEligible(doc))throw new Error('Only active final customer documents can be shared securely.');
  const snapshot=structuredClone(doc);
  snapshot.attachments=[];
  snapshot.internalCosts={shippingCost:'0.00',otherCost:'0.00'};
  snapshot.items=snapshot.items.map(item=>({...item,unitCost:''}));
  snapshot.convertedFromId='';
  snapshot.updatedAt=doc.updatedAt;
  // Legacy documents and optional commercial fields can contain `undefined`.
  // JSON serialization already removes them from the customer-visible
  // fingerprint; Firestore, however, rejects an undefined value *anywhere*
  // inside transaction.set(publicShares). Serialize the redacted snapshot once
  // so the fingerprint, immutable share and database all use identical content.
  // Arrays follow JSON semantics (undefined -> null); objects omit the key.
  // Do not mutate the document stored in the customer's encrypted vault.
  if(snapshot.role===undefined)snapshot.role='standard';
  const serialized=JSON.stringify(snapshot);
  if(!serialized)throw new Error('The electronic document could not be serialized.');
  const bytes=new TextEncoder().encode(serialized).byteLength;
  if(bytes>SECURE_SHARE_MAX_SNAPSHOT_BYTES)throw new Error('This document is too large for a secure customer link. Reduce embedded logo/signature/stamp image size and try again.');
  return JSON.parse(serialized) as LourexDocument;
}

export function newSecureShareToken():string{
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function secureShareUrl(id:string,origin=typeof location!=='undefined'?location.origin:''):string{
  if(!SECURE_SHARE_TOKEN_PATTERN.test(id))throw new Error('Secure share token is invalid.');
  return `${origin.replace(/\/$/,'')}/share.html#${id}`;
}

export function secureShareExpiry(days:number,now=new Date()):string{
  const safe=[1,3,7,14,30,3650].includes(days)?days:7;
  return new Date(now.getTime()+safe*24*60*60*1000).toISOString();
}

export function secureShareIsExpired(share:Pick<SecureShareRecord,'expiresAt'>,now=new Date()):boolean{
  const ms=Date.parse(share.expiresAt);return !Number.isFinite(ms)||ms<=now.getTime();
}

export function secureShareIsActive(share:Pick<SecureShareRecord,'expiresAt'|'revokedAt'>,now=new Date()):boolean{
  return !share.revokedAt&&!secureShareIsExpired(share,now);
}

export function secureShareState(share:Pick<SecureShareRecord,'expiresAt'|'revokedAt'|'decision'>,now=new Date()):'revoked'|'expired'|'accepted'|'rejected'|'active'{
  if(share.revokedAt)return'revoked';
  if(secureShareIsExpired(share,now))return'expired';
  if(share.decision==='accepted')return'accepted';
  if(share.decision==='rejected')return'rejected';
  return'active';
}

export function secureShareDateIsValid(value:string):boolean{return isIsoDate(value.slice(0,10))&&!Number.isNaN(Date.parse(value));}
