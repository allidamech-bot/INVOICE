import type { SecurityMetadata, VaultPayload } from '../types.js';
import { APP_SCHEMA_VERSION, emptyVault } from '../lib/defaults.js';
import { createSecurity, decryptVault, encryptVault, verifyPin } from '../crypto/crypto.js';
import { getEncryptedVault, getSecurity, putRecord, putSecurityAndVault } from './db.js';
import { clearSession, getSessionKey, isSessionExpired, touchSession } from './session.js';

export async function setupVault(pin: string, initial: VaultPayload = emptyVault()): Promise<{ key: CryptoKey; vault: VaultPayload }> {
  const { metadata, key } = await createSecurity(pin);
  const encrypted = await encryptVault(key, initial);
  await putSecurityAndVault(metadata, encrypted);
  return { key, vault: initial };
}

export function migrateVault(vault: VaultPayload): VaultPayload {
  if (!vault || typeof vault !== 'object') throw new Error('Local data is corrupted.');
  const sourceVersion = vault.schemaVersion ?? 0;
  if (sourceVersion > APP_SCHEMA_VERSION) throw new Error('This data was created by a newer LOUREX Invoice version.');
  const defaults=emptyVault();
  const migrated = { ...defaults, ...vault, schemaVersion: APP_SCHEMA_VERSION } as VaultPayload;
  migrated.company = { ...defaults.company, ...(vault.company ?? {}) };
  migrated.appSettings = {
    ...defaults.appSettings,
    ...(vault.appSettings ?? {}),
    numbering: { ...defaults.appSettings.numbering, ...(vault.appSettings?.numbering ?? {}) },
    smartDefaults:{...defaults.appSettings.smartDefaults,...((vault.appSettings as any)?.smartDefaults??{})}
  };
  if (sourceVersion < 2) migrated.appSettings.autoLockMinutes = 0;
  if(sourceVersion<3){
    migrated.appSettings.smartDefaults={
      ...migrated.appSettings.smartDefaults,
      currency:migrated.company.defaultCurrency||migrated.appSettings.smartDefaults.currency,
      language:migrated.company.defaultLanguage||migrated.appSettings.smartDefaults.language,
      incoterm:migrated.company.defaultIncoterm||migrated.appSettings.smartDefaults.incoterm,
      paymentTerms:migrated.company.defaultPaymentTerms||migrated.appSettings.smartDefaults.paymentTerms,
      deliveryTime:migrated.company.defaultDeliveryTime||migrated.appSettings.smartDefaults.deliveryTime
    };
  }
  migrated.customers = Array.isArray(vault.customers) ? vault.customers : [];
  migrated.savedItems = Array.isArray((vault as any).savedItems) ? (vault as any).savedItems.map((item:any)=>({
    id:item.id,
    createdAt:item.createdAt||new Date().toISOString(),
    updatedAt:item.updatedAt||new Date().toISOString(),
    descriptionEn:item.descriptionEn||'',descriptionAr:item.descriptionAr||'',hsCode:item.hsCode||'',origin:item.origin||'',packing:item.packing||'',unit:item.unit||'PCS',
    lastUnitPrice:item.lastUnitPrice??item.unitPrice??'',lastCurrency:(item.lastCurrency||migrated.appSettings.smartDefaults.currency||'USD').toUpperCase(),usageCount:Number.isFinite(item.usageCount)?item.usageCount:0,lastUsedAt:item.lastUsedAt||item.updatedAt||new Date().toISOString()
  })) : [];
  migrated.documents = Array.isArray(vault.documents) ? vault.documents.map(document => {
    const appearance=(document as any).appearance ?? {};
    return {
      ...document,
      appearance: {
        templateId:appearance.templateId ?? 'executive',
        paletteMode:appearance.paletteMode ?? 'auto',
        accentColor:appearance.accentColor ?? '#b58b4f',
        latinFont:appearance.latinFont ?? 'auto',
        arabicFont:appearance.arabicFont ?? 'auto',
        showBank:appearance.showBank ?? true,
        showSignature:appearance.showSignature ?? Boolean(document.companySnapshot?.signatureDataUrl),
        showStamp:appearance.showStamp ?? Boolean(document.companySnapshot?.stampDataUrl),
        showHsCode:appearance.showHsCode ?? true,
        showOrigin:appearance.showOrigin ?? true,
        showPacking:appearance.showPacking ?? false
      }
    };
  }) : [];
  const unique = (values: string[], label: string): void => {
    const seen = new Set<string>();
    for (const id of values) {
      if (!id || seen.has(id)) throw new Error(`Local data contains duplicate or invalid ${label} IDs.`);
      seen.add(id);
    }
  };
  unique(migrated.customers.map(c => c.id), 'customer');
  unique(migrated.documents.map(d => d.id), 'document');
  unique(migrated.savedItems.map(i=>i.id),'saved item');
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

export async function resumeVaultSession(): Promise<{ key: CryptoKey; vault: VaultPayload } | null> {
  const session = await getSessionKey();
  if (!session) return null;
  const encrypted = await getEncryptedVault();
  if (!encrypted) { await clearSession(); return null; }
  try {
    const vault = migrateVault(await decryptVault(session.key, encrypted));
    if (isSessionExpired(session.lastActivity, vault.appSettings.autoLockMinutes)) {
      await clearSession();
      return null;
    }
    touchSession();
    return { key: session.key, vault };
  } catch {
    await clearSession();
    return null;
  }
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
