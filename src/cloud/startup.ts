import { getCloudAccount, putCloudAccount } from '../storage/db.js';
import { getCloudVaultMeta, reconcileCloudVault, waitForCloudUser } from './firebase.js';

/**
 * Resolve the signed-in cloud account before React hydrates local encrypted data.
 *
 * iOS Home Screen PWAs can have an auth/storage context that differs from Safari.
 * Startup must therefore link the authenticated account early, but it must never
 * replace a different local encrypted vault merely because localStorage lost the
 * last sync anchor. Safe reconciliation installs cloud data only when there is no
 * local vault, or when the verified anchor proves the local copy did not change.
 *
 * This happens before resumeVaultSession/unlock UI so stale cloud data cannot roll
 * a newer device-local vault backwards during startup.
 */
export async function hydrateAuthoritativeCloudBeforeApp():Promise<void>{
  if(typeof navigator!=='undefined'&&!navigator.onLine)return;

  let user;
  try{user=await waitForCloudUser();}catch{return;}
  if(!user)return;

  try{
    const remote=await getCloudVaultMeta(user.uid);
    if(!remote)return;

    const linked=await getCloudAccount();
    if(linked&&linked.uid!==user.uid)return;
    if(!linked)await putCloudAccount(user.uid,user.email);

    await reconcileCloudVault(user.uid);
  }catch{
    // Startup must remain usable offline, during transient cloud failures, or
    // when local/cloud copies diverge. In every uncertain case the local vault
    // is left untouched; the regular account flow can resolve it explicitly.
  }
}
