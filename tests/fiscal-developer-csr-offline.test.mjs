import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/fiscal/developer-sandbox.mjs',import.meta.url));
const run=mode=>spawnSync(process.execPath,[script,...mode],{encoding:'utf8',timeout:30000,maxBuffer:32768});
test('Developer Portal CSR smoke requires explicit mode, with no network or key generation on invalid args',()=>{
 const missing=run([]);
 assert.equal(missing.status,1);
 assert.match(missing.stderr,/EXPLICIT_SANDBOX_MODE_REQUIRED/);
 assert.doesNotMatch(missing.stdout,/CSR: PASS/);
 const wrong=run(['--live-developer-sandbox','--csr-only']);
 assert.equal(wrong.status,1);
 assert.match(wrong.stderr,/EXPLICIT_SANDBOX_MODE_REQUIRED/);
 assert.doesNotMatch(wrong.stdout,/CSR: PASS/);
});
test('Developer Portal synthetic CSR can be built and verified without a taxpayer or ZATCA traffic',()=>{
 const result=run(['--csr-only']);
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/CSR: PASS \(synthetic, local OpenSSL verification\)/);
 assert.match(result.stdout,/OFFLINE CSR ONLY; no request sent/);
 assert.doesNotMatch(result.stdout,/BEGIN PRIVATE KEY|synthetic-secret|Authorization:|Bearer /);
});
