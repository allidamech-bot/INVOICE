import type { VaultPayload } from '../types.js';
import { activeAccountStorageUid, getEncryptedVault, getPlainWorkspace, savePlainWorkspace } from '../storage/db.js';
import { migrateVault, resumeVaultSession } from '../storage/vault.js';
import { currentCloudUser, getCloudVaultMeta } from './firebase.js';
import { getPlainCloudMeta, uploadPlainCloudWorkspace } from './plain-workspace.js';
import { assertRestorableBackupVault } from '../lib/backup.js';

export type PlainMigrationStatus='ready'|'no-legacy-data'|'requires-legacy-key'|'cloud-newer'|'offline'|'conflict';

/**
 * New accounts never need PIN. Existing AES-GCM business data must be migrated
 * by a device which already has an authorized decrypted session. Nothing in a
 * Firebase login alone can reverse the historical client-side encryption.
 *
 * Both legacy records and legacy cloud revisions are left intact. Publishing
 * the new workspace uses a different Firestore collection.
 */
export async function migrateLegacyWorkspaceWithoutPinPrompt(uid:string):Promise<{status:PlainMigrationStatus;vault?:VaultPayload}>{
  if(!uid||currentCloudUser()?.uid!==uid||activeAccountStorageUid()!==uid)
    throw new Error('Account identity changed during legacy migration.');
  const existing=await getPlainWorkspace();
  if(existing)return {status:'ready',vault:existing.payload};
  const oldLocal=await getEncryptedVault();
  // A cloud lookup must complete before creating a fresh empty workspace.
  // An offline device cannot prove there is no older encrypted account data.
  if(typeof navigator!=='undefined'&&!navigator.onLine)
    return {status:'offline'};
  const [legacyRemote,newRemote]=await Promise.all([getCloudVaultMeta(uid),getPlainCloudMeta(uid)]);
  if(newRemote)return {status:'cloud-newer'};
  if(!oldLocal&&!legacyRemote)return {status:'no-legacy-data'};

  // Do not ask for or fabricate a PIN. Only reuse a usable key authorized on
  // the current original device; old encrypted cloud data alone is insufficient.
  const unlocked=oldLocal?await resumeVaultSession().catch(()=>null):null;
  if(!unlocked)return {status:'requires-legacy-key'};
  assertRestorableBackupVault(unlocked.vault);
  const vault=migrateVault(unlocked.vault);
  // Preserve the complete old cipher and SecurityMetadata as a recovery source.
  const local=await savePlainWorkspace(uid,vault,null,null);
  const result=await uploadPlainCloudWorkspace(uid,local);
  if(result==='remote-changed')return {status:'conflict'};
  if(result==='pushed'||result==='same')return {status:'ready',vault};
  return {status:'conflict'};
}
