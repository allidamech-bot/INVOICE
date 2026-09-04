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

function schedule(delay=120):void{
  if(stopped)return;
  if(pending)window.clearTimeout(pending);
  pending=window.setTimeout(()=>{pending=undefined;void checkCloudFreshness();},delay);
}

function ensureRealtime(uid:string):void{
  if(realtimeUid===uid&&realtimeOff)return;
  detachRealtime();
  try{
    realtimeOff=subscribeCloudVaultChanges(uid,()=>schedule(70));
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
    // Signing in is explicit consent to associate this browser/device with this
    // LOUREX account. Reconciliation on the next load still protects divergent
    // local/account data as a conflict; this only repairs a missing link record.
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
    if(result==='pulled'){
      // The encrypted account copy is now in IndexedDB. Reload only when the UI is
      // idle so React rehydrates from that exact copy without interrupting editing.
      window.location.reload();
      return;
    }
  }catch{
    // A genuine concurrent-edit conflict is non-destructive. Route it through the
    // existing App error path so the Cloud Sync dialog exposes both protected copies.
    try{window.dispatchEvent(new Event('lourex-cloud-remote-newer'));}catch{}
  }finally{
    running=false;
  }
}

export function startCloudFreshnessWatcher():()=>void{
  stopped=false;
  const onFocus=()=>schedule(70);
  const onOnline=()=>schedule(80);
  const onPageshow=()=>schedule(80);
  const onVisibility=()=>{if(document.visibilityState==='visible')schedule(80);};
  window.addEventListener('focus',onFocus);
  window.addEventListener('online',onOnline);
  window.addEventListener('pageshow',onPageshow);
  document.addEventListener('visibilitychange',onVisibility);
  // Firestore onSnapshot provides the normal fast path. This 15-second read-only
  // fallback covers suspended iOS tabs and transient listener failures.
  timer=window.setInterval(()=>schedule(0),15_000);
  schedule(500);
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
