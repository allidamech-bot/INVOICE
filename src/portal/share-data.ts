import type { LourexDocument } from '../types.js';
import { LOUREX_FIREBASE_CONFIG } from '../cloud/firebase-config.js';
import { SECURE_SHARE_FORMAT, SECURE_SHARE_MAX_COMMENT, SECURE_SHARE_TOKEN_PATTERN, type SecureShareDecision, type SecureShareRecord } from '../lib/secure-share.js';

declare const firebase:any;
declare global { interface Window { __LOUREX_RUNTIME__?:{firebaseAppCheckEnterpriseKey?:string;firebaseAppCheckRequired?:boolean}; } }

const APP_NAME='lourex-public-share';
let identityPromise:Promise<any>|null=null;
let appCheckActivated=false;

function portalApp():any{
  if(typeof firebase==='undefined')throw new Error('The secure portal runtime is unavailable.');
  let app=(firebase.apps||[]).find((candidate:any)=>candidate.name===APP_NAME);
  if(!app)app=firebase.initializeApp(LOUREX_FIREBASE_CONFIG,APP_NAME);
  if(!appCheckActivated){
    const runtime=window.__LOUREX_RUNTIME__||{},key=String(runtime.firebaseAppCheckEnterpriseKey||'').trim();
    if(key&&typeof firebase.appCheck==='function'){
      const Provider=firebase.appCheck.ReCaptchaEnterpriseProvider;if(typeof Provider==='function'){firebase.appCheck(app).activate(new Provider(key),true);appCheckActivated=true;}
    }else if(runtime.firebaseAppCheckRequired)throw new Error('Secure portal verification is unavailable.');
  }
  return app;
}
function portalAuth():any{return firebase.auth(portalApp());}
function portalDb():any{return firebase.firestore(portalApp());}
function timestamp(value:any):string{if(!value)return'';try{if(typeof value.toDate==='function')return value.toDate().toISOString();}catch{}const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toISOString();}
function normalize(id:string,data:any):SecureShareRecord|null{
  if(!SECURE_SHARE_TOKEN_PATTERN.test(id)||!data||data.format!==SECURE_SHARE_FORMAT||data.version!==1||!data.snapshot)return null;
  const decision:SecureShareDecision=data.decision==='accepted'||data.decision==='rejected'?data.decision:'';
  return{id,format:SECURE_SHARE_FORMAT,version:1,ownerUid:String(data.ownerUid||''),documentId:String(data.documentId||''),documentNumber:String(data.documentNumber||''),documentKind:data.documentKind,documentRole:data.documentRole,customerId:String(data.customerId||''),customerNameEn:String(data.customerNameEn||''),customerNameAr:String(data.customerNameAr||''),customerEmail:String(data.customerEmail||''),allowDecision:Boolean(data.allowDecision),createdAt:timestamp(data.createdAt),expiresAt:timestamp(data.expiresAt),revokedAt:timestamp(data.revokedAt),viewedAt:timestamp(data.viewedAt),decision,decisionAt:timestamp(data.decisionAt),customerComment:String(data.customerComment||''),commentAt:timestamp(data.commentAt),updatedAt:timestamp(data.updatedAt),snapshot:data.snapshot as LourexDocument};
}

export async function ensurePortalIdentity():Promise<void>{
  if(identityPromise){await identityPromise;return;}
  identityPromise=(async()=>{const auth=portalAuth();await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);const current=auth.currentUser;if(current?.isAnonymous)return current;const credential=await auth.signInAnonymously();return credential.user;})();
  try{await identityPromise;}catch(error){identityPromise=null;throw error;}
}

export async function loadPortalShare(id:string):Promise<SecureShareRecord>{
  if(!SECURE_SHARE_TOKEN_PATTERN.test(id))throw new Error('This secure link is invalid.');await ensurePortalIdentity();const snap=await portalDb().collection('publicShares').doc(id).get();if(!snap.exists)throw new Error('This secure link is unavailable, revoked, or expired.');const item=normalize(id,snap.data());if(!item)throw new Error('This secure link contains invalid data.');return item;
}

export async function markPortalViewed(id:string):Promise<void>{
  if(!SECURE_SHARE_TOKEN_PATTERN.test(id))return;await ensurePortalIdentity();const ref=portalDb().collection('publicShares').doc(id),snap=await ref.get();if(!snap.exists||snap.data()?.viewedAt)return;const now=firebase.firestore.FieldValue.serverTimestamp();try{await ref.update({viewedAt:now,updatedAt:now});}catch{}
}

export async function sendPortalComment(id:string,comment:string):Promise<void>{
  const clean=comment.trim();if(!clean)throw new Error('Enter a comment first.');if(clean.length>SECURE_SHARE_MAX_COMMENT)throw new Error(`Comment must be ${SECURE_SHARE_MAX_COMMENT} characters or fewer.`);await ensurePortalIdentity();const now=firebase.firestore.FieldValue.serverTimestamp();await portalDb().collection('publicShares').doc(id).update({customerComment:clean,commentAt:now,updatedAt:now});
}

export async function sendPortalDecision(id:string,decision:Exclude<SecureShareDecision,''>,comment:string):Promise<void>{
  const clean=comment.trim();if(clean.length>SECURE_SHARE_MAX_COMMENT)throw new Error(`Comment must be ${SECURE_SHARE_MAX_COMMENT} characters or fewer.`);await ensurePortalIdentity();const ref=portalDb().collection('publicShares').doc(id);
  await portalDb().runTransaction(async(transaction:any)=>{const snap=await transaction.get(ref);if(!snap.exists)throw new Error('This secure link is unavailable, revoked, or expired.');const data=snap.data();if(!data.allowDecision)throw new Error('This document does not accept a decision.');if(data.decision)throw new Error('A decision has already been recorded.');const now=firebase.firestore.FieldValue.serverTimestamp(),patch:any={decision,decisionAt:now,updatedAt:now};if(clean){patch.customerComment=clean;patch.commentAt=now;}transaction.update(ref,patch);});
}
