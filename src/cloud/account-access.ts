import { currentCloudUser } from './firebase.js';

declare const firebase:any;

const ACCESS_FORMAT='LOUREX_ACCOUNT_ACCESS_V1';
const ACCESS_VERSION=1;
const SECRET_PATTERN=/^acct_[A-Za-z0-9_-]{43}$/;

function requireUid(uid:string):void{
  const user=currentCloudUser();
  if(!user||user.uid!==uid)throw new Error('Account session is not available.');
}

function firestore():any{
  if(typeof firebase==='undefined'||!firebase.firestore)throw new Error('Account storage is unavailable. Check your internet connection and reload.');
  return firebase.firestore();
}

function accessRef(uid:string):any{
  return firestore().collection('users').doc(uid).collection('account').doc('vault-access');
}

function bytesToBase64Url(bytes:Uint8Array):string{
  let binary='';
  bytes.forEach(value=>{binary+=String.fromCharCode(value);});
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function newAccountSecret():string{
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `acct_${bytesToBase64Url(bytes)}`;
}

function readSecret(data:any):string|null{
  const secret=typeof data?.secret==='string'?data.secret:'';
  if(data?.format!==ACCESS_FORMAT||data?.version!==ACCESS_VERSION||!SECRET_PATTERN.test(secret))return null;
  return secret;
}

export function isAccountVaultSecret(value:string):boolean{
  return SECRET_PATTERN.test(value);
}

export async function getAccountVaultSecret(uid:string):Promise<string|null>{
  requireUid(uid);
  const snapshot=await accessRef(uid).get();
  if(!snapshot.exists)return null;
  const secret=readSecret(snapshot.data());
  if(!secret)throw new Error('Account security data is invalid.');
  return secret;
}

export async function getOrCreateAccountVaultSecret(uid:string):Promise<string>{
  requireUid(uid);
  const ref=accessRef(uid);
  return firestore().runTransaction(async(transaction:any)=>{
    const snapshot=await transaction.get(ref);
    if(snapshot.exists){
      const existing=readSecret(snapshot.data());
      if(!existing)throw new Error('Account security data is invalid.');
      return existing;
    }
    const secret=newAccountSecret();
    const now=new Date().toISOString();
    transaction.set(ref,{format:ACCESS_FORMAT,version:ACCESS_VERSION,secret,createdAt:now,updatedAt:now});
    return secret;
  });
}
