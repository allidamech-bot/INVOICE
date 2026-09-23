import type { AutoLockMinutes, SessionKeyRecord } from '../types.js';
import { deleteRecord, getRecord, putRecord } from './db.js';

const SESSION_STORAGE_KEY = 'lourex-invoice-session-v1';
const ACTIVE_ACCOUNT_UID_KEY = 'lourex-invoice-active-account-v1';
const ACCOUNT_TOKEN_PREFIX = 'acct:';

// Authorization is runtime-local, but a fresh runtime may resume the protected
// session only when the persisted marker and the account-scoped non-extractable
// CryptoKey record agree exactly. The raw PIN is never persisted.
let runtimePinAuthorized=false;

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
function tokenMatchesAccount(token:string,uid:string):boolean{return token.startsWith(accountPrefix(uid));}

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

function normalizeAutoLockMinutes(value:number):AutoLockMinutes{
  return value===5||value===15||value===30?value:0;
}

export function isCurrentSessionExpired(autoLockMinutes: number, now = Date.now()): boolean {
  if(!runtimePinAuthorized)return true;
  const marker = readMarker();
  return !marker || isSessionExpired(marker.lastActivity, normalizeAutoLockMinutes(autoLockMinutes), now);
}

export async function establishSession(key: CryptoKey): Promise<boolean> {
  const uid=getActiveAccountUid();
  const token = uid ? `${accountPrefix(uid)}${randomToken()}` : randomToken();
  const marker: SessionMarker = { token, lastActivity: Date.now() };
  try {
    const record: SessionKeyRecord = { id: 'session-key', token, key, updatedAt: new Date().toISOString() };
    await putRecord(record);
    writeMarker(marker);
    runtimePinAuthorized=true;
    return true;
  } catch {
    runtimePinAuthorized=false;
    removeMarker();
    return false;
  }
}

export async function resumeAccountSession(uid:string):Promise<boolean>{
  runtimePinAuthorized=false;
  if(!uid)return false;
  setActiveAccountUid(uid);

  const marker=readMarker();
  if(!marker||!tokenMatchesAccount(marker.token,uid)){
    await suspendSession();
    return false;
  }

  try{
    const record=await getRecord<SessionKeyRecord>('session-key');
    if(!record||!record.key||record.token!==marker.token||!tokenMatchesAccount(record.token,uid)){
      await suspendSession();
      return false;
    }
    runtimePinAuthorized=true;
    return true;
  }catch{
    await suspendSession();
    return false;
  }
}

export function touchSession(now = Date.now()): void {
  if(!runtimePinAuthorized)return;
  const marker = readMarker();
  if (!marker) return;
  marker.lastActivity = now;
  writeMarker(marker);
}

export async function getSessionKey(): Promise<{ key: CryptoKey; lastActivity: number } | null> {
  if(!runtimePinAuthorized)return null;
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
    const uid=getActiveAccountUid();
    if(uid&&(!tokenMatchesAccount(marker.token,uid)||!tokenMatchesAccount(record.token,uid))){
      await suspendSession();
      return null;
    }
    return { key: record.key, lastActivity: marker.lastActivity };
  } catch {
    return null;
  }
}

// Signing out or manually locking is a hard local security boundary. The
// encrypted vault and metadata stay on the device, but the usable CryptoKey is removed.
export async function suspendSession():Promise<void>{
  runtimePinAuthorized=false;
  removeMarker();
  try { await deleteRecord('session-key'); } catch { /* no-op */ }
}

// Destructive session clearing remains available for corruption/expiry recovery.
// The encrypted vault and security metadata are never deleted here.
export async function clearSession(): Promise<void> {
  runtimePinAuthorized=false;
  removeMarker();
  try { await deleteRecord('session-key'); } catch { /* no-op */ }
}
