import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('PWA update flow notifies existing installations only after controller replacement',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/showUpdateNotice/);
  assert.match(entry,/data-lourex-update/);
  assert.match(entry,/controllerchange/);
  assert.match(entry,/hadController/);
  assert.match(entry,/registration\.update\(\)/);
  assert.match(entry,/window\.location\.reload\(\)/);
});

test('recovery boundary exposes privacy-safe diagnostics without invoice payload fields',async()=>{
  const boundary=await read('src/app/AppErrorBoundary.tsx');
  assert.match(boundary,/Copy diagnostics/);
  assert.match(boundary,/userAgent=/);
  assert.match(boundary,/serviceWorker=/);
  assert.match(boundary,/navigator\.clipboard/);
  assert.doesNotMatch(boundary,/customerSnapshot|companySnapshot|items|bank|iban|taxNumber/);
});

test('production config enables conservative browser hardening headers without a brittle CSP',async()=>{
  const config=await read('vercel.json');
  assert.match(config,/X-Content-Type-Options/);
  assert.match(config,/X-Frame-Options/);
  assert.match(config,/Referrer-Policy/);
  assert.match(config,/Permissions-Policy/);
  assert.doesNotMatch(config,/Content-Security-Policy/);
});

test('v55 service worker ships the recovery and update entry modules offline',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v55/);
  assert.match(sw,/src\/app\/index\.js/);
  assert.match(sw,/src\/app\/AppErrorBoundary\.js/);
});
