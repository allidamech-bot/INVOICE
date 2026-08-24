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

installIndexedDbFake();
const { emptyVault } = await import('../dist/src/lib/defaults.js');
const { setupVault, unlockVault, saveVault } = await import('../dist/src/storage/vault.js');
const { clearDatabase, hasSecurity, getEncryptedVault } = await import('../dist/src/storage/db.js');

test('encrypted IndexedDB layer persists data across lock/reload-style unlocks', async () => {
  await clearDatabase();
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
