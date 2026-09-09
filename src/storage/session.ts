import type { AutoLockMinutes, SessionKeyRecord } from '../types.js';
import { deleteRecord, getRecord, putRecord } from './db.js';

const SESSION_STORAGE_KEY = 'lourex-invoice-session-v1';
const ACTIVE_ACCOUNT_UID_KEY = 'lourex-invoice-active-account-v1';
const ACCOUNT_TOKEN_PREFIX = 'acct:';

interface SessionMarker {
  token: string;
  lastActivity: number;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function parseMarker(raw: string | null): SessionMarker | null {
  if (!raw) return null;
  try {
    const marker = JSON.parse(raw) as SessionMarker;
    if (!marker?.token || !Number.isFinite(marker.lastActivity)) return null;
    return marker;
  } catch {
    return null;
  }
}

function readMarker(): SessionMarker | null {
  try {
    const persistent = parseMarker(localStorage.getItem(SESSION_STORAGE_KEY));
    if (persistent) return persistent;
    const legacy = parseMarker(sessionStorage.getItem(SESSION_STORAGE_KEY));
    if (legacy) {
      try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacy)); } catch { /* best effort */ }
      try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* best effort */ }
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

function writeMarker(marker: SessionMarker): void {
  try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(marker)); } catch { /* persistence is best effort */ }
  try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* legacy cleanup is best effort */ }
}

function removeMarker():void{
  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* no-op */ }
  try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* no-op */ }
}

function accountPrefix(uid:string):string{return `${ACCOUNT_TOKEN_PREFIX}${uid}:`;}
function isAccountBoundToken(token:string):boolean{return token.startsWith(ACCOUNT_TOKEN_PREFIX)&&token.indexOf(':',ACCOUNT_TOKEN_PREFIX.length)>ACCOUNT_TOKEN_PREFIX.length;}

export function setActiveAccountUid(uid:string|null):void{
  try{
    if(uid)localStorage.setItem(ACTIVE_ACCOUNT_UID_KEY,uid);
    else localStorage.removeItem(ACTIVE_ACCOUNT_UID_KEY);
  }catch{}
}

export function getActiveAccountUid():string{
  try{return localStorage.getItem(ACTIVE_ACCOUNT_UID_KEY)||'';}catch{return '';}
}

export function isSessionExpired(lastActivity: number, autoLockMinutes: AutoLockMinutes, now = Date.now()): boolean {
  return autoLockMinutes > 0 && now - lastActivity >= autoLockMinutes * 60_000;
}

export function isCurrentSessionExpired(autoLockMinutes: AutoLockMinutes, now = Date.now()): boolean {
  const marker = readMarker();
  return !marker || isSessionExpired(marker.lastActivity, autoLockMinutes, now);
}

export async function establishSession(key: CryptoKey): Promise<boolean> {
  const uid=getActiveAccountUid();
  const token = uid ? `${accountPrefix(uid)}${randomToken()}` : randomToken();
  const marker: SessionMarker = { token, lastActivity: Date.now() };
  try {
    const record: SessionKeyRecord = { id: 'session-key', token, key, updatedAt: new Date().toISOString() };
    await putRecord(record);
    writeMarker(marker);
    return true;
  } catch {
    removeMarker();
    return false;
  }
}

export async function resumeAccountSession(uid:string):Promise<boolean>{
  if(!uid)return false;
  setActiveAccountUid(uid);
  try{
    const record=await getRecord<SessionKeyRecord>('session-key');
    if(!record?.key||!record.token.startsWith(accountPrefix(uid)))return false;
    writeMarker({token:record.token,lastActivity:Date.now()});
    return true;
  }catch{return false;}
}

export function touchSession(now = Date.now()): void {
  const marker = readMarker();
  if (!marker) return;
  marker.lastActivity = now;
  writeMarker(marker);
}

export async function getSessionKey(): Promise<{ key: CryptoKey; lastActivity: number } | null> {
  const marker = readMarker();
  if (!marker) {
    try {
      const record=await getRecord<SessionKeyRecord>('session-key');
      if(record&&!isAccountBoundToken(record.token))await deleteRecord('session-key');
    } catch { /* stale key cleanup is best effort */ }
    return null;
  }
  try {
    const record = await getRecord<SessionKeyRecord>('session-key');
    if (!record || record.token !== marker.token || !record.key) return null;
    return { key: record.key, lastActivity: marker.lastActivity };
  } catch {
    return null;
  }
}

// Account sign-out should close the workspace immediately without destroying the
// device-bound vault key. The key remains unusable by the app while signed out
// and is resumed only when the same Firebase UID authenticates again.
export async function suspendSession():Promise<void>{
  removeMarker();
  try{
    const record=await getRecord<SessionKeyRecord>('session-key');
    if(record&&!isAccountBoundToken(record.token))await deleteRecord('session-key');
  }catch{}
}

// Destructive session clearing remains available for corruption/expiry recovery.
// The encrypted vault and security metadata are never deleted here.
export async function clearSession(): Promise<void> {
  removeMarker();
  try { await deleteRecord('session-key'); } catch { /* no-op */ }
}
