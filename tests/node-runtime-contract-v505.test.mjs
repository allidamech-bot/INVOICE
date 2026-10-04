import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production runtime targets the supported Vercel Node 24 line', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  assert.equal(packageJson.engines?.node, '24.x');
  assert.match(packageJson.scripts?.build ?? '', /v350-node24-compat\.mjs/);
  assert.doesNotMatch(packageJson.scripts?.build ?? '', /node scripts\/v350-rendering-storage-hardening\.mjs/);
});

test('Node 24 compatibility wrapper normalizes the adaptive runtime anchor before v350', async () => {
  const wrapper = await read('scripts/v350-node24-compat.mjs');
  assert.match(wrapper, /class AdaptiveCloudApp extends BaseApp/);
  assert.match(wrapper, /return\\s\+true;\\s\*\\}\\\)\\\(\\\);/);
  assert.match(wrapper, /expected one adaptive runtime closeout/);
  assert.match(wrapper, /await import\('\.\/v350-rendering-storage-hardening\.mjs'\)/);
});
