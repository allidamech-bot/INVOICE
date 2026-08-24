import type { SecurityMetadata, VaultPayload } from '../types.js';
import { APP_SCHEMA_VERSION, emptyVault } from '../lib/defaults.js';
import { createSecurity, decryptVault, encryptVault, verifyPin } from '../crypto/crypto.js';
import { getEncryptedVault, getSecurity, putRecord, putSecurityAndVault } from './db.js';

export async function setupVault(pin: string, initial: VaultPayload = emptyVault()): Promise<{ key: CryptoKey; vault: VaultPayload }> {
  const { metadata, key } = await createSecurity(pin);
  const encrypted = await encryptVault(key, initial);
  await putSecurityAndVault(metadata, encrypted);
  return { key, vault: initial };
}

export function migrateVault(vault: VaultPayload): VaultPayload {
  if (!vault || typeof vault !== 'object') throw new Error('Local data is corrupted.');
  if ((vault.schemaVersion ?? 0) > APP_SCHEMA_VERSION) throw new Error('This data was created by a newer LOUREX Invoice version.');
  const migrated = { ...emptyVault(), ...vault, schemaVersion: APP_SCHEMA_VERSION } as VaultPayload;
  migrated.company = { ...emptyVault().company, ...(vault.company ?? {}) };
  migrated.appSettings = { ...emptyVault().appSettings, ...(vault.appSettings ?? {}), numbering: { ...emptyVault().appSettings.numbering, ...(vault.appSettings?.numbering ?? {}) } };
  migrated.customers = Array.isArray(vault.customers) ? vault.customers : [];
  migrated.documents = Array.isArray(vault.documents) ? vault.documents : [];
  const unique = (values: string[], label: string): void => {
    const seen = new Set<string>();
    for (const id of values) {
      if (!id || seen.has(id)) throw new Error(`Local data contains duplicate or invalid ${label} IDs.`);
      seen.add(id);
    }
  };
  unique(migrated.customers.map(c => c.id), 'customer');
  unique(migrated.documents.map(d => d.id), 'document');
  for (const document of migrated.documents) unique(document.items.map(i => i.id), 'item');
  return migrated;
}

export async function unlockVault(pin: string): Promise<{ key: CryptoKey; vault: VaultPayload; security: SecurityMetadata }> {
  const security = await getSecurity();
  const encrypted = await getEncryptedVault();
  if (!security || !encrypted) throw new Error('LOUREX Invoice has not been set up on this device.');
  const key = await verifyPin(pin, security);
  const vault = migrateVault(await decryptVault(key, encrypted));
  return { key, vault, security };
}

export async function saveVault(key: CryptoKey, vault: VaultPayload): Promise<void> {
  try { await putRecord(await encryptVault(key, { ...vault, schemaVersion: APP_SCHEMA_VERSION })); }
  catch (error) {
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'UnknownError')) throw new Error('Local storage is full. Export a backup and free device storage.');
    throw error;
  }
}

export async function restoreVaultWithCurrentKey(key: CryptoKey, vault: VaultPayload): Promise<VaultPayload> {
  const migrated = migrateVault(vault);
  await saveVault(key, migrated);
  return migrated;
}

export async function changePin(currentPin: string, newPin: string): Promise<{ key: CryptoKey; security: SecurityMetadata }> {
  const unlocked = await unlockVault(currentPin);
  const { metadata, key } = await createSecurity(newPin);
  const encrypted = await encryptVault(key, unlocked.vault);
  await putSecurityAndVault(metadata, encrypted);
  return { key, security: metadata };
}

export async function replaceVaultWithPin(pin: string, vault: VaultPayload): Promise<{ key: CryptoKey; security: SecurityMetadata; vault: VaultPayload }> {
  const migrated = migrateVault(vault);
  const { metadata, key } = await createSecurity(pin);
  const encrypted = await encryptVault(key, migrated);
  await putSecurityAndVault(metadata, encrypted);
  return { key, security: metadata, vault: migrated };
}
