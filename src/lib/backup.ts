import type { EncryptedBackupFile, VaultPayload } from '../types.js';
import { createEncryptedBackup, decryptBackup } from '../crypto/crypto.js';

export async function exportBackup(pin: string, vault: VaultPayload): Promise<void> {
  const data = await createEncryptedBackup(pin, vault);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/x-lourex-backup' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `LOUREX-Backup-${new Date().toISOString().slice(0,10)}.lourex-backup`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackup(file: File, pin: string): Promise<VaultPayload> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Backup file is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Backup file is not valid JSON.'); }
  const candidate = parsed as Partial<EncryptedBackupFile>;
  if (candidate.format !== 'LOUREX_BACKUP' || candidate.version !== 1) throw new Error('This is not a valid LOUREX backup.');
  return decryptBackup(pin, candidate as EncryptedBackupFile);
}
