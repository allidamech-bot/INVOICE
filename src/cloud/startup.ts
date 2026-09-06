import { getCloudAccount, putCloudAccount } from '../storage/db.js';
import { getCloudVaultMeta, reconcileCloudVault, waitForCloudUser } from './firebase.js';

/**
 * Resolve the signed-in cloud account before React hydrates local encrypted data.
 *
 * iOS Home Screen PWAs can have an auth/storage context that differs from Safari.
 * Startup may fast-forward a known-safe cloud revision, but it must never replace
 * an existing divergent local vault when the device no longer has a trustworthy
 * sync anchor. Ambiguous divergence is left untouched for the explicit recovery
 * path instead of silently choosing one side.
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
    // Startup must remain usable when cloud/local lineage is ambiguous, offline,
    // or during transient cloud failures. Never replace local data from here
    // unless reconcileCloudVault can prove that the pull is a safe fast-forward.
  }
}
