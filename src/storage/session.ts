import type { AutoLockMinutes, SessionKeyRecord } from '../types.js';
import { deleteRecord, getRecord, putRecord } from './db.js';

const SESSION_STORAGE_KEY = 'lourex-invoice-session-v1';

interface SessionMarker { token: string; lastActivity: number; }
function randomToken(): string { const bytes = new Uint8Array(24); crypto.getRandomValues(bytes); return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
function parseMarker(raw: string | null): SessionMarker | null { if (!raw) return null; try { const marker = JSON.parse(raw) as SessionMarker; return marker?.token && Number.isFinite(marker.lastActivity) ? marker : null; } catch { return null; } }
function readMarker(): SessionMarker | null {
  try {
    const persistent = parseMarker(localStorage.getItem(SESSION_STORAGE_KEY)); if (persistent) return persistent;
    const legacy = parseMarker(sessionStorage.getItem(SESSION_STORAGE_KEY));
    if (legacy) { try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacy)); } catch {} try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch {} return legacy; }
    return null;
  } catch { return null; }
}
function writeMarker(marker: SessionMarker): void { try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(marker)); } catch {} try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch {} }

// Account-first LOUREX has no local inactivity lock or PIN timeout.
export function isSessionExpired(_lastActivity: number, _autoLockMinutes: AutoLockMinutes, _now = Date.now()): boolean { return false; }
export function isCurrentSessionExpired(_autoLockMinutes: AutoLockMinutes, _now = Date.now()): boolean { return false; }

export async function establishSession(key: CryptoKey): Promise<boolean> {
  const token = randomToken(); const marker: SessionMarker = { token, lastActivity: Date.now() };
  try { const record: SessionKeyRecord = { id: 'session-key', token, key, updatedAt: new Date().toISOString() }; await putRecord(record); writeMarker(marker); return true; }
  catch { try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch {} try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch {} return false; }
}
export function touchSession(now = Date.now()): void { const marker = readMarker(); if (!marker) return; marker.lastActivity = now; writeMarker(marker); }
export async function getSessionKey(): Promise<{ key: CryptoKey; lastActivity: number } | null> {
  const marker = readMarker();
  if (!marker) { try { await deleteRecord('session-key'); } catch {} return null; }
  try { const record = await getRecord<SessionKeyRecord>('session-key'); if (!record || record.token !== marker.token || !record.key) return null; return { key: record.key, lastActivity: marker.lastActivity }; }
  catch { return null; }
}

// Retained for compatibility with older App paths. Cloud refreshes and hidden
// legacy lock calls must not destroy the account key and force a PIN prompt.
export async function clearSession(): Promise<void> { return; }
