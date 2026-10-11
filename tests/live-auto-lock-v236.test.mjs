import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('V2 does not install a secondary inactivity PIN timer after Firebase sign-in',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/instance\.resetAutoLock=\(\)=>\{/);
  assert.doesNotMatch(entry,/instance\.lockTimer=window\.setTimeout|instance\.lockNow\(true\)|isCurrentSessionExpired\(/);
  assert.match(entry,/subscribeCloudUser\(handleAuthChange\)/);
});

test('V2 resumes automatic Firebase sync on foreground without relocking account',async()=>{
  const entry=await read('src/app/index.tsx');
  const visibility=entry.slice(entry.indexOf('instance.handleVisibilityChange=()=>'),entry.indexOf('    return true;',entry.indexOf('instance.handleVisibilityChange=()=>')));
  assert.match(visibility,/document\.visibilityState==='visible'/);
  assert.match(visibility,/void instance\.cloudSyncNow\(\)/);
  assert.doesNotMatch(visibility,/lockNow|isCurrentSessionExpired/);
});

test('v236 keeps the session expiry primitive and release refresh wired',async()=>{
  const [session,pwa]=await Promise.all([
    read('src/storage/session.ts'),
    read('scripts/pwa-cache-v205.mjs')
  ]);
  assert.match(session,/return autoLockMinutes > 0 && now - lastActivity >= autoLockMinutes \* 60_000/);
  assert.match(pwa,/v236 restores live inactivity locking and background-resume expiry enforcement/);
  assert.match(pwa,/lourex-invoice-v236: live inactivity lock refresh/);
});
