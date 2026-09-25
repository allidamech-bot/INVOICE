import type { CloudAccountRecord, EncryptedVaultRecord, PublicPreferencesRecord, SafetySnapshotReason, SafetySnapshotRecord, SecurityMetadata, SessionKeyRecord } from '../types.js';

const LEGACY_DB_NAME = 'lourex-invoice';
const PUBLIC_DB_NAME = 'lourex-invoice-public';
const ACCOUNT_DB_PREFIX = 'lourex-invoice-account-';
const DB_VERSION = 1;
const STORE = 'records';
const MIGRATION_MARKER_PREFIX = 'lourex-account-storage-v1-migrated:';
const PUBLIC_RECOVERY_MARKER_PREFIX = 'lourex-account-storage-public-v2-migrated:';
const ACTIVE_SCOPE_META_KEY='lourex-active-storage-meta-v341';
const ACTIVE_VAULT_META_KEY='lourex-active-vault-meta-v341';
const VAULT_WRITE_DIAG_INTERVAL_MS=30_000;

type DbRecord = SecurityMetadata | EncryptedVaultRecord | PublicPreferencesRecord | SessionKeyRecord | CloudAccountRecord | SafetySnapshotRecord;

let activeStorageUid:string|null=null;
let dbPromise:Promise<IDBDatabase>|null=null;
let openDbName='';
let lastVaultWriteDiagnosticAt=0;

