import { getCloudAccount, getEncryptedVault, putCloudAccount } from '../storage/db.js';
import { currentCloudUser, getCloudVaultMeta, installCloudVault, reconcileCloudVault, waitForCloudUser } from './firebase.js';
import type { CloudSyncResult } from './firebase.js';

// Existing local encrypted workspaces stay strictly local-first. A fresh browser
// origin/device has no local vault to hydrate, so it must restore the account's
// encrypted cloud workspace before React decides whether this is first-run setup.
const STARTUP_CLOUD_BUDGET_MS=450;
const STARTUP_CLOUD_GUARD='startup-cloud-budget';
type StartupCloudResult=CloudSyncResult|'skipped';

function markLateStartupCloudApplyUnsafe():void{
  try{
    const root=document.documentElement;
    if(!root.hasAttribute('data-lourex-workspace-dirty'))root.setAttribute('data-lourex-workspace-dirty',STARTUP_CLOUD_GUARD);
  }catch{}
}

function clearLateStartupCloudApplyGuard():void{
  try{
    const root=document.documentElement;
    if(root.getAttribute('data-lourex-workspace-dirty')===STARTUP_CLOUD_GUARD)root.removeAttribute('data-lourex-workspace-dirty');
  }catch{}
}

/**
 * Resolve the signed-in cloud account before React hydrates local encrypted data.
 *
 * iOS Home Screen PWAs can have an auth/storage context that differs from Safari.
 * Startup may fast-forward a known-safe cloud revision, but it must never replace
 * an existing divergent local vault when the device no longer has a trustworthy
 * sync anchor. Ambiguous divergence is left untouched for the explicit recovery
 * path instead of silently choosing one side.
 *
 * A fresh origin/device is different: there is no local business workspace to
 * overwrite. In that case restore the cloud security metadata and encrypted vault
 * before the app decides between Setup and Unlock. This preserves the user's
 * existing PIN instead of incorrectly asking them to create a new one.
 */
async function runAuthoritativeCloudStartup():Promise<StartupCloudResult>{
  if(typeof navigator!=='undefined'&&!navigator.onLine)return 'skipped';

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

    const local=await getEncryptedVault();
    if(!local){
      const installed=await installCloudVault(user.uid);
      return installed?'pulled':'skipped';
    }

    return await reconcileCloudVault(user.uid);
  }catch{
    // Existing local workspaces stay usable through transient cloud failures.
    // On a genuinely empty origin, failure simply leaves setup unavailable until
    // the account data can be resolved rather than overwriting another workspace.
    return 'skipped';
  }
}

function signalDeferredCloudPull(result:StartupCloudResult):void{
  if(result!=='pulled')return;
  try{window.dispatchEvent(new Event('lourex-cloud-applied'));}catch{}
}

export async function hydrateAuthoritativeCloudBeforeApp():Promise<void>{
  if(typeof navigator!=='undefined'&&!navigator.onLine)return;

  const localBeforeStartup=await getEncryptedVault().catch(()=>null);
  const cloudWork=runAuthoritativeCloudStartup();

  // When this authenticated origin has no local vault, do not render the Setup
  // screen while the existing encrypted account workspace is still being restored.
  // There is no local state to delay, and rendering early is what caused the false
  // "Create PIN" flow on Preview/new devices.
  if(!localBeforeStartup){
    await cloudWork;
    return;
  }

  let timer:number|undefined;
  const outcome=await Promise.race([
    cloudWork.then(result=>({kind:'done' as const,result})),
    new Promise<{kind:'timeout'}>(resolve=>{
      timer=window.setTimeout(()=>resolve({kind:'timeout'}),STARTUP_CLOUD_BUDGET_MS);
    })
  ]);
  if(timer!==undefined)window.clearTimeout(timer);
  if(outcome.kind==='done')return;

  // Once React is allowed to mount, an in-flight startup pull must no longer be
  // allowed to replace IndexedDB behind the in-memory application state. Reuse the
  // shared workspace-dirty commit-boundary guard until that startup request settles.
  // The guard is removed only if it still belongs to this startup flow, so a real
  // editor/draft marker that appears meanwhile is never cleared accidentally.
  markLateStartupCloudApplyUnsafe();
  void cloudWork.then(signalDeferredCloudPull).catch(()=>undefined).finally(clearLateStartupCloudApplyGuard);
}