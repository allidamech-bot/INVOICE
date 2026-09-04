import type { CloudAccountRecord, EncryptedVaultRecord, PublicPreferencesRecord, SafetySnapshotReason, SafetySnapshotRecord, SecurityMetadata, SessionKeyRecord } from '../types.js';

const DB_NAME = 'lourex-invoice';
const DB_VERSION = 1;
const STORE = 'records';

type DbRecord = SecurityMetadata | EncryptedVaultRecord | PublicPreferencesRecord | SessionKeyRecord | CloudAccountRecord | SafetySnapshotRecord;

let dbPromise:Promise<IDBDatabase>|null=null;

function openDb(): Promise<IDBDatabase> {
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db=request.result;
      db.onversionchange=()=>{db.close();dbPromise=null;};
      db.onclose=()=>{dbPromise=null;};
      resolve(db);
    };
    request.onerror = () => {dbPromise=null;reject(request.error ?? new Error('Unable to open IndexedDB.'));};
  });
  return dbPromise;
}

export async function getRecord<T extends DbRecord>(id: T['id']): Promise<T | null> {
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed.'));
  });
}

export async function putRecord(record: DbRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted.'));
  });
}

export async function deleteRecord(id: DbRecord['id']): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted.'));
  });
}

export async function putSecurityAndVault(security: SecurityMetadata, vault: EncryptedVaultRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(security); store.put(vault);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to commit encrypted data.'));
    tx.onabort = () => reject(tx.error ?? new Error('Encrypted data transaction aborted.'));
  });
}

// Local recovery snapshots were retired when LOUREX moved to an account-first
// cloud model. Keep these compatibility functions so older code cannot recreate
// a durable local backup; any legacy snapshot is deleted instead.
export async function purgeLegacySafetySnapshot():Promise<void>{
  try{await deleteRecord('safety-snapshot');}catch{}
}
export async function createSafetySnapshot(_reason:SafetySnapshotReason,_sourceSchemaVersion?:number):Promise<SafetySnapshotRecord|null>{
  await purgeLegacySafetySnapshot();
  return null;
}
export async function getSafetySnapshot():Promise<SafetySnapshotRecord|null>{
  await purgeLegacySafetySnapshot();
  return null;
}
export async function swapSafetySnapshotIntoCurrent():Promise<SafetySnapshotRecord>{
  await purgeLegacySafetySnapshot();
  throw new Error('Local recovery copies are no longer used. Restore your account data from the cloud.');
}

export async function hasSecurity(): Promise<boolean> { return Boolean(await getRecord<SecurityMetadata>('security')); }
export async function getSecurity(): Promise<SecurityMetadata | null> { return getRecord<SecurityMetadata>('security'); }
export async function getEncryptedVault(): Promise<EncryptedVaultRecord | null> { return getRecord<EncryptedVaultRecord>('vault'); }
export async function getPublicPreferences(): Promise<PublicPreferencesRecord | null> { return getRecord<PublicPreferencesRecord>('public-preferences'); }
export async function putPublicPreferences(preferences: Omit<PublicPreferencesRecord, 'id'|'updatedAt'>): Promise<void> {
  await putRecord({ id:'public-preferences', ...preferences, updatedAt:new Date().toISOString() });
}
export async function getCloudAccount(): Promise<CloudAccountRecord | null> { return getRecord<CloudAccountRecord>('cloud-account'); }
export async function putCloudAccount(uid:string,email:string): Promise<void> {
  const existing=await getCloudAccount();
  const now=new Date().toISOString();
  await putRecord({id:'cloud-account',uid,email,linkedAt:existing?.uid===uid?existing.linkedAt:now,updatedAt:now});
}
export async function clearCloudAccount(): Promise<void> { await deleteRecord('cloud-account'); }

export async function clearDatabase(): Promise<void> {
  const db=await dbPromise?.catch(()=>null);
  db?.close();
  dbPromise=null;
  await new Promise<void>((resolve, reject) => {
    const req=indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error??new Error('Unable to clear local database.')); req.onblocked=()=>reject(new Error('Database is currently in use.'));
  });
}