function diag(type:string,detail=''):void{try{if(typeof window!=='undefined')(window as any).__LOUREX_DIAGNOSTICS__?.mark?.(type,detail);}catch{}}
function nowTick():number{return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function elapsedMs(start:number):number{return Math.max(0,Math.round(nowTick()-start));}
function errorName(error:unknown):string{return error instanceof Error?error.name:'UnknownError';}
function scopeKind():string{return activeStorageUid?'account':'public';}
function accountDbName(uid:string):string{return `${ACCOUNT_DB_PREFIX}${encodeURIComponent(uid)}`;}
function scopedDbName():string{return activeStorageUid?accountDbName(activeStorageUid):PUBLIC_DB_NAME;}
function migrationMarker(uid:string):string{return `${MIGRATION_MARKER_PREFIX}${uid}`;}
function publicRecoveryMarker(uid:string):string{return `${PUBLIC_RECOVERY_MARKER_PREFIX}${uid}`;}
function scopeFingerprint(value:string):string{let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
function decodedBase64Bytes(value:string):number{const text=String(value||'');if(!text)return 0;let padding=0;if(text.endsWith('=='))padding=2;else if(text.endsWith('='))padding=1;return Math.max(0,Math.floor(text.length*3/4)-padding);}
function rememberActiveScope():void{
  try{localStorage.setItem(ACTIVE_SCOPE_META_KEY,JSON.stringify({fingerprint:scopeFingerprint(scopedDbName()),kind:activeStorageUid?'account':'public',measuredAt:new Date().toISOString()}));}catch{}
}
function rememberVaultMeta(vault:EncryptedVaultRecord):void{
  try{localStorage.setItem(ACTIVE_VAULT_META_KEY,JSON.stringify({fingerprint:scopeFingerprint(scopedDbName()),kind:activeStorageUid?'account':'public',cipherChars:String(vault.cipher||'').length,encryptedBytes:decodedBase64Bytes(vault.cipher),updatedAt:vault.updatedAt||'',measuredAt:new Date().toISOString()}));}catch{}
}

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

async function targetHasProtectedWorkspace(db:IDBDatabase):Promise<boolean>{
  const [security,vault]=await Promise.all([
    namedGet<SecurityMetadata>(db,'security'),
    namedGet<EncryptedVaultRecord>(db,'vault')
  ]);
  return Boolean(security&&vault);
}

function migrationAlreadyHandled(uid:string):boolean{
  try{return localStorage.getItem(migrationMarker(uid))==='1';}catch{return false;}
}
function markMigrationHandled(uid:string):void{
  try{localStorage.setItem(migrationMarker(uid),'1');}catch{}
}
function publicRecoveryAlreadyHandled(uid:string):boolean{
  try{return localStorage.getItem(publicRecoveryMarker(uid))==='1';}catch{return false;}
}
function markPublicRecoveryHandled(uid:string):void{
  try{localStorage.setItem(publicRecoveryMarker(uid),'1');}catch{}
}

async function migrateLegacyAccountIfOwned(uid:string):Promise<void>{
  if(migrationAlreadyHandled(uid))return;
  const target=await openNamedDb(accountDbName(uid));
  try{
    if(await targetAlreadyInitialized(target)){markMigrationHandled(uid);return;}
    const legacy=await openNamedDb(LEGACY_DB_NAME);
    try{
      const owner=await namedGet<CloudAccountRecord>(legacy,'cloud-account');
      if(!owner||owner.uid!==uid){markMigrationHandled(uid);return;}
      const ids:Array<DbRecord['id']>=['security','vault','public-preferences','session-key','cloud-account','safety-snapshot'];
      const records:DbRecord[]=[];
      for(const id of ids){const record=await namedGet<DbRecord>(legacy,id as any);if(record)records.push(record);}
      await namedPutMany(target,records);
      markMigrationHandled(uid);
    }finally{legacy.close();}
  }finally{target.close();}
}

async function migrateAccidentalPublicAccountIfOwned(uid:string):Promise<void>{
  if(publicRecoveryAlreadyHandled(uid))return;
  const target=await openNamedDb(accountDbName(uid));
  try{
    if(await targetHasProtectedWorkspace(target)){markPublicRecoveryHandled(uid);return;}
    const publicDb=await openNamedDb(PUBLIC_DB_NAME);
    try{
      const owner=await namedGet<CloudAccountRecord>(publicDb,'cloud-account');
      if(!owner||owner.uid!==uid){markPublicRecoveryHandled(uid);return;}
      const security=await namedGet<SecurityMetadata>(publicDb,'security');
      const vault=await namedGet<EncryptedVaultRecord>(publicDb,'vault');
      if(!security||!vault){markPublicRecoveryHandled(uid);return;}
      const records:DbRecord[]=[security,vault,owner];
      for(const id of ['public-preferences','session-key'] as const){
        const record=await namedGet<DbRecord>(publicDb,id as any);
        if(record)records.push(record);
      }
      await namedPutMany(target,records);
      markPublicRecoveryHandled(uid);
    }finally{publicDb.close();}
  }finally{target.close();}
}

/**
 * Select the local encrypted workspace for one authenticated Firebase UID.
 * Each account gets a physically distinct IndexedDB database on this device.
 * Passing null selects a non-business public scope used only while signed out.
 */
export async function activateAccountStorage(uid:string|null):Promise<void>{
  const normalized=uid?.trim()||null;
  if(normalized===activeStorageUid&&openDbName===scopedDbName()){rememberActiveScope();return;}
  const started=nowTick();
  try{
    await closeActiveDb();
    if(normalized){
      await migrateLegacyAccountIfOwned(normalized);
      await migrateAccidentalPublicAccountIfOwned(normalized);
    }
    activeStorageUid=normalized;
    rememberActiveScope();
    diag('storage-scope-activated',`kind=${normalized?'account':'public'} durationMs=${elapsedMs(started)}`);
  }catch(error){
    diag('storage-scope-error',`kind=${normalized?'account':'public'} name=${errorName(error)} durationMs=${elapsedMs(started)}`);
    throw error;
  }
}

export function activeAccountStorageUid():string|null{return activeStorageUid;}

function openDb(): Promise<IDBDatabase> {
  const name=scopedDbName();
  if(dbPromise&&openDbName===name)return dbPromise;
  const started=nowTick();
  dbPromise=new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db=request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db=request.result;
      openDbName=name;
      db.onversionchange=()=>{diag('indexeddb-versionchange',`kind=${scopeKind()}`);db.close();dbPromise=null;openDbName='';};
      db.onclose=()=>{diag('indexeddb-close',`kind=${scopeKind()}`);dbPromise=null;openDbName='';};
      diag('indexeddb-open-success',`kind=${scopeKind()} durationMs=${elapsedMs(started)}`);
      resolve(db);
    };
    request.onerror = () => {
      const error=request.error??new Error('Unable to open IndexedDB.');
      diag('indexeddb-open-error',`kind=${scopeKind()} name=${errorName(error)} durationMs=${elapsedMs(started)}`);
      dbPromise=null;openDbName='';reject(error);
    };
    request.onblocked=()=>diag('indexeddb-open-blocked',`kind=${scopeKind()} durationMs=${elapsedMs(started)}`);
  });
  return dbPromise;
}

