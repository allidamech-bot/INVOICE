import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v339 runtime safety blocks account/settings sign-out before reload handlers when work is unsafe',async()=>{
  const [html,guard,entry,cloud]=await Promise.all([
    read('index.html'),
    read('public/runtime-safety-v334.js'),
    read('public/document-entry-v302.js'),
    read('src/components/CloudAccountModal.tsx')
  ]);
  const guardAt=html.indexOf('runtime-safety-v334.js?v=334');
  const entryAt=html.indexOf('document-entry-v302.js?v=337-3');
  assert.ok(guardAt>=0&&entryAt>guardAt,'runtime safety must register before the legacy sign-out boundary');
  assert.match(guard,/const SIGNOUT_BUTTON='\.settings-direct-signout-button,\.settings-signout-button,\.ta-cloud-account-actions button'/);
  assert.match(guard,/function signOutUnsafeWorkspaceOpen\(\)/);
  assert.match(guard,/if\(!\(button instanceof HTMLButtonElement\)\|\|button\.disabled\|\|!signOutUnsafeWorkspaceOpen\(\)\)return/);
  assert.match(guard,/event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\);\s*explainBlockedSignOut\(button\)/);
  assert.match(guard,/data-lourex-document-editor/);
  assert.match(guard,/data-lourex-workspace-dirty/);
  assert.match(guard,/manualInventoryDraftOpen\(\)/);
  const signOutGuard=guard.slice(guard.indexOf('function signOutUnsafeWorkspaceOpen'),guard.indexOf('function explainDeferred'));
  assert.doesNotMatch(signOutGuard,/modal-backdrop/,'the account modal must not block its own sign-out when no editable work is open');
  assert.match(entry,/window\.location\.replace\(window\.location\.href\)/);
  assert.match(cloud,/window\.location\.reload\(\)/);
});

test('v339 blocked account sign-out gives visible feedback inside the account surface',async()=>{
  const guard=await read('public/runtime-safety-v334.js');
  assert.match(guard,/data-lourex-signout-deferred/);
  assert.match(guard,/Save and close the current document or data-entry workspace before signing out\./);
  assert.match(guard,/احفظ وأغلق المستند أو مساحة الإدخال الحالية قبل تسجيل الخروج\./);
});