import { currentCloudUser, getCloudVaultMeta, installCloudVault } from './firebase.js';
import { getCloudAccount, getEncryptedVault } from '../storage/db.js';

let timer:number|undefined;
let running=false;
let stopped=false;

function appIsSafeToRefresh():boolean{
  if(document.visibilityState!=='visible')return false;
  if(typeof navigator!=='undefined'&&!navigator.onLine)return false;
  if(document.querySelector('.editor-screen,.modal-backdrop'))return false;
  const active=document.activeElement;
  if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement||active instanceof HTMLSelectElement)return false;
  if(active instanceof HTMLElement&&active.isContentEditable)return false;
  return true;
}

async function checkCloudFreshness():Promise<void>{
  if(stopped||running||!appIsSafeToRefresh())return;
  const user=currentCloudUser();
  if(!user)return;
  running=true;
  try{
    const linked=await getCloudAccount();
    if(!linked||linked.uid!==user.uid)return;
    const [local,remote]=await Promise.all([getEncryptedVault(),getCloudVaultMeta(user.uid)]);
    if(!local||!remote||remote.updatedAt<=local.updatedAt)return;
    const guard=`${user.uid}:${remote.revision}`;
    if(sessionStorage.getItem('lourex-cloud-refresh-revision')===guard)return;
    sessionStorage.setItem('lourex-cloud-refresh-revision',guard);
    const installed=await installCloudVault(user.uid);
    if(installed)window.location.reload();
  }catch{
    // App-level cloud controls surface sync errors; the watcher stays silent and retries later.
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
  const onVisibility=()=>{if(document.visibilityState==='visible')schedule(200);};
  window.addEventListener('focus',onFocus);
  window.addEventListener('online',onOnline);
  document.addEventListener('visibilitychange',onVisibility);
  timer=window.setInterval(()=>void checkCloudFreshness(),20_000);
  schedule(1200);
  return ()=>{
    stopped=true;
    window.removeEventListener('focus',onFocus);
    window.removeEventListener('online',onOnline);
    document.removeEventListener('visibilitychange',onVisibility);
    if(timer)window.clearInterval(timer);
    timer=undefined;
  };
}