export async function getRecord<T extends DbRecord>(id: T['id']): Promise<T | null> {
  const started=nowTick(),vaultRead=id==='vault';
  try{
    const db = await openDb();
    const value=await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed.'));
    });
    if(vaultRead)diag('vault-storage-read-success',`durationMs=${elapsedMs(started)} present=${value?'yes':'no'}`);
    return value;
  }catch(error){
    if(vaultRead)diag('vault-storage-read-error',`name=${errorName(error)} durationMs=${elapsedMs(started)}`);
    throw error;
  }
}

export async function putRecord(record: DbRecord): Promise<void> {
  const started=nowTick(),vaultWrite=record.id==='vault';
  try{
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted.'));
    });
    if(vaultWrite){
      rememberVaultMeta(record as EncryptedVaultRecord);
      const duration=elapsedMs(started),now=Date.now();
      if(duration>=150||now-lastVaultWriteDiagnosticAt>=VAULT_WRITE_DIAG_INTERVAL_MS){lastVaultWriteDiagnosticAt=now;diag('vault-storage-write-success',`durationMs=${duration} cipherChars=${String((record as EncryptedVaultRecord).cipher||'').length}`);}
    }
  }catch(error){
    diag(vaultWrite?'vault-storage-write-error':'indexeddb-write-error',`record=${String(record.id)} name=${errorName(error)} durationMs=${elapsedMs(started)}`);
    throw error;
  }
}

export async function deleteRecord(id: DbRecord['id']): Promise<void> {
  const started=nowTick();
  try{
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('IndexedDB write failed.'));
      tx.onabort=()=>reject(tx.error??new Error('IndexedDB write aborted.'));
    });
  }catch(error){diag('indexeddb-delete-error',`record=${String(id)} name=${errorName(error)} durationMs=${elapsedMs(started)}`);throw error;}
}

export async function putSecurityAndVault(security: SecurityMetadata, vault: EncryptedVaultRecord): Promise<void> {
  const started=nowTick();
  try{
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      store.put(security); store.put(vault);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('Unable to commit encrypted data.'));
      tx.onabort=()=>reject(tx.error??new Error('Encrypted data transaction aborted.'));
    });
    rememberVaultMeta(vault);
    diag('security-vault-write-success',`durationMs=${elapsedMs(started)} cipherChars=${String(vault.cipher||'').length}`);
  }catch(error){diag('security-vault-write-error',`name=${errorName(error)} durationMs=${elapsedMs(started)}`);throw error;}
}

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
export async function getEncryptedVault(): Promise<EncryptedVaultRecord | null> {
  const vault=await getRecord<EncryptedVaultRecord>('vault');
  if(vault)rememberVaultMeta(vault);
  return vault;
}
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

export async function clearDatabase(): Promise<void> {
  const name=scopedDbName(),kind=scopeKind(),started=nowTick();
  try{
    await closeActiveDb();
    await new Promise<void>((resolve, reject) => {
      const req=indexedDB.deleteDatabase(name);
      req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error??new Error('Unable to clear local database.')); req.onblocked=()=>reject(new Error('Database is currently in use.'));
    });
    diag('indexeddb-clear-success',`kind=${kind} durationMs=${elapsedMs(started)}`);
  }catch(error){diag('indexeddb-clear-error',`kind=${kind} name=${errorName(error)} durationMs=${elapsedMs(started)}`);throw error;}
}
