import type { EncryptedBackupFile, VaultPayload } from '../types.js';
import { createEncryptedBackup, decryptBackup } from '../crypto/crypto.js';
import { APP_SCHEMA_VERSION } from './defaults.js';

/** A separate, high-entropy export password is safer than the 4–12 digit
 * device-unlock PIN. Imported v1 backups remain decryptable with their legacy PIN. */
export function backupPasswordIssue(password:string,pin=''):string{
  if(password.length<12)return 'Backup password must have at least 12 characters.';
  if(password.length>128)return 'Backup password must not exceed 128 characters.';
  const counts=new Map<string,number>();
  for(const char of password)counts.set(char,(counts.get(char)??0)+1);
  const highlyRepetitive=Math.max(0,...counts.values())>password.length*0.6;
  if(new Set(password).size<4||/^\d+$/.test(password)||highlyRepetitive)return 'Use a strong backup passphrase, not a numeric PIN or repeated characters.';
  if(pin&&password===pin)return 'The backup password must be different from the device PIN.';
  return '';
}

function downloadFallback(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportBackup(pin: string, vault: VaultPayload): Promise<void> {
  const data = await createEncryptedBackup(pin, vault);
  const filename = `LOUREX-Backup-${new Date().toISOString().slice(0,10)}.lourex-backup`;
  const file = new File([JSON.stringify(data, null, 2)], filename, { type: 'application/json' });

  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (typeof navigator.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await navigator.share({
        files: [file],
        title: 'LOUREX Invoice Backup',
        text: 'Encrypted LOUREX Invoice backup. Choose “Save to Files” to keep it on this device.'
      });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Backup sharing was canceled. No file has been saved.');
    }
  }

  downloadFallback(file);
}

/** Validate the decrypted vault before migration, which intentionally supplies
 * defaults for older versions. In a current-schema backup, a missing collection
 * indicates corruption rather than a legitimately old data model. */
const CURRENT_VAULT_COLLECTIONS=[
  'customers','suppliers','purchases','supplierPayments','expenses','inventoryMovements',
  'treasuryAccounts','treasuryEntries','treasuryReconciliations','fxRates','warehouses',
  'workspaces','branches','teamMembers','approvalPolicies','approvalRequests','recurringWorkflows',
  'documents','documentEvents','documentRevisions','payments','savedItems'
] as const;

export function assertRestorableBackupVault(value:unknown):asserts value is VaultPayload{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Backup data is incomplete. The existing workspace was not changed.');
  const raw=value as Record<string,unknown>;
  if(!Number.isSafeInteger(raw.schemaVersion)||Number(raw.schemaVersion)<1||Number(raw.schemaVersion)>APP_SCHEMA_VERSION)
    throw new Error('This backup uses an unsupported data version. Update LOUREX before restoring to avoid losing records.');
  const isObject=(item:unknown)=>Boolean(item&&typeof item==='object'&&!Array.isArray(item));
  if(!isObject(raw.company)||!isObject(raw.appSettings)||!Array.isArray(raw.customers)||!Array.isArray(raw.documents))
    throw new Error('Backup data is incomplete. The existing workspace was not changed.');
  const required=Number(raw.schemaVersion)>=21;
  for(const key of CURRENT_VAULT_COLLECTIONS){
    const rows=raw[key];
    if(rows===undefined&&!required)continue; // Older schemas may predate this collection.
    if(!Array.isArray(rows)||rows.some(row=>!isObject(row)))
      throw new Error(`Backup collection "${key}" is missing or invalid. The existing workspace was not changed.`);
  }
  if(!Array.isArray(raw.workspaces)&&required)throw new Error('Backup workspaces are missing.');
  if(!Array.isArray(raw.branches)&&required)throw new Error('Backup branches are missing.');
}

export async function readBackup(file: File, pin: string): Promise<VaultPayload> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Backup file is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Backup file is not valid JSON.'); }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('This is not a valid LOUREX backup.');
  const candidate=parsed as Partial<EncryptedBackupFile>;
  if(candidate.format!=='LOUREX_BACKUP'||candidate.version!==1)throw new Error('This is not a valid LOUREX backup.');
  const restored=await decryptBackup(pin,candidate as EncryptedBackupFile);
  assertRestorableBackupVault(restored);
  return restored;
}
