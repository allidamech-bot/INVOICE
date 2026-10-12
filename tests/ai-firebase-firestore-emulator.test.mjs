import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, collection, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, runTransaction,
} from 'firebase/firestore';
import { mergeAssistantCloudThread } from '../dist/src/cloud/assistant-history.js';

// Firestore requests must NEVER reach real projects or billing accounts.
if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !/^(127\.0\.0\.1|localhost):[0-9]+$/.test(process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error('Firestore emulator is required. Refusing to access real Firebase.');
}
const projectId = 'demo-lourex-ai-integration-719';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules, host: '127.0.0.1', port: 8080 },
});
after(async () => { await env.cleanup(); });

const alice = env.authenticatedContext('account-a').firestore();
const aliceSecondDevice = env.authenticatedContext('account-a').firestore();
const bob = env.authenticatedContext('account-b').firestore();
const guest = env.unauthenticatedContext().firestore();
const clock = '2026-10-12T12:00:00.000Z';
function message(id, text, offsetMinutes = 0) {
  return {
    id, role: 'user', text,
    createdAt: new Date(Date.parse(clock) + offsetMinutes * 60_000).toISOString(),
  };
}
function thread(id, messages = [], options = {}) {
  return {
    format: 'LOUREX_AI_THREAD_V1', ownerUid: 'account-a', id,
    scope: 'business', workspaceId: 'company-main', branchId: 'main',
    title: 'Supplier discussion', summary: '', mode: 'advisor',
    messages, createdAt: clock, updatedAt: clock, ...options,
  };
}
const ref = (db, uid, id) => doc(db, 'users', uid, 'assistantHistory', id);

// Exercise Firestore SDK transactions with the production merge function.
// The application uses the compat SDK wrapper; this test verifies real Firestore
// transaction/rule behavior separately, not the browser's IndexedDB lifecycle.
async function publish(db, uid, candidate) {
  return runTransaction(db, async (tx) => {
    const target = ref(db, uid, candidate.id);
    const snapshot = await tx.get(target);
    const previous = snapshot.exists() ? snapshot.data() : null;
    if (previous?.deletedAt && !candidate.deletedAt) {
      throw new Error('This conversation was deleted on another device; stale write rejected.');
    }
    const merged = previous ? mergeAssistantCloudThread(candidate, previous) : candidate;
    tx.set(target, merged);
    return merged;
  });
}

test('rules: authenticated owner writes and reads its own history from two device contexts', async () => {
  const data = thread('owner-access', [message('msg1', 'First device')]);
  await assertSucceeds(setDoc(ref(alice, 'account-a', data.id), data));
  const second = await assertSucceeds(getDoc(ref(aliceSecondDevice, 'account-a', data.id)));
  assert.equal(second.exists(), true);
  assert.equal(second.data().messages[0].text, 'First device');
});

test('rules: different signed-in account cannot read, list, overwrite or delete owner history', async () => {
  const target = ref(bob, 'account-a', 'owner-access');
  await assertFails(getDoc(target));
  await assertFails(getDocs(query(collection(bob, 'users', 'account-a', 'assistantHistory'), orderBy('updatedAt', 'desc'))));
  await assertFails(setDoc(target, thread('owner-access', [message('msg2', 'Injected')])));
  await assertFails(deleteDoc(target));
  const retained = await assertSucceeds(getDoc(ref(alice, 'account-a', 'owner-access')));
  assert.equal(retained.data().messages[0].text, 'First device');
});

test('rules: unauthenticated clients cannot read, list or create history', async () => {
  await assertFails(getDoc(ref(guest, 'account-a', 'owner-access')));
  await assertFails(getDocs(collection(guest, 'users', 'account-a', 'assistantHistory')));
  await assertFails(setDoc(ref(guest, 'account-a', 'unauthorized'), thread('unauthorized')));
});

test('rules: authenticated account B can create its own separate history', async () => {
  const own = thread('account-b-thread', [message('b1', 'Only account B')], { ownerUid: 'account-b' });
  await assertSucceeds(setDoc(ref(bob, 'account-b', own.id), own));
  await assertFails(getDoc(ref(alice, 'account-b', own.id)));
  const seen = await assertSucceeds(getDoc(ref(bob, 'account-b', own.id)));
  assert.equal(seen.data().ownerUid, 'account-b');
});

test('transactions: two devices converge different message IDs without overwriting a turn', async () => {
  const id = 'two-device-concurrent';
  const left = thread(id, [message('device-a-msg', 'From A', 1)], { updatedAt: '2026-10-12T12:01:00.000Z' });
  const right = thread(id, [message('device-b-msg', 'From B', 2)], { updatedAt: '2026-10-12T12:02:00.000Z' });
  await Promise.all([
    publish(alice, 'account-a', left),
    publish(aliceSecondDevice, 'account-a', right),
  ]);
  const result = await getDoc(ref(alice, 'account-a', id));
  assert.deepEqual(result.data().messages.map((m) => m.id).sort(), ['device-a-msg', 'device-b-msg']);
});

test('transactions: local stale write cannot resurrect a remote tombstone', async () => {
  const id = 'deleted-between-devices';
  await publish(alice, 'account-a', thread(id, [message('old', 'Past')]));
  const deleted = thread(id, [], {
    title: '', summary: '', mode: 'advisor', workspaceId: '', branchId: '',
    deletedAt: '2026-10-12T13:00:00.000Z',
    createdAt: '2026-10-12T13:00:00.000Z', updatedAt: '2026-10-12T13:00:00.000Z',
  });
  await publish(alice, 'account-a', deleted);
  await assert.rejects(
    publish(aliceSecondDevice, 'account-a', thread(id, [message('stale', 'Should not reappear')])),
    /deleted on another device/i,
  );
  const result = await getDoc(ref(alice, 'account-a', id));
  assert.equal(result.data().deletedAt, '2026-10-12T13:00:00.000Z');
  assert.deepEqual(result.data().messages, []);
});

test('transactions: wrong workspace scope is rejected for an existing thread ID', async () => {
  const id = 'cross-workspace-id';
  await publish(alice, 'account-a', thread(id));
  await assert.rejects(
    publish(aliceSecondDevice, 'account-a', thread(id, [], { workspaceId: 'company-other' })),
    /scope changed/i,
  );
  const stored = await getDoc(ref(alice, 'account-a', id));
  assert.equal(stored.data().workspaceId, 'company-main');
});

test('rules: an authenticated account can list only its own business history', async () => {
  const all = await assertSucceeds(getDocs(collection(alice, 'users', 'account-a', 'assistantHistory')));
  assert.ok(all.size >= 3);
  const fromBob = await assertSucceeds(getDocs(collection(bob, 'users', 'account-b', 'assistantHistory')));
  assert.equal(fromBob.docs.some((d) => d.id === 'owner-access'), false);
});
