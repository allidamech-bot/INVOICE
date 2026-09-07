import { getCloudAccount, putCloudAccount } from '../storage/db.js';
import { currentCloudUser, getCloudVaultMeta, reconcileCloudVault, waitForCloudUser } from './firebase.js';
import type { CloudSyncResult } from './firebase.js';

const STARTUP_CLOUD_BUDGET_MS=2_200;
type StartupCloudResult=CloudSyncResult|'skipped';

/**
 * Resolve the signed-in cloud account before React hydrates local encrypted data.
 *
 * iOS Home Screen PWAs can have an auth/storage context that differs from Safari.
 * Startup may fast-forward a known-safe cloud revision, but it must never replace
 * an existing divergent local vault when the device no longer has a trustworthy
 * sync anchor. Ambiguous divergence is left untouched for the explicit recovery
 * path instead of silently choosing one side.
 *
 * The pre-render cloud check is deliberately time-bounded. Firebase Auth and
 * Firestore can occasionally leave a promise pending for a long time on iOS even
 * though the local encrypted vault is healthy. A slow cloud request must never
 * hold the entire UI on the boot screen forever. After the budget expires React
 * is allowed to hydrate the local-first app, while the existing freshness watcher
 * continues guarded reconciliation in the background.
 */
async function runAuthoritativeCloudStartup():Promise<StartupCloudResult>{
  if(typeof navigator!=='undefined'&&!navigator.onLine)return 'skipped';

  // Firebase often already restored the signed-in user by the time the module
  // executes. Use that ready session immediately instead of paying the slower
  // persistence bootstrap again on every iPhone/Safari launch.
  let user=currentCloudUser();
  if(!user){
    try{user=await waitForCloudUser();}catch{return 'skipped';}
  }
  if(!user)return 'skipped';

  try{
    const remote=await getCloudVaultMeta(user.uid);
    if(!remote)return 'skipped';

    const linked=await getCloudAccount();
    if(linked&&linked.uid!==user.uid)return 'skipped';
    if(!linked)await putCloudAccount(user.uid,user.email);

    return await reconcileCloudVault(user.uid);
  }catch{
    // Startup must remain usable when cloud/local lineage is ambiguous, offline,
    // or during transient cloud failures. Never replace local data from here
    // unless reconcileCloudVault can prove that the pull is a safe fast-forward.
    return 'skipped';
  }
}

function signalDeferredCloudPull(result:StartupCloudResult):void{
  if(result!=='pulled')return;
  try{window.dispatchEvent(new Event('lourex-cloud-applied'));}catch{}
}

export async function hydrateAuthoritativeCloudBeforeApp():Promise<void>{
  if(typeof navigator!=='undefined'&&!navigator.onLine)return;

  const cloudWork=runAuthoritativeCloudStartup();
  let timer:number|undefined;
  const outcome=await Promise.race([
    cloudWork.then(result=>({kind:'done' as const,result})),
    new Promise<{kind:'timeout'}>(resolve=>{
      timer=window.setTimeout(()=>resolve({kind:'timeout'}),STARTUP_CLOUD_BUDGET_MS);
    })
  ]);
  if(timer!==undefined)window.clearTimeout(timer);
  if(outcome.kind==='done')return;

  // Do not abandon a request that was already safely in flight. If it later
  // proves that a newer cloud vault was pulled, notify the mounted UI so the
  // existing safe-reload guard can rehydrate from that exact encrypted copy.
  void cloudWork.then(signalDeferredCloudPull).catch(()=>undefined);
}
