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

export async function createSafetySnapshot(reason:SafetySnapshotReason,sourceSchemaVersion?:number):Promise<SafetySnapshotRecord|null>{
  const [security,vault]=await Promise.all([getSecurity(),getEncryptedVault()]);
  if(!security||!vault)return null;
  const snapshot:SafetySnapshotRecord={
    id:'safety-snapshot',
    createdAt:new Date().toISOString(),
    sourceSchemaVersion:Number.isFinite(sourceSchemaVersion)?Math.max(0,Math.trunc(sourceSchemaVersion as number)):Math.max(0,Math.trunc(vault.schemaVersion||0)),
    reason,
    security:structuredClone(security),
    vault:structuredClone(vault)
  };
  await putRecord(snapshot);
  return snapshot;
}

export async function getSafetySnapshot():Promise<SafetySnapshotRecord|null>{return getRecord<SafetySnapshotRecord>('safety-snapshot');}

export async function swapSafetySnapshotIntoCurrent():Promise<SafetySnapshotRecord>{
  const db=await openDb();
  return new Promise<SafetySnapshotRecord>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    const store=tx.objectStore(STORE);
    const snapshotReq=store.get('safety-snapshot');
    const securityReq=store.get('security');
    const vaultReq=store.get('vault');
    let restored:SafetySnapshotRecord|null=null;
    tx.oncomplete=()=>restored?resolve(restored):reject(new Error('Recovery snapshot is unavailable.'));
    tx.onerror=()=>reject(tx.error??new Error('Unable to restore recovery snapshot.'));
    tx.onabort=()=>reject(tx.error??new Error('Recovery restore was aborted.'));
    snapshotReq.onerror=()=>tx.abort();securityReq.onerror=()=>tx.abort();vaultReq.onerror=()=>tx.abort();
    vaultReq.onsuccess=()=>{
      if(snapshotReq.readyState!=='done'||securityReq.readyState!=='done')return;
      const snapshot=snapshotReq.result as SafetySnapshotRecord|undefined;
      const currentSecurity=securityReq.result as SecurityMetadata|undefined;
      const currentVault=vaultReq.result as EncryptedVaultRecord|undefined;
      if(!snapshot||!currentSecurity||!currentVault){tx.abort();return;}
      restored=structuredClone(snapshot);
      const reverse:SafetySnapshotRecord={id:'safety-snapshot',createdAt:new Date().toISOString(),sourceSchemaVersion:Math.max(0,Math.trunc(currentVault.schemaVersion||0)),reason:'pre-restore',security:structuredClone(currentSecurity),vault:structuredClone(currentVault)};
      store.put(snapshot.security);
      store.put(snapshot.vault);
      store.put(reverse);
    };
    const trySwap=()=>{
      if(snapshotReq.readyState!=='done'||securityReq.readyState!=='done'||vaultReq.readyState!=='done')return;
      const snapshot=snapshotReq.result as SafetySnapshotRecord|undefined;
      const currentSecurity=securityReq.result as SecurityMetadata|undefined;
      const currentVault=vaultReq.result as EncryptedVaultRecord|undefined;
      if(!snapshot||!currentSecurity||!currentVault){tx.abort();return;}
      if(restored)return;
      restored=structuredClone(snapshot);
      const reverse:SafetySnapshotRecord={id:'safety-snapshot',createdAt:new Date().toISOString(),sourceSchemaVersion:Math.max(0,Math.trunc(currentVault.schemaVersion||0)),reason:'pre-restore',security:structuredClone(currentSecurity),vault:structuredClone(currentVault)};
      store.put(snapshot.security);store.put(snapshot.vault);store.put(reverse);
    };
    snapshotReq.onsuccess=trySwap;securityReq.onsuccess=trySwap;vaultReq.onsuccess=trySwap;
  });
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
