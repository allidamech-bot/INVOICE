import type { EncryptedBackupFile, VaultPayload } from '../types.js';
import { createEncryptedBackup, decryptBackup } from '../crypto/crypto.js';

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
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  downloadFallback(file);
}

export async function readBackup(file: File, pin: string): Promise<VaultPayload> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Backup file is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Backup file is not valid JSON.'); }
  const candidate = parsed as Partial<EncryptedBackupFile>;
  if (candidate.format !== 'LOUREX_BACKUP' || candidate.version !== 1) throw new Error('This is not a valid LOUREX backup.');
  return decryptBackup(pin, candidate as EncryptedBackupFile);
}
