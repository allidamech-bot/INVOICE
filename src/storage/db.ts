import type { EncryptedVaultRecord, PublicPreferencesRecord, SecurityMetadata, SessionKeyRecord } from '../types.js';

const DB_NAME = 'lourex-invoice';
const DB_VERSION = 1;
const STORE = 'records';

type DbRecord = SecurityMetadata | EncryptedVaultRecord | PublicPreferencesRecord | SessionKeyRecord;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'));
  });
}

export async function getRecord<T extends DbRecord>(id: T['id']): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed.'));
    });
  } finally { db.close(); }
}

export async function putRecord(record: DbRecord): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted.'));
    });
  } finally { db.close(); }
}

export async function deleteRecord(id: DbRecord['id']): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted.'));
    });
  } finally { db.close(); }
}

export async function putSecurityAndVault(security: SecurityMetadata, vault: EncryptedVaultRecord): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(security); store.put(vault);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to commit encrypted data.'));
      tx.onabort = () => reject(tx.error ?? new Error('Encrypted data transaction aborted.'));
    });
  } finally { db.close(); }
}

export async function hasSecurity(): Promise<boolean> { return Boolean(await getRecord<SecurityMetadata>('security')); }
export async function getSecurity(): Promise<SecurityMetadata | null> { return getRecord<SecurityMetadata>('security'); }
export async function getEncryptedVault(): Promise<EncryptedVaultRecord | null> { return getRecord<EncryptedVaultRecord>('vault'); }
export async function getPublicPreferences(): Promise<PublicPreferencesRecord | null> { return getRecord<PublicPreferencesRecord>('public-preferences'); }
export async function putPublicPreferences(preferences: Omit<PublicPreferencesRecord, 'id'|'updatedAt'>): Promise<void> {
  await putRecord({ id:'public-preferences', ...preferences, updatedAt:new Date().toISOString() });
}

export async function clearDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(); req.onerror = () => reject(req.error ?? new Error('Unable to clear local database.')); req.onblocked = () => reject(new Error('Database is currently in use.'));
  });
}
