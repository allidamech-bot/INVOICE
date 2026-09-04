import { cloudRemoteChangedSinceAnchor, currentCloudUser } from './firebase.js';
import { getCloudAccount } from '../storage/db.js';

let timer:number|undefined;
let pending:number|undefined;
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
    const linked=await getCloudAccount();
    if(!linked||linked.uid!==user.uid)return;

    // Never compare device clocks. A phone with a fast/slow clock must not be
    // allowed to decide which encrypted vault is newer. The cloud revision and
    // the last acknowledged revision on this device are the only freshness keys.
    if(!await cloudRemoteChangedSinceAnchor(user.uid))return;
    window.dispatchEvent(new Event('lourex-cloud-remote-newer'));
  }catch{
    // App-level cloud controls surface sync errors; this read-only watcher stays silent.
  }finally{
    running=false;
  }
}

function schedule(delay=250):void{
  if(pending)window.clearTimeout(pending);
  pending=window.setTimeout(()=>{pending=undefined;void checkCloudFreshness();},delay);
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
  timer=window.setInterval(()=>void checkCloudFreshness(),60_000);
  schedule(1200);
  return ()=>{
    stopped=true;
    window.removeEventListener('focus',onFocus);
    window.removeEventListener('online',onOnline);
    window.removeEventListener('pageshow',onPageshow);
    document.removeEventListener('visibilitychange',onVisibility);
    if(pending)window.clearTimeout(pending);
    pending=undefined;
    if(timer)window.clearInterval(timer);
    timer=undefined;
  };
}
