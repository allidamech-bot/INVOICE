import type { EncryptedBackupFile, EncryptedVaultRecord, SecurityMetadata, VaultPayload } from '../types.js';
import { APP_SCHEMA_VERSION, KDF_ITERATIONS } from '../lib/defaults.js';
import { compactCompanySnapshotAssets, hydrateCompanySnapshotAssets } from '../lib/company-asset-dedup.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERIFY_TEXT = 'LOUREX-VAULT-VERIFIER-v1';
const MIN_KDF_ITERATIONS = 10_000;
const MAX_KDF_ITERATIONS = 2_000_000;
const MIN_SALT_BYTES = 16;
const MAX_SALT_BYTES = 64;
const GCM_IV_BYTES = 12;
const ACCOUNT_SECRET_PATTERN=/^acct_[A-Za-z0-9_-]{43}$/;
const ACTIVE_SCOPE_META_KEY='lourex-active-storage-meta-v341';
const VAULT_BREAKDOWN_KEY='lourex-vault-payload-breakdown-v342';
const BREAKDOWN_MIN_INTERVAL_MS=5*60*1000;
const SAVE_DIAG_INTERVAL_MS=30_000;
let lastBreakdownAt=0;
let lastVaultSaveDiagnosticAt=0;

function diag(type:string,detail=''):void{try{if(typeof window!=='undefined')(window as any).__LOUREX_DIAGNOSTICS__?.mark?.(type,detail);}catch{}}
function errorName(error:unknown):string{return error instanceof Error?error.name:'UnknownError';}
function elapsedMs(start:number):number{return Math.max(0,Math.round((typeof performance!=='undefined'&&performance.now?performance.now():Date.now())-start));}
function nowTick():number{return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array {
  if (typeof value !== 'string' || !value) throw new Error('Invalid encrypted data.');
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function validateKdf(iterations: number, salt: Uint8Array): void {
  if (!Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS || iterations > MAX_KDF_ITERATIONS) {
    throw new Error('Invalid encryption parameters.');
  }
  if (salt.byteLength < MIN_SALT_BYTES || salt.byteLength > MAX_SALT_BYTES) {
    throw new Error('Invalid encryption parameters.');
  }
}

function activeScopeFingerprint():string{
  try{
    const value=JSON.parse(localStorage.getItem(ACTIVE_SCOPE_META_KEY)||'null');
    return value&&typeof value==='object'&&typeof value.fingerprint==='string'?value.fingerprint:'';
  }catch{return '';}
}

function dataUrlApproxBytes(value:string):number{
  if(!value.startsWith('data:'))return 0;
  const comma=value.indexOf(',');
  if(comma<0)return 0;
  const payloadChars=Math.max(0,value.length-comma-1);
  const marker=value.indexOf(';base64,');
  if(marker>=0&&marker<comma+1){
    let padding=0;
    if(value.endsWith('=='))padding=2;
    else if(value.endsWith('='))padding=1;
    return Math.max(0,Math.floor(payloadChars*3/4)-padding);
  }
  return payloadChars;
}

function dataUrlChars(value:unknown):number{return typeof value==='string'&&value.startsWith('data:')?value.length:0;}
function assetChars(company:any):number{
  if(!company||typeof company!=='object')return 0;
  return dataUrlChars(company.logoDataUrl)+dataUrlChars(company.signatureDataUrl)+dataUrlChars(company.stampDataUrl);
}

function attachmentStats(documents:any[]):{count:number;declaredBytes:number;dataUrlChars:number;approxBytes:number;largestDeclaredBytes:number;largestDataUrlChars:number}{
  let count=0,declaredBytes=0,dataChars=0,approxBytes=0,largestDeclaredBytes=0,largestDataUrlChars=0;
  for(const document of documents){
    const attachments=Array.isArray(document?.attachments)?document.attachments:[];
    for(const attachment of attachments){
      count+=1;
      const declared=Math.max(0,Number(attachment?.size)||0);
      const data=typeof attachment?.dataUrl==='string'?attachment.dataUrl:'';
      const chars=dataUrlChars(data);
      declaredBytes+=declared;
      dataChars+=chars;
      approxBytes+=dataUrlApproxBytes(data);
      largestDeclaredBytes=Math.max(largestDeclaredBytes,declared);
      largestDataUrlChars=Math.max(largestDataUrlChars,chars);
    }
  }
  return{count,declaredBytes,dataUrlChars:dataChars,approxBytes,largestDeclaredBytes,largestDataUrlChars};
}

function scanVaultStrings(vault:VaultPayload):{totalStringChars:number;dataUrlCount:number;dataUrlChars:number;dataUrlApproxBytes:number;nonDataStringChars:number}{
  let totalStringChars=0,dataUrlCount=0,totalDataChars=0,totalDataBytes=0;
  const stack:any[]=[vault];
  while(stack.length){
    const value=stack.pop();
    if(typeof value==='string'){
      totalStringChars+=value.length;
      if(value.startsWith('data:')){dataUrlCount+=1;totalDataChars+=value.length;totalDataBytes+=dataUrlApproxBytes(value);}
      continue;
    }
    if(Array.isArray(value)){
      for(let index=0;index<value.length;index+=1)stack.push(value[index]);
      continue;
    }
    if(value&&typeof value==='object')for(const entry of Object.values(value))stack.push(entry);
  }
  return{totalStringChars,dataUrlCount,dataUrlChars:totalDataChars,dataUrlApproxBytes:totalDataBytes,nonDataStringChars:Math.max(0,totalStringChars-totalDataChars)};
}

function recordVaultPayloadBreakdown(vault:VaultPayload,force=false):void{
  const now=Date.now();
  if(!force&&now-lastBreakdownAt<BREAKDOWN_MIN_INTERVAL_MS)return;
  lastBreakdownAt=now;
  try{
    const documents=Array.isArray(vault.documents)?vault.documents:[];
    const revisions=Array.isArray(vault.documentRevisions)?vault.documentRevisions:[];
    const revisionDocuments=revisions.map((revision:any)=>revision?.snapshot).filter(Boolean);
    const currentAttachments=attachmentStats(documents);
    const revisionAttachments=attachmentStats(revisionDocuments);
    const scan=scanVaultStrings(vault);
    const currentCompanyAssetChars=assetChars((vault as any).company);
    const documentSnapshotAssetChars=documents.reduce((sum:number,document:any)=>sum+assetChars(document?.companySnapshot),0);
    const revisionSnapshotAssetChars=revisionDocuments.reduce((sum:number,document:any)=>sum+assetChars(document?.companySnapshot),0);
    const payload={
      version:343,
      measuredAt:new Date(now).toISOString(),
      fingerprint:activeScopeFingerprint(),
      collections:{
        documents:documents.length,
        revisions:revisions.length,
        customers:Array.isArray(vault.customers)?vault.customers.length:0,
        suppliers:Array.isArray(vault.suppliers)?vault.suppliers.length:0,
        purchases:Array.isArray(vault.purchases)?vault.purchases.length:0,
        expenses:Array.isArray(vault.expenses)?vault.expenses.length:0,
        inventoryMovements:Array.isArray(vault.inventoryMovements)?vault.inventoryMovements.length:0,
        documentEvents:Array.isArray(vault.documentEvents)?vault.documentEvents.length:0,
        payments:Array.isArray(vault.payments)?vault.payments.length:0,
        savedItems:Array.isArray(vault.savedItems)?vault.savedItems.length:0
      },
      strings:scan,
      currentAttachments,
      revisionAttachments,
      assets:{currentCompanyDataUrlChars:currentCompanyAssetChars,documentSnapshotDataUrlChars:documentSnapshotAssetChars,revisionSnapshotDataUrlChars:revisionSnapshotAssetChars}
    };
    localStorage.setItem(VAULT_BREAKDOWN_KEY,JSON.stringify(payload));
  }catch{}
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function deriveKey(pin: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  validateKdf(iterations, salt);
  const base = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<{ iv: string; cipher: string }> {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource);
  return { iv: bytesToB64(iv), cipher: bytesToB64(new Uint8Array(cipher)) };
}

async function decryptBytes(key: CryptoKey, ivB64: string, cipherB64: string): Promise<Uint8Array> {
  const iv = b64ToBytes(ivB64);
  const cipher = b64ToBytes(cipherB64);
  if (iv.byteLength !== GCM_IV_BYTES || cipher.byteLength < 16) throw new Error('Invalid encrypted data.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource }, key,
    cipher as BufferSource
  );
  return new Uint8Array(plain);
}

export async function createSecurity(pin: string): Promise<{ metadata: SecurityMetadata; key: CryptoKey }> {
  const legacyPin=/^\d{4,12}$/.test(pin);
  const accountSecret=ACCOUNT_SECRET_PATTERN.test(pin);
  if (!legacyPin&&!accountSecret) throw new Error('PIN must contain 4–12 digits.');
  const salt = randomBytes(24);
  const key = await deriveKey(pin, salt);
  const verification = await encryptBytes(key, encoder.encode(VERIFY_TEXT));
  return {
    metadata: { id: 'security', version: 1, iterations: KDF_ITERATIONS, salt: bytesToB64(salt), verifierIv: verification.iv, verifierCipher: verification.cipher },
    key
  };
}

export async function verifyPin(pin: string, metadata: SecurityMetadata): Promise<CryptoKey> {
  const started=nowTick();
  try {
    const salt = b64ToBytes(metadata.salt);
    const key = await deriveKey(pin, salt, metadata.iterations);
    const plain = await decryptBytes(key, metadata.verifierIv, metadata.verifierCipher);
    if (decoder.decode(plain) !== VERIFY_TEXT) throw new Error('Wrong PIN');
    diag('pin-verify-success',`durationMs=${elapsedMs(started)}`);
    return key;
  } catch (error) {
    diag('pin-verify-error',`name=${errorName(error)} durationMs=${elapsedMs(started)}`);
    throw new Error('Wrong PIN');
  }
}

export async function encryptVault(key: CryptoKey, vault: VaultPayload): Promise<EncryptedVaultRecord> {
  const started=nowTick();
  try{
    const restore=compactCompanySnapshotAssets(vault);
    let serialized='';
    try{
      recordVaultPayloadBreakdown(vault);
      serialized=JSON.stringify(vault);
    }finally{restore();}
    const payload=await encryptBytes(key,encoder.encode(serialized));
    const duration=elapsedMs(started),now=Date.now();
    if(duration>=350||now-lastVaultSaveDiagnosticAt>=SAVE_DIAG_INTERVAL_MS){lastVaultSaveDiagnosticAt=now;diag('vault-encrypt-success',`durationMs=${duration} serializedChars=${serialized.length} cipherChars=${payload.cipher.length}`);}
    return { id: 'vault', schemaVersion: vault.schemaVersion, iv: payload.iv, cipher: payload.cipher, updatedAt: new Date().toISOString() };
  }catch(error){
    diag('vault-encrypt-error',`name=${errorName(error)} durationMs=${elapsedMs(started)}`);
    throw error;
  }
}

export async function decryptVault(key: CryptoKey, record: EncryptedVaultRecord): Promise<VaultPayload> {
  const started=nowTick();
  try{
    const plain=await decryptBytes(key,record.iv,record.cipher);
    const vault=JSON.parse(decoder.decode(plain)) as VaultPayload;
    if(record.schemaVersion===APP_SCHEMA_VERSION)recordVaultPayloadBreakdown(vault,true);
    const hydrated=hydrateCompanySnapshotAssets(vault);
    diag('vault-decrypt-success',`durationMs=${elapsedMs(started)} cipherChars=${record.cipher.length} schema=${record.schemaVersion}`);
    return hydrated;
  }catch(error){
    diag('vault-decrypt-error',`name=${errorName(error)} durationMs=${elapsedMs(started)} cipherChars=${record.cipher?.length||0} schema=${record.schemaVersion}`);
    throw error;
  }
}

export async function createEncryptedBackup(pin: string, vault: VaultPayload): Promise<EncryptedBackupFile> {
  if (!pin) throw new Error('PIN is required to encrypt the backup.');
  const started=nowTick();
  try{
    const salt=randomBytes(24),iterations=KDF_ITERATIONS,key=await deriveKey(pin,salt,iterations);
    const restore=compactCompanySnapshotAssets(vault);
    let serialized='';
    try{serialized=JSON.stringify(vault);}finally{restore();}
    const encrypted=await encryptBytes(key,encoder.encode(serialized));
    diag('backup-encrypt-success',`durationMs=${elapsedMs(started)} serializedChars=${serialized.length}`);
    return {
      format: 'LOUREX_BACKUP', version: 1, createdAt: new Date().toISOString(),
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToB64(salt) },
      cipher: { name: 'AES-GCM', iv: encrypted.iv, data: encrypted.cipher }
    };
  }catch(error){diag('backup-encrypt-error',`name=${errorName(error)} durationMs=${elapsedMs(started)}`);throw error;}
}

export async function decryptBackup(pin: string, file: EncryptedBackupFile): Promise<VaultPayload> {
  if (
    file.format !== 'LOUREX_BACKUP' || file.version !== 1 ||
    file.kdf?.name !== 'PBKDF2' || file.kdf?.hash !== 'SHA-256' ||
    file.cipher?.name !== 'AES-GCM'
  ) throw new Error('Invalid LOUREX backup file.');
  const started=nowTick();
  try {
    const salt = b64ToBytes(file.kdf.salt);
    const key = await deriveKey(pin, salt, file.kdf.iterations);
    const plain = await decryptBytes(key, file.cipher.iv, file.cipher.data);
    const vault=JSON.parse(decoder.decode(plain)) as VaultPayload;
    const hydrated=hydrateCompanySnapshotAssets(vault);
    diag('backup-decrypt-success',`durationMs=${elapsedMs(started)} cipherChars=${file.cipher.data.length}`);
    return hydrated;
  } catch (error) {
    diag('backup-decrypt-error',`name=${errorName(error)} durationMs=${elapsedMs(started)}`);
    throw new Error('Backup password/PIN is incorrect or the file is corrupted.');
  }
}
