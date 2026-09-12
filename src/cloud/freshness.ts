import { cloudRemoteChangedSinceAnchor, currentCloudUser, reconcileCloudVault, subscribeCloudVaultChanges } from './firebase.js';
import { getCloudAccount, putCloudAccount } from '../storage/db.js';

let timer:number|undefined;
let pending:number|undefined;
let running=false;
let stopped=false;
let realtimeOff:(()=>void)|undefined;
let realtimeUid='';

const WORKSPACE_RESUME_KEY='lourex-auto-reload-screen';
type RestorableWorkspace='home'|'documents'|'customers'|'receivables'|'reports'|'items';
const WORKSPACE_SELECTORS:Array<[RestorableWorkspace,string]>=[
  ['home','.workspace-home-page'],
  ['documents','.documents-workspace-v2,.documents-page'],
  ['customers','.customers-page,.customer-profile-page'],
  ['receivables','.receivables-page'],
  ['reports','.reports-page'],
  ['items','.product-library-pro,.saved-items-page']
];

function rememberWorkspaceBeforeAutomaticReload():void{
  try{
    const match=WORKSPACE_SELECTORS.find(([,selector])=>Boolean(document.querySelector(selector)));
    if(match)sessionStorage.setItem(WORKSPACE_RESUME_KEY,match[0]);
    else sessionStorage.removeItem(WORKSPACE_RESUME_KEY);
  }catch{}
}

function reloadPreservingWorkspace():void{
  rememberWorkspaceBeforeAutomaticReload();
  window.location.reload();
}

function isStandalonePwa():boolean{
  try{
    return window.matchMedia?.('(display-mode: standalone)').matches===true||Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
  }catch{return false;}
}

function appIsSafeToApply():boolean{
  if(document.visibilityState!=='visible')return false;
  if(typeof navigator!=='undefined'&&!navigator.onLine)return false;
  // Operations contains inline supplier/purchase/expense/manual-stock drafts and
  // Product Library keeps an inline product draft. Focus can leave those fields
  // while the draft is still unsaved, so activeElement alone is not sufficient.
  if(document.querySelector('.editor-screen,.modal-backdrop,.operations-page,.product-library-pro.editor-open'))return false;
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
  if(!user){
    detachRealtime();
    // iOS Home Screen apps can restore Firebase persistence later than Safari.
    // Keep probing silently instead of treating the first null auth read as final.
    if(isStandalonePwa())schedule(600);
    return;
  }

  let linked=await getCloudAccount().catch(()=>null);
  if(!linked){
    try{
      // Creating the missing local account link does not require a page reload.
      // Reloading here used to eject an active user back to Home and could even
      // interrupt a draft because this branch runs before the workspace guard.
      await putCloudAccount(user.uid,user.email);
      linked=await getCloudAccount().catch(()=>null);
    }catch{
      schedule(isStandalonePwa()?350:700);
      return;
    }
  }
  if(!linked||linked.uid!==user.uid){detachRealtime();return;}
  ensureRealtime(user.uid);
  if(!appIsSafeToApply())return;

  running=true;
  try{
    if(!await cloudRemoteChangedSinceAnchor(user.uid))return;
    const result=await reconcileCloudVault(user.uid);
    if(result==='diverged')return;
    if(result==='pulled')reloadPreservingWorkspace();
  }catch{
    // Data movement is intentionally invisible. Transient failures are retried
    // automatically; there is no manual sync/conflict surface for the user.
    schedule(isStandalonePwa()?350:700);
  }finally{
    running=false;
  }
}

export function startCloudFreshnessWatcher():()=>void{
  stopped=false;
  const standalone=isStandalonePwa();
  const onFocus=()=>schedule(standalone?10:30);
  const onOnline=()=>schedule(standalone?10:30);
  const onPageshow=(event:PageTransitionEvent)=>schedule(event.persisted||standalone?10:40);
  const onVisibility=()=>{if(document.visibilityState==='visible')schedule(standalone?10:40);};
  window.addEventListener('focus',onFocus);
  window.addEventListener('online',onOnline);
  window.addEventListener('pageshow',onPageshow);
  document.addEventListener('visibilitychange',onVisibility);
  timer=window.setInterval(()=>schedule(0),standalone?1_500:5_000);
  schedule(standalone?40:120);
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
