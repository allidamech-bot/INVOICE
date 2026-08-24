import type { EncryptedBackupFile, EncryptedVaultRecord, SecurityMetadata, VaultPayload } from '../types.js';
import { KDF_ITERATIONS } from '../lib/defaults.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERIFY_TEXT = 'LOUREX-VAULT-VERIFIER-v1';

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function deriveKey(pin: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
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
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource);
  return { iv: bytesToB64(iv), cipher: bytesToB64(new Uint8Array(cipher)) };
}

async function decryptBytes(key: CryptoKey, ivB64: string, cipherB64: string): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) as BufferSource },
    key,
    b64ToBytes(cipherB64) as BufferSource
  );
  return new Uint8Array(plain);
}

export async function createSecurity(pin: string): Promise<{ metadata: SecurityMetadata; key: CryptoKey }> {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('PIN must contain 4–12 digits.');
  const salt = randomBytes(24);
  const key = await deriveKey(pin, salt);
  const verification = await encryptBytes(key, encoder.encode(VERIFY_TEXT));
  return {
    metadata: { id: 'security', version: 1, iterations: KDF_ITERATIONS, salt: bytesToB64(salt), verifierIv: verification.iv, verifierCipher: verification.cipher },
    key
  };
}

export async function verifyPin(pin: string, metadata: SecurityMetadata): Promise<CryptoKey> {
  const key = await deriveKey(pin, b64ToBytes(metadata.salt), metadata.iterations);
  try {
    const plain = await decryptBytes(key, metadata.verifierIv, metadata.verifierCipher);
    if (decoder.decode(plain) !== VERIFY_TEXT) throw new Error('Wrong PIN');
    return key;
  } catch {
    throw new Error('Wrong PIN');
  }
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
  const salt = randomBytes(24);
  const iterations = KDF_ITERATIONS;
  const key = await deriveKey(pin, salt, iterations);
  const encrypted = await encryptBytes(key, encoder.encode(JSON.stringify(vault)));
  return {
    format: 'LOUREX_BACKUP', version: 1, createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToB64(salt) },
    cipher: { name: 'AES-GCM', iv: encrypted.iv, data: encrypted.cipher }
  };
}

export async function decryptBackup(pin: string, file: EncryptedBackupFile): Promise<VaultPayload> {
  if (file.format !== 'LOUREX_BACKUP' || file.version !== 1 || file.kdf?.name !== 'PBKDF2' || file.cipher?.name !== 'AES-GCM') throw new Error('Invalid LOUREX backup file.');
  const key = await deriveKey(pin, b64ToBytes(file.kdf.salt), file.kdf.iterations);
  try {
    const plain = await decryptBytes(key, file.cipher.iv, file.cipher.data);
    return JSON.parse(decoder.decode(plain)) as VaultPayload;
  } catch {
    throw new Error('Backup password/PIN is incorrect or the file is corrupted.');
  }
}
