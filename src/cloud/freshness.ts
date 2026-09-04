import { cloudRemoteChangedSinceAnchor, currentCloudUser, reconcileCloudVault, subscribeCloudVaultChanges } from './firebase.js';
import { getCloudAccount, putCloudAccount } from '../storage/db.js';

let timer:number|undefined;
let pending:number|undefined;
let running=false;
let stopped=false;
let realtimeOff:(()=>void)|undefined;
let realtimeUid='';

function appIsSafeToApply():boolean{
  if(document.visibilityState!=='visible')return false;
  if(typeof navigator!=='undefined'&&!navigator.onLine)return false;
  if(document.querySelector('.editor-screen,.modal-backdrop'))return false;
  const active=document.activeElement;
  if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement||active instanceof HTMLSelectElement)return false;
  if(active instanceof HTMLElement&&active.isContentEditable)return false;
  return true;
}

function detachRealtime():void{
  try{realtimeOff?.();}catch{}
  realtimeOff=undefined;realtimeUid='';
}

function schedule(delay=60):void{
  if(stopped)return;
  if(pending)window.clearTimeout(pending);
  pending=window.setTimeout(()=>{pending=undefined;void checkCloudFreshness();},delay);
}

function ensureRealtime(uid:string):void{
  if(realtimeUid===uid&&realtimeOff)return;
  detachRealtime();
  try{
    realtimeOff=subscribeCloudVaultChanges(uid,()=>schedule(25));
    realtimeUid=uid;
  }catch{
    realtimeOff=undefined;realtimeUid='';
  }
}

async function checkCloudFreshness():Promise<void>{
  if(stopped||running)return;
  const user=currentCloudUser();
  if(!user){detachRealtime();return;}

  let linked=await getCloudAccount().catch(()=>null);
  if(!linked){
    try{await putCloudAccount(user.uid,user.email);window.location.reload();}catch{}
    return;
  }
  if(linked.uid!==user.uid){detachRealtime();return;}
  ensureRealtime(user.uid);
  if(!appIsSafeToApply())return;

  running=true;
  try{
    if(!await cloudRemoteChangedSinceAnchor(user.uid))return;
    const result=await reconcileCloudVault(user.uid);
    if(result==='pulled')window.location.reload();
  }catch{
    // Data movement is intentionally invisible. Transient failures are retried
    // automatically; there is no manual sync/conflict surface for the user.
    schedule(700);
  }finally{
    running=false;
  }
}

export function startCloudFreshnessWatcher():()=>void{
  stopped=false;
  const onFocus=()=>schedule(30);
  const onOnline=()=>schedule(30);
  const onPageshow=()=>schedule(40);
  const onVisibility=()=>{if(document.visibilityState==='visible')schedule(40);};
  window.addEventListener('focus',onFocus);
  window.addEventListener('online',onOnline);
  window.addEventListener('pageshow',onPageshow);
  document.addEventListener('visibilitychange',onVisibility);
  timer=window.setInterval(()=>schedule(0),5_000);
  schedule(120);
  return ()=>{
    stopped=true;
    window.removeEventListener('focus',onFocus);
    window.removeEventListener('online',onOnline);
    window.removeEventListener('pageshow',onPageshow);
    document.removeEventListener('visibilitychange',onVisibility);
    if(pending)window.clearTimeout(pending);pending=undefined;
    if(timer)window.clearInterval(timer);timer=undefined;
    detachRealtime();
  };
}
