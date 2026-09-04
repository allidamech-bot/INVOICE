import { getCloudAccount, putCloudAccount } from '../storage/db.js';
import { cloudRemoteChangedSinceAnchor, getCloudVaultMeta, installCloudVault, waitForCloudUser } from './firebase.js';

/**
 * Resolve the signed-in cloud account before React hydrates local encrypted data.
 *
 * iOS Home Screen PWAs can have an auth/storage context that differs from Safari.
 * If the account already has a cloud vault, that account copy is authoritative:
 * link this local container to the authenticated uid and install the remote vault
 * whenever this device has no sync anchor or the remote revision changed.
 *
 * This happens before resumeVaultSession/unlock UI so a stale phone-local vault
 * cannot win merely because it was present first or carries a newer local timestamp.
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

    if(await cloudRemoteChangedSinceAnchor(user.uid)){
      await installCloudVault(user.uid,false);
    }
  }catch{
    // Startup must remain usable offline or during transient cloud failures.
    // The regular freshness watcher retries silently once the app is mounted.
  }
}
