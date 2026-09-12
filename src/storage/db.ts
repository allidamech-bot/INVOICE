import type { CloudAccountRecord, EncryptedVaultRecord, PublicPreferencesRecord, SafetySnapshotReason, SafetySnapshotRecord, SecurityMetadata, SessionKeyRecord } from '../types.js';

const LEGACY_DB_NAME = 'lourex-invoice';
const PUBLIC_DB_NAME = 'lourex-invoice-public';
const ACCOUNT_DB_PREFIX = 'lourex-invoice-account-';
const DB_VERSION = 1;
const STORE = 'records';
const MIGRATION_MARKER_PREFIX = 'lourex-account-storage-v1-migrated:';

type DbRecord = SecurityMetadata | EncryptedVaultRecord | PublicPreferencesRecord | SessionKeyRecord | CloudAccountRecord | SafetySnapshotRecord;

let activeStorageUid:string|null=null;
let dbPromise:Promise<IDBDatabase>|null=null;
let openDbName='';

function accountDbName(uid:string):string{return `${ACCOUNT_DB_PREFIX}${encodeURIComponent(uid)}`;}
function scopedDbName():string{return activeStorageUid?accountDbName(activeStorageUid):PUBLIC_DB_NAME;}
function migrationMarker(uid:string):string{return `${MIGRATION_MARKER_PREFIX}${uid}`;}

function openNamedDb(name:string):Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??new Error('Unable to open IndexedDB.'));
  });
}

async function closeActiveDb():Promise<void>{
  const current=await dbPromise?.catch(()=>null);
  current?.close();
  dbPromise=null;
  openDbName='';
}

function namedGet<T extends DbRecord>(db:IDBDatabase,id:T['id']):Promise<T|null>{
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');
    const req=tx.objectStore(STORE).get(id);
    req.onsuccess=()=>resolve((req.result as T|undefined)??null);
    req.onerror=()=>reject(req.error??new Error('IndexedDB read failed.'));
  });
}

function namedPutMany(db:IDBDatabase,records:DbRecord[]):Promise<void>{
  if(!records.length)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    const store=tx.objectStore(STORE);
    records.forEach(record=>store.put(record));
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error??new Error('IndexedDB migration write failed.'));
    tx.onabort=()=>reject(tx.error??new Error('IndexedDB migration aborted.'));
  });
}

async function targetAlreadyInitialized(db:IDBDatabase):Promise<boolean>{
  const ids:Array<DbRecord['id']>=['cloud-account','security','vault','session-key','public-preferences'];
  for(const id of ids)if(await namedGet(db,id as any))return true;
  return false;
}

function migrationAlreadyHandled(uid:string):boolean{
  try{return localStorage.getItem(migrationMarker(uid))==='1';}catch{return false;}
}
function markMigrationHandled(uid:string):void{
  try{localStorage.setItem(migrationMarker(uid),'1');}catch{}
}

async function migrateLegacyAccountIfOwned(uid:string):Promise<void>{
  if(migrationAlreadyHandled(uid))return;
  const target=await openNamedDb(accountDbName(uid));
  try{
    if(await targetAlreadyInitialized(target)){markMigrationHandled(uid);return;}
    const legacy=await openNamedDb(LEGACY_DB_NAME);
    try{
      const owner=await namedGet<CloudAccountRecord>(legacy,'cloud-account');
      // Never adopt legacy local data unless the durable account record proves
      // that it belongs to the exact authenticated Firebase UID.
      if(!owner||owner.uid!==uid){markMigrationHandled(uid);return;}
      const ids:Array<DbRecord['id']>=['security','vault','public-preferences','session-key','cloud-account','safety-snapshot'];
      const records:DbRecord[]=[];
      for(const id of ids){const record=await namedGet<DbRecord>(legacy,id as any);if(record)records.push(record);}
      await namedPutMany(target,records);
      markMigrationHandled(uid);
    }finally{legacy.close();}
  }finally{target.close();}
}

/**
 * Select the local encrypted workspace for one authenticated Firebase UID.
 * Each account gets a physically distinct IndexedDB database on this device.
 * Passing null selects a non-business public scope used only while signed out.
 */
export async function activateAccountStorage(uid:string|null):Promise<void>{
  const normalized=uid?.trim()||null;
  if(normalized===activeStorageUid&&openDbName===scopedDbName())return;
  await closeActiveDb();
  if(normalized)await migrateLegacyAccountIfOwned(normalized);
  activeStorageUid=normalized;
}

export function activeAccountStorageUid():string|null{return activeStorageUid;}

function openDb(): Promise<IDBDatabase> {
  const name=scopedDbName();
  if(dbPromise&&openDbName===name)return dbPromise;
  dbPromise=new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db=request.result;
      openDbName=name;
      db.onversionchange=()=>{db.close();dbPromise=null;openDbName='';};
      db.onclose=()=>{dbPromise=null;openDbName='';};
      resolve(db);
    };
    request.onerror = () => {dbPromise=null;openDbName='';reject(request.error ?? new Error('Unable to open IndexedDB.'));};
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
  if(activeStorageUid&&activeStorageUid!==uid)throw new Error('Local account storage does not match the authenticated account.');
  const existing=await getCloudAccount();
  const now=new Date().toISOString();
  await putRecord({id:'cloud-account',uid,email,linkedAt:existing?.uid===uid?existing.linkedAt:now,updatedAt:now});
}
export async function clearCloudAccount(): Promise<void> { await deleteRecord('cloud-account'); }

// Clear only the currently selected local account scope. Other users on the same
// device keep their own encrypted databases untouched.
export async function clearDatabase(): Promise<void> {
  const name=scopedDbName();
  await closeActiveDb();
  await new Promise<void>((resolve, reject) => {
    const req=indexedDB.deleteDatabase(name);
    req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error??new Error('Unable to clear local database.')); req.onblocked=()=>reject(new Error('Database is currently in use.'));
  });
}
