import test from 'node:test';
import assert from 'node:assert/strict';

function installIndexedDbFake() {
  let records = new Map();
  let exists = false;
  const makeDb = () => ({
    objectStoreNames: { contains: () => exists },
    createObjectStore: () => { exists = true; return {}; },
    transaction: () => {
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null, objectStore: () => ({
        get(id) {
          const req = { result: undefined, error: null, onsuccess: null, onerror: null };
          queueMicrotask(() => { req.result = records.get(id); req.onsuccess?.(); });
          return req;
        },
        put(record) {
          records.set(record.id, structuredClone(record));
          setTimeout(() => tx.oncomplete?.(), 0);
          return {};
        },
        delete(id) {
          records.delete(id);
          setTimeout(() => tx.oncomplete?.(), 0);
          return {};
        }
      })};
      return tx;
    },
    close() {}
  });
  globalThis.indexedDB = {
    open() {
      const req = { result: makeDb(), error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => { if (!exists) req.onupgradeneeded?.(); req.onsuccess?.(); }, 0);
      return req;
    },
    deleteDatabase() {
      const req = { error: null, onsuccess: null, onerror: null, onblocked: null };
      setTimeout(() => { records = new Map(); exists = false; req.onsuccess?.(); }, 0);
      return req;
    }
  };
}

function makeStorageFake() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    get length() { return values.size; }
  };
}

installIndexedDbFake();
globalThis.sessionStorage = makeStorageFake();
globalThis.localStorage = makeStorageFake();
const { emptyVault } = await import('../dist/src/lib/defaults.js');
const { setupVault, unlockVault, saveVault, resumeVaultSession } = await import('../dist/src/storage/vault.js');
const { clearDatabase, hasSecurity, getEncryptedVault } = await import('../dist/src/storage/db.js');
const { clearSession, establishSession, getSessionKey, isSessionExpired, touchSession } = await import('../dist/src/storage/session.js');

test('encrypted IndexedDB layer persists data across lock/reload-style unlocks', async () => {
  await clearDatabase();
  sessionStorage.clear();
  localStorage.clear();
  assert.equal(await hasSecurity(), false);
  const initial = emptyVault();
  const setup = await setupVault('2468', initial);
  assert.equal(await hasSecurity(), true);
  const next = structuredClone(setup.vault);
  next.customers.push({
    id:'cust-persist',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),companyNameEn:'ABC Trading Company',companyNameAr:'',contactPerson:'',addressEn:'Riyadh',addressAr:'',city:'Riyadh',country:'Saudi Arabia',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',notes:''
  });
  await saveVault(setup.key, next);
  const raw = await getEncryptedVault();
  assert.ok(raw?.cipher);
  assert.ok(!raw.cipher.includes('ABC Trading Company'));
  const reopened = await unlockVault('2468');
  assert.equal(reopened.vault.customers.length, 1);
  assert.equal(reopened.vault.customers[0].companyNameEn, 'ABC Trading Company');
  await assert.rejects(() => unlockVault('1111'), /Wrong PIN/);
  await clearDatabase();
  assert.equal(await hasSecurity(), false);
});

test('trusted device session resumes the encrypted vault across browser sessions', async () => {
  await clearDatabase();
  sessionStorage.clear();
  localStorage.clear();
  const setup = await setupVault('8642', emptyVault());
  const next = structuredClone(setup.vault);
  next.company.nameEn = 'LOUREX TEST';
  await saveVault(setup.key, next);
  assert.equal(await establishSession(setup.key), true);
  assert.ok(localStorage.getItem('lourex-invoice-session-v1'));
  assert.equal(sessionStorage.getItem('lourex-invoice-session-v1'), null);
  assert.ok((await getSessionKey())?.key);
  const resumed = await resumeVaultSession();
  assert.ok(resumed);
  assert.equal(resumed.vault.company.nameEn, 'LOUREX TEST');
  assert.equal(resumed.vault.appSettings.autoLockMinutes, 0);
  touchSession(10_000);
  assert.equal(isSessionExpired(10_000, 0, 10_000 + 365 * 24 * 60 * 60_000), false);
  assert.equal(isSessionExpired(10_000, 15, 10_000 + 14 * 60_000), false);
  assert.equal(isSessionExpired(10_000, 15, 10_000 + 15 * 60_000), true);
  await clearSession();
  assert.equal(localStorage.getItem('lourex-invoice-session-v1'), null);
  assert.equal(await resumeVaultSession(), null);
  await clearDatabase();
});
