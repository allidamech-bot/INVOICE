import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('cloud sync never blindly overwrites changes from another device', async () => {
  const cloud = await read('src/cloud/firebase.ts');
  assert.match(cloud, /readSyncAnchor/);
  assert.match(cloud, /writeSyncAnchor/);
  assert.match(cloud, /remoteChanged/);
  assert.match(cloud, /Nothing was overwritten/);
  assert.match(cloud, /prevented from overwriting them/);
});

test('cloud restore snapshots local encrypted data before replacement', async () => {
  const cloud = await read('src/cloud/firebase.ts');
  const install = cloud.indexOf('export async function installCloudVault');
  const snapshot = cloud.indexOf("createSafetySnapshot('pre-restore')", install);
  const replace = cloud.indexOf('putSecurityAndVault(remote.security,remote.vault)', install);
  assert.ok(install >= 0);
  assert.ok(snapshot > install);
  assert.ok(replace > snapshot);
});

test('previous cloud revisions are retained before a new revision becomes current', async () => {
  const cloud = await read('src/cloud/firebase.ts');
  assert.match(cloud, /historyCollection/);
  assert.match(cloud, /archivePreviousRevision/);
  assert.match(cloud, /HISTORY_LIMIT=12/);
  assert.match(cloud, /pruneCloudHistory/);
});
