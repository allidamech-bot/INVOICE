import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const health=await readFile(new URL('../public/health.html',import.meta.url),'utf8');

test('health diagnostics bound every browser probe and always render a final report',()=>{
  assert.match(health,/const PROBE_TIMEOUT_MS=1800/);
  assert.match(health,/const withTimeout=/);
  assert.match(health,/withTimeout\(navigator\.serviceWorker\.getRegistration\(\),'Service worker check'\)/);
  assert.match(health,/withTimeout\(caches\.keys\(\),'Cache storage check'\)/);
  assert.match(health,/withTimeout\(navigator\.storage\.estimate\(\),'Browser storage estimate'\)/);
  assert.match(health,/withTimeout\(indexedDB\.databases\(\),'IndexedDB enumeration'\)/);
  assert.match(health,/finally\{render\(\);\}/);
});

test('health diagnostics recognize current scoped databases without opening or reading them',()=>{
  assert.match(health,/PUBLIC_DB_NAME='lourex-invoice-public'/);
  assert.match(health,/ACCOUNT_DB_PREFIX='lourex-invoice-account-'/);
  assert.match(health,/names\.filter\(name=>name\.startsWith\(ACCOUNT_DB_PREFIX\)\)/);
  assert.doesNotMatch(health,/indexedDB\.open\(/);
  assert.doesNotMatch(health,/transaction\('records'/);
  assert.doesNotMatch(health,/cloud-account|safety-snapshot/);
});

test('health report describes privacy-safe scoped storage only',()=>{
  assert.match(health,/never opens, decrypts or prints business data/i);
  assert.match(health,/Encrypted local storage/);
  assert.doesNotMatch(health,/Encrypted vault.*Present/);
});
