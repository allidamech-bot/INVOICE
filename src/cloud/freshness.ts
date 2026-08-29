import { currentCloudUser, getCloudVaultMeta, reconcileCloudVault } from './firebase.js';
import { getCloudAccount, getEncryptedVault, putCloudAccount } from '../storage/db.js';

let timer:number|undefined;
let running=false;
let stopped=false;
const NOTICE_GUARD='lourex-cloud-newer-revision';

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
    let linked=await getCloudAccount();

    // Safari and an installed iOS web app can have separate site-storage contexts.
    // If Firebase already restored the signed-in account but this browser context
    // has not stored the local cloud-link record yet, safely recreate that link.
    if(!linked){
      await putCloudAccount(user.uid,user.email);
      linked=await getCloudAccount();
    }
    if(!linked||linked.uid!==user.uid)return;

    const [local,remote]=await Promise.all([getEncryptedVault(),getCloudVaultMeta(user.uid)]);
    if(!remote)return;

    // Reconcile in both directions. This makes a normal browser tab behave like
    // the installed app: newer cloud data is pulled, newer local data is pushed.
    const result=await reconcileCloudVault(user.uid);
    if(result==='pulled'){
      const guard=`${user.uid}:${remote.revision}`;
      if(sessionStorage.getItem(NOTICE_GUARD)===guard)return;
      sessionStorage.setItem(NOTICE_GUARD,guard);
      window.location.reload();
      return;
    }

    // If another client published a newer revision between reads, schedule a
    // near-term follow-up rather than waiting for the periodic interval.
    if(local&&remote.updatedAt>local.updatedAt)window.setTimeout(()=>void checkCloudFreshness(),700);
  }catch{
    // App-level cloud controls surface sync errors; this background watcher
    // deliberately stays silent and retries on the next focus/timer cycle.
  }finally{
    running=false;
  }
}

function schedule(delay=250):void{
  window.setTimeout(()=>void checkCloudFreshness(),delay);
}

export function startCloudFreshnessWatcher():()=>void{
  stopped=false;
  const onFocus=()=>schedule(120);
  const onOnline=()=>schedule(180);
  const onPageshow=()=>schedule(160);
  const onVisibility=()=>{if(document.visibilityState==='visible')schedule(150);};
  window.addEventListener('focus',onFocus);
  window.addEventListener('online',onOnline);
  window.addEventListener('pageshow',onPageshow);
  document.addEventListener('visibilitychange',onVisibility);
  timer=window.setInterval(()=>void checkCloudFreshness(),5_000);
  schedule(600);
  return ()=>{
    stopped=true;
    window.removeEventListener('focus',onFocus);
    window.removeEventListener('online',onOnline);
    window.removeEventListener('pageshow',onPageshow);
    document.removeEventListener('visibilitychange',onVisibility);
    if(timer)window.clearInterval(timer);
    timer=undefined;
  };
}
