import { currentCloudUser, getCloudVaultMeta, reconcileCloudVault } from './firebase.js';
import { getCloudAccount, getEncryptedVault } from '../storage/db.js';

let timer:number|undefined;
let running=false;
let stopped=false;
let lastHandledRevision='';

function appIsSafeToCheck():boolean{
  if(document.visibilityState!=='visible')return false;
  if(typeof navigator!=='undefined'&&!navigator.onLine)return false;
  if(document.querySelector('.editor-screen,.modal-backdrop'))return false;
  const active=document.activeElement;
  if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement||active instanceof HTMLSelectElement)return false;
  if(active instanceof HTMLElement&&active.isContentEditable)return false;
  return true;
}

async function checkCloudFreshness():Promise<void>{
  if(stopped||running||!appIsSafeToCheck())return;
  const user=currentCloudUser();
  if(!user)return;
  running=true;
  try{
    const linked=await getCloudAccount();
    if(!linked||linked.uid!==user.uid)return;
    const [local,remote]=await Promise.all([getEncryptedVault(),getCloudVaultMeta(user.uid)]);
    if(!remote)return;
    if(local&&remote.updatedAt<=local.updatedAt)return;
    if(remote.revision===lastHandledRevision)return;

    /*
      No editor/modal is open here, so it is safe to reconcile the encrypted
      vault.  This is the missing cross-browser path: the old watcher only
      dispatched an `online` event, while App's online handler is a push path.
      Reconcile performs the timestamp/integrity checks and pulls when cloud is
      newer.  Reload only after a successful pull so the in-memory vault is
      rebuilt from the newly installed encrypted record.
    */
    const result=await reconcileCloudVault(user.uid);
    lastHandledRevision=remote.revision;
    if(result==='pulled')window.location.reload();
  }catch{
    // App-level cloud controls surface actionable errors; watcher stays quiet.
  }finally{
    running=false;
  }
}

function schedule(delay=250):void{window.setTimeout(()=>void checkCloudFreshness(),delay);}

export function startCloudFreshnessWatcher():()=>void{
  stopped=false;
  const onFocus=()=>schedule(100);
  const onOnline=()=>schedule(150);
  const onVisibility=()=>{if(document.visibilityState==='visible')schedule(120);};
  window.addEventListener('focus',onFocus);
  window.addEventListener('online',onOnline);
  document.addEventListener('visibilitychange',onVisibility);
  timer=window.setInterval(()=>void checkCloudFreshness(),5_000);
  schedule(700);
  return ()=>{
    stopped=true;
    window.removeEventListener('focus',onFocus);
    window.removeEventListener('online',onOnline);
    document.removeEventListener('visibilitychange',onVisibility);
    if(timer)window.clearInterval(timer);
    timer=undefined;
  };
}
