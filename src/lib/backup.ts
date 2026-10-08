import type { EncryptedBackupFile, VaultPayload } from '../types.js';
import { createEncryptedBackup, decryptBackup } from '../crypto/crypto.js';

/** A separate, high-entropy export password is safer than the 4–12 digit
 * device-unlock PIN. Imported v1 backups remain decryptable with their legacy PIN. */
export function backupPasswordIssue(password:string,pin=''):string{
  if(password.length<12)return 'Backup password must have at least 12 characters.';
  if(password.length>128)return 'Backup password must not exceed 128 characters.';
  if(new Set(password).size<4||/^\\d+$/.test(password))return 'Use a strong backup passphrase, not a numeric PIN or repeated characters.';
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

export async function readBackup(file: File, pin: string): Promise<VaultPayload> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Backup file is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Backup file is not valid JSON.'); }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('This is not a valid LOUREX backup.');
  const candidate=parsed as Partial<EncryptedBackupFile>;
  if(candidate.format!=='LOUREX_BACKUP'||candidate.version!==1)throw new Error('This is not a valid LOUREX backup.');
  const restored=await decryptBackup(pin,candidate as EncryptedBackupFile);
  if(!restored||typeof restored!=='object'||Array.isArray(restored)
    ||!restored.company||typeof restored.company!=='object'||!restored.appSettings||typeof restored.appSettings!=='object'
    ||!Array.isArray(restored.documents)||!Array.isArray(restored.customers))
    throw new Error('Backup data is incomplete. The existing workspace was not changed.');
  return restored;
}
