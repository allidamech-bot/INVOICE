import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v236 restores a live inactivity timer from the persisted app setting',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/isCurrentSessionExpired/);
  assert.match(entry,/instance\.resetAutoLock=\(\)=>\{/);
  assert.match(entry,/const minutes=Number\(instance\.state\.vault\?\.appSettings\?\.autoLockMinutes\?\?0\)/);
  assert.match(entry,/if\(!instance\.state\.unlocked\|\|minutes<=0\)return/);
  assert.match(entry,/instance\.lockTimer=window\.setTimeout\(\(\)=>\{[\s\S]*void instance\.lockNow\(true\)[\s\S]*\},minutes\*60_000\)/);
});

test('v236 checks persisted inactivity before touching a session on foreground resume',async()=>{
  const entry=await read('src/app/index.tsx');
  const visibility=entry.indexOf('instance.handleVisibilityChange=()=>');
  const expiry=entry.indexOf('isCurrentSessionExpired(minutes)',visibility);
  const delegate=entry.indexOf('handleVisibilityChange();',visibility);
  assert.ok(visibility>=0&&expiry>visibility&&delegate>expiry,'foreground resume must check expiry before BaseApp refreshes activity');
  assert.match(entry,/if\(minutes>0&&isCurrentSessionExpired\(minutes\)\)\{[\s\S]*void instance\.lockNow\(true\);[\s\S]*return;/);
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
