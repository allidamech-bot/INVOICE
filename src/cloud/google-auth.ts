import type { CloudUser } from './firebase.js';

declare const firebase: any;

let pendingGoogleCredential:any=null;
let pendingGoogleEmail='';
const GOOGLE_REDIRECT_PENDING_KEY='lourex-google-redirect-pending';

function auth():any{
  if(typeof firebase==='undefined'||!firebase?.auth)throw new Error('Firebase authentication is unavailable. Check your internet connection and reload.');
  return firebase.auth();
}

function userFrom(raw:any):CloudUser|null{
  return raw?{uid:String(raw.uid),email:String(raw.email||'')}:null;
}

function markRecentAuth():void{
  try{sessionStorage.setItem('lourex-auth-just-signed-in','1');}catch{}
}

function provider():any{
  const value=new firebase.auth.GoogleAuthProvider();
  value.setCustomParameters({prompt:'select_account'});
  return value;
}

function shouldUseRedirectFlow():boolean{
  if(typeof navigator==='undefined')return false;
  const ua=String(navigator.userAgent||'');
  const iosDevice=/(iPad|iPhone|iPod)/i.test(ua);
  const touchIpadMode=String((navigator as any).platform||'')==='MacIntel'&&Number((navigator as any).maxTouchPoints||0)>1;
  return iosDevice||touchIpadMode;
}

function markRedirectPending():void{
  try{sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY,'1');}catch{}
}

function clearRedirectPending():void{
  try{sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);}catch{}
}

function captureLinkRequirement(error:any):never{
  const code=String(error?.code||'');
  if(code.includes('account-exists-with-different-credential')){
    const email=String(error?.email||'').trim();
    const credential=firebase.auth.GoogleAuthProvider.credentialFromError?.(error)||null;
    if(email&&credential){
      pendingGoogleCredential=credential;
      pendingGoogleEmail=email.toLowerCase();
      throw new GoogleAccountLinkRequiredError(email);
    }
  }
  throw error;
}

export class GoogleAccountLinkRequiredError extends Error{
  readonly code='lourex/google-link-required';
  constructor(readonly email:string){super('This Google email already belongs to an existing LOUREX account.');this.name='GoogleAccountLinkRequiredError';}
}

export function clearPendingGoogleLink():void{
  pendingGoogleCredential=null;
  pendingGoogleEmail='';
}

export function googleRedirectPending():boolean{
  try{return sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY)==='1';}catch{return false;}
}

export async function consumeGoogleRedirectResult():Promise<CloudUser|null>{
  if(!googleRedirectPending())return null;
  const instance=auth();
  try{
    const result=await instance.getRedirectResult();
    clearRedirectPending();
    if(!result?.user)return null;
    try{await instance.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch{}
    const user=userFrom(result.user);
    if(!user)throw new Error('Unable to complete Google sign-in.');
    markRecentAuth();
    return user;
  }catch(error:any){
    clearRedirectPending();
    captureLinkRequirement(error);
  }
}

export async function signInCloudUserWithGoogle():Promise<CloudUser|null>{
  clearPendingGoogleLink();
  const instance=auth();
  const googleProvider=provider();
  try{
    if(shouldUseRedirectFlow()){
      markRedirectPending();
      try{await instance.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch{}
      try{
        await instance.signInWithRedirect(googleProvider);
        return null;
      }catch(error){
        clearRedirectPending();
        throw error;
      }
    }

    // Desktop browsers keep the popup call inside the original user gesture.
    const result=await instance.signInWithPopup(googleProvider);
    try{await instance.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch{}
    const user=userFrom(result?.user);
    if(!user)throw new Error('Unable to complete Google sign-in.');
    markRecentAuth();
    return user;
  }catch(error:any){
    captureLinkRequirement(error);
  }
}

export async function linkGoogleToExistingPasswordAccount(email:string,password:string):Promise<CloudUser>{
  const normalizedEmail=email.trim().toLowerCase();
  if(!pendingGoogleCredential||!pendingGoogleEmail||normalizedEmail!==pendingGoogleEmail){
    clearPendingGoogleLink();
    throw new Error('Google linking session expired. Choose Continue with Google again.');
  }
  const instance=auth();
  await instance.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const signIn=await instance.signInWithEmailAndPassword(email.trim(),password);
  const existingUser=signIn?.user;
  if(!existingUser)throw new Error('Unable to verify the existing LOUREX account.');
  const originalUid=String(existingUser.uid||'');
  try{
    const linked=await existingUser.linkWithCredential(pendingGoogleCredential);
    const user=userFrom(linked?.user||existingUser);
    if(!user||!originalUid||user.uid!==originalUid)throw new Error('Google account linking did not preserve the existing LOUREX account.');
    clearPendingGoogleLink();
    markRecentAuth();
    return user;
  }catch(error){
    clearPendingGoogleLink();
    try{await instance.signOut();}catch{}
    throw error;
  }
}

export function friendlyGoogleAuthError(error:unknown):string{
  const code=String((error as any)?.code||'');
  if(code.includes('popup-closed-by-user')||code.includes('cancelled-popup-request'))return 'Google sign-in was cancelled.';
  if(code.includes('popup-blocked'))return 'Your browser blocked the Google sign-in window. Allow pop-ups for LOUREX and try again.';
  if(code.includes('unauthorized-domain'))return 'This LOUREX domain is not authorized for Google sign-in.';
  if(code.includes('operation-not-allowed'))return 'Google sign-in is not enabled for this LOUREX project.';
  if(code.includes('network-request-failed'))return 'Google sign-in could not reach the network. Check your connection and try again.';
  if(code.includes('web-storage-unsupported'))return 'This browser is blocking storage required for Google sign-in. Use a regular browser window and allow site storage.';
  if(code.includes('operation-not-supported-in-this-environment'))return 'Google sign-in is not supported in this browser context. Open LOUREX directly in Safari or Chrome and try again.';
  if(code.includes('app-not-authorized')||code.includes('invalid-api-key'))return 'This LOUREX web app is not authorized for Firebase Authentication.';
  if(code.includes('too-many-requests'))return 'Google sign-in is temporarily rate-limited. Please wait a moment and try again.';
  if(code.includes('credential-already-in-use'))return 'This Google account is already linked to another LOUREX account.';
  if(code.includes('wrong-password')||code.includes('invalid-credential'))return 'The LOUREX password for this existing account is incorrect.';
  return error instanceof Error?error.message:'Google sign-in failed.';
}
