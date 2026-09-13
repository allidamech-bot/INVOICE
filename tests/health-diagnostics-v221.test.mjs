import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const health=await readFile(new URL('../public/health.html',import.meta.url),'utf8');
const healthScript=await readFile(new URL('../public/health.js',import.meta.url),'utf8');

test('health diagnostics bound every browser probe and always render a final report',()=>{
  assert.match(health,/<script src="\.\/health\.js" defer><\/script>/);
  assert.doesNotMatch(health,/<script>(?!\s*<\/script>)/);
  assert.match(healthScript,/const PROBE_TIMEOUT_MS=1800,HEALTH_DEADLINE_MS=8000/);
  assert.match(healthScript,/const withTimeout=/);
  assert.match(healthScript,/withTimeout\(navigator\.serviceWorker\.getRegistration\(\),'Service worker check'\)/);
  assert.match(healthScript,/withTimeout\(caches\.keys\(\),'Cache storage check'\)/);
  assert.match(healthScript,/withTimeout\(navigator\.storage\.estimate\(\),'Browser storage estimate'\)/);
  assert.match(healthScript,/withTimeout\(indexedDB\.databases\(\),'IndexedDB enumeration'\)/);
  assert.match(healthScript,/finally\{finished=true;render\(\);\}/);
  assert.match(healthScript,/Diagnostic deadline reached/);
});

test('health diagnostics recognize current scoped databases without opening or reading them',()=>{
  assert.match(healthScript,/PUBLIC_DB_NAME='lourex-invoice-public'/);
  assert.match(healthScript,/ACCOUNT_DB_PREFIX='lourex-invoice-account-'/);
  assert.match(healthScript,/names\.filter\(name=>name\.startsWith\(ACCOUNT_DB_PREFIX\)\)/);
  assert.doesNotMatch(healthScript,/indexedDB\.open\(/);
  assert.doesNotMatch(healthScript,/transaction\('records'/);
  assert.doesNotMatch(healthScript,/cloud-account|safety-snapshot/);
});

test('health report describes privacy-safe scoped storage only',()=>{
  assert.match(health,/never opens, decrypts or prints business data/i);
  assert.match(healthScript,/Encrypted local storage/);
  assert.doesNotMatch(healthScript,/Encrypted vault.*Present/);
});
