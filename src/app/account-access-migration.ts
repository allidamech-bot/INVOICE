import type { VaultPayload } from '../types.js';
import { createAccountSecurity, decryptVault, encryptVault, verifyAccountAccess } from '../crypto/crypto.js';
import { getEncryptedVault, getSecurity, putSecurityAndVault } from '../storage/db.js';
import { establishSession, getSessionKey } from '../storage/session.js';
import { pushLocalVaultToCloud, waitForCloudUser } from '../cloud/firebase.js';

let running=false;

// One-time, silent migration. If this browser still has the old unlocked key in
// its persistent session, decrypt the legacy PIN vault once, immediately re-key
// it to the signed-in LOUREX account, and publish that account-key copy. Other
// devices can then open the same cloud data without ever asking for a PIN.
export async function migrateLegacyPinVaultToAccountAccess():Promise<void>{
  if(running)return;
  running=true;
  try{
    const user=await waitForCloudUser().catch(()=>null);
    if(!user)return;
    const [session,security,encrypted]=await Promise.all([getSessionKey(),getSecurity(),getEncryptedVault()]);
    if(!session||!security||!encrypted)return;

    let accountKey:CryptoKey|null=null;
    try{accountKey=await verifyAccountAccess(user.uid,security);}catch{}

    let vault:VaultPayload;
    try{vault=await decryptVault(accountKey??session.key,encrypted);}catch{return;}
    const normalized:VaultPayload={...vault,appSettings:{...vault.appSettings,autoLockMinutes:0}};

    if(!accountKey){
      const created=await createAccountSecurity(user.uid);
      accountKey=created.key;
      const reencrypted=await encryptVault(accountKey,normalized);
      await putSecurityAndVault(created.metadata,reencrypted);
      await establishSession(accountKey);
      await pushLocalVaultToCloud(user.uid,reencrypted);
      window.setTimeout(()=>window.location.reload(),120);
      return;
    }

    if(vault.appSettings.autoLockMinutes!==0){
      const reencrypted=await encryptVault(accountKey,normalized);
      await putSecurityAndVault(security,reencrypted);
      await establishSession(accountKey);
      await pushLocalVaultToCloud(user.uid,reencrypted);
    }
  }catch{
    // Never block the invoice UI. A still-unmigrated legacy device can be
    // migrated the next time an already-unlocked session is available.
  }finally{running=false;}
}
