import type { EncryptedBackupFile, EncryptedVaultRecord, SecurityMetadata, VaultPayload } from '../types.js';
import { KDF_ITERATIONS } from '../lib/defaults.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERIFY_TEXT = 'LOUREX-VAULT-VERIFIER-v1';
const ACCOUNT_ACCESS_DOMAIN = 'LOUREX-ACCOUNT-ACCESS-v1';
const MIN_KDF_ITERATIONS = 10_000;
const MAX_KDF_ITERATIONS = 2_000_000;
const MIN_SALT_BYTES = 16;
const MAX_SALT_BYTES = 64;
const GCM_IV_BYTES = 12;

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}
function b64ToBytes(value: string): Uint8Array {
  if (typeof value !== 'string' || !value) throw new Error('Invalid encrypted data.');
  const binary = atob(value); const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
function validateKdf(iterations: number, salt: Uint8Array): void {
  if (!Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS || iterations > MAX_KDF_ITERATIONS) throw new Error('Invalid encryption parameters.');
  if (salt.byteLength < MIN_SALT_BYTES || salt.byteLength > MAX_SALT_BYTES) throw new Error('Invalid encryption parameters.');
}
function accountSecret(uid:string):string {
  const normalized=String(uid||'').trim();
  if(!normalized)throw new Error('Cloud account is required.');
  return `${ACCOUNT_ACCESS_DOMAIN}:${normalized}`;
}
async function accountSalt(uid:string):Promise<Uint8Array>{
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(`${ACCOUNT_ACCESS_DOMAIN}:salt:${String(uid||'').trim()}`));
  return new Uint8Array(digest).slice(0,24);
}
export function randomBytes(length: number): Uint8Array { const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return bytes; }
export async function deriveKey(secret: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  validateKdf(iterations, salt);
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },base,{ name: 'AES-GCM', length: 256 },false,['encrypt', 'decrypt']);
}
async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<{ iv: string; cipher: string }> {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource);
  return { iv: bytesToB64(iv), cipher: bytesToB64(new Uint8Array(cipher)) };
}
async function decryptBytes(key: CryptoKey, ivB64: string, cipherB64: string): Promise<Uint8Array> {
  const iv = b64ToBytes(ivB64); const cipher = b64ToBytes(cipherB64);
  if (iv.byteLength !== GCM_IV_BYTES || cipher.byteLength < 16) throw new Error('Invalid encrypted data.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource);
  return new Uint8Array(plain);
}
async function securityFromSecret(secret:string,salt=randomBytes(24)):Promise<{metadata:SecurityMetadata;key:CryptoKey}> {
  const key=await deriveKey(secret,salt); const verification=await encryptBytes(key,encoder.encode(VERIFY_TEXT));
  return {metadata:{id:'security',version:1,iterations:KDF_ITERATIONS,salt:bytesToB64(salt),verifierIv:verification.iv,verifierCipher:verification.cipher},key};
}
async function keyFromSecret(secret:string,metadata:SecurityMetadata):Promise<CryptoKey> {
  const salt=b64ToBytes(metadata.salt); const key=await deriveKey(secret,salt,metadata.iterations);
  const plain=await decryptBytes(key,metadata.verifierIv,metadata.verifierCipher);
  if(decoder.decode(plain)!==VERIFY_TEXT)throw new Error('Invalid vault key.');
  return key;
}
export async function createSecurity(pin: string): Promise<{ metadata: SecurityMetadata; key: CryptoKey }> {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('PIN must contain 4–12 digits.');
  return securityFromSecret(pin);
}
export async function verifyPin(pin: string, metadata: SecurityMetadata): Promise<CryptoKey> {
  try { return await keyFromSecret(pin,metadata); } catch { throw new Error('Wrong PIN'); }
}

// Account-only access. There is no user PIN. Every authenticated device derives
// the same encryption key for the same Firebase UID; Firestore auth/rules decide
// who is allowed to obtain the encrypted account data.
export async function createAccountSecurity(uid:string):Promise<{metadata:SecurityMetadata;key:CryptoKey}> {
  return securityFromSecret(accountSecret(uid),await accountSalt(uid));
}
export async function verifyAccountAccess(uid:string,metadata:SecurityMetadata):Promise<CryptoKey> {
  try{return await keyFromSecret(accountSecret(uid),metadata);}catch{throw new Error('Unable to open this LOUREX account data.');}
}
export async function encryptVault(key: CryptoKey, vault: VaultPayload): Promise<EncryptedVaultRecord> {
  const payload = await encryptBytes(key, encoder.encode(JSON.stringify(vault)));
  return { id: 'vault', schemaVersion: vault.schemaVersion, iv: payload.iv, cipher: payload.cipher, updatedAt: new Date().toISOString() };
}
export async function decryptVault(key: CryptoKey, record: EncryptedVaultRecord): Promise<VaultPayload> {
  const plain = await decryptBytes(key, record.iv, record.cipher);
  return JSON.parse(decoder.decode(plain)) as VaultPayload;
}
export async function createEncryptedBackup(pin: string, vault: VaultPayload): Promise<EncryptedBackupFile> {
  if (!pin) throw new Error('PIN is required to encrypt the backup.');
  const salt = randomBytes(24); const iterations = KDF_ITERATIONS; const key = await deriveKey(pin, salt, iterations);
  const encrypted = await encryptBytes(key, encoder.encode(JSON.stringify(vault)));
  return {format:'LOUREX_BACKUP',version:1,createdAt:new Date().toISOString(),kdf:{name:'PBKDF2',hash:'SHA-256',iterations,salt:bytesToB64(salt)},cipher:{name:'AES-GCM',iv:encrypted.iv,data:encrypted.cipher}};
}
export async function decryptBackup(pin: string, file: EncryptedBackupFile): Promise<VaultPayload> {
  if (file.format !== 'LOUREX_BACKUP' || file.version !== 1 || file.kdf?.name !== 'PBKDF2' || file.kdf?.hash !== 'SHA-256' || file.cipher?.name !== 'AES-GCM') throw new Error('Invalid LOUREX backup file.');
  try { const salt=b64ToBytes(file.kdf.salt); const key=await deriveKey(pin,salt,file.kdf.iterations); const plain=await decryptBytes(key,file.cipher.iv,file.cipher.data); return JSON.parse(decoder.decode(plain)) as VaultPayload; }
  catch { throw new Error('Backup password/PIN is incorrect or the file is corrupted.'); }
}
