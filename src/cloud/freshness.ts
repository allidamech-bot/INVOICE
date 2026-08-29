import { currentCloudUser, getCloudVaultMeta } from './firebase.js';
import { getCloudAccount, getEncryptedVault, putCloudAccount } from '../storage/db.js';

let timer:number|undefined;
let running=false;
let stopped=false;

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
    // Recreate only the harmless account link here; App remains the sole owner of
    // live vault replacement, conflict handling and user-visible sync state.
    if(!linked){
      await putCloudAccount(user.uid,user.email);
      linked=await getCloudAccount();
    }
    if(!linked||linked.uid!==user.uid)return;

    const [local,remote]=await Promise.all([getEncryptedVault(),getCloudVaultMeta(user.uid)]);
    if(!remote||!local||remote.updatedAt<=local.updatedAt)return;

    // A newer remote revision must never be routed through the normal online
    // handler because that path is push-only. Ask App for a protected reconcile;
    // if the user begins editing before App handles it, the watcher will retry on
    // a later safe check instead of suppressing the revision for the whole session.
    window.dispatchEvent(new Event('lourex-cloud-remote-newer'));
  }catch{
    // App-level cloud controls surface sync errors; this watcher stays silent.
  }finally{
    running=false;
  }
}

function schedule(delay=250):void{
  window.setTimeout(()=>void checkCloudFreshness(),delay);
}

export function startCloudFreshnessWatcher():()=>void{
  stopped=false;
  const onFocus=()=>schedule(150);
  const onOnline=()=>schedule(250);
  const onPageshow=()=>schedule(180);
  const onVisibility=()=>{if(document.visibilityState==='visible')schedule(200);};
  window.addEventListener('focus',onFocus);
  window.addEventListener('online',onOnline);
  window.addEventListener('pageshow',onPageshow);
  document.addEventListener('visibilitychange',onVisibility);
  timer=window.setInterval(()=>void checkCloudFreshness(),20_000);
  schedule(1200);
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
