import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Firebase owns active sign-in and no active route renders legacy device-PIN screens',async()=>{
  const [app,entry,settings]=await Promise.all([
    read('src/app/App.tsx'),
    read('src/app/index.tsx'),
    read('src/components/SettingsModal.tsx')
  ]);
  assert.match(app,/AccountEntryScreen/);
  assert.match(entry,/registerWorkspaceSessionReader/);
  assert.doesNotMatch(app,/<AuthScreenSelector|<SetupScreen|<UnlockScreen|unlockVault\(/);
  assert.doesNotMatch(entry,/<AuthScreenSelector|<SetupScreen|<UnlockScreen|unlockVault\(/);
  assert.doesNotMatch(settings,/Change PIN|Create PIN|Confirm PIN|Device PIN|Auto Lock/);
  assert.match(settings,/Sign in using Google or your email and password/);
});

test('current user-facing guidance describes Firebase V2 storage, not historical encrypted-vault login',async()=>{
  const paths=[
    'src/components/UsageGuide.tsx',
    'src/components/ProductInfoModal.tsx',
    'src/components/WorkspaceBranchSettings.tsx',
    'src/components/NotificationCenterLive.tsx',
    'src/components/Customer360LivePanel.tsx',
    'src/components/Supplier360LivePanel.tsx'
  ];
  for(const path of paths){
    const content=await read(path);
    assert.doesNotMatch(content,/\bPIN\b|encrypted vault|الخزنة المشفرة|قفل الخزنة المشفرة/i,path+' must not display legacy access instructions');
  }
  const guide=await read('src/components/UsageGuide.tsx');
  assert.match(guide,/Firebase account/);
  assert.match(guide,/not encrypted/);
});

test('public document runtime no longer re-injects device-PIN instructions',async()=>{
  const runtime=await read('public/document-entry-v302.js');
  assert.doesNotMatch(runtime,/normalizeSecurityCopy|The PIN protects|يحمي رمز PIN/);
  assert.match(runtime,/normalizeAuthControls\(\);normalizeCreateMenuKinds\(\);/);
  assert.match(runtime,/function normalizeCreateMenuKinds\(\)/);
});

test('security documentation tells the truth about PIN-free Firebase data and optional plaintext exports',async()=>{
  const guide=await read('README.md');
  assert.match(guide,/Firestore hosts each signed-in user's authoritative/);
  assert.match(guide,/NOT encrypted|not encrypted/);
  assert.match(guide,/Firebase Authentication/);
  assert.doesNotMatch(guide,/PIN changes re-encrypt|Firestore stores only the encrypted vault payload/);
});

test('retired device-PIN React screens are not compiled or precached into the live PWA',async()=>{
  const [tsconfig,serviceWorker,app,entry,precache]=await Promise.all([
    read('tsconfig.json'),read('public/sw.js'),
    read('src/app/App.tsx'),read('src/app/index.tsx'),
    read('scripts/pwa-auto-precache.mjs')
  ]);
  const excluded=JSON.parse(tsconfig).exclude||[];
  assert.ok(excluded.includes('src/app/AuthScreenSelector.tsx'));
  assert.ok(excluded.includes('src/components/AuthScreens.tsx'));
  const precacheList=serviceWorker.split('\n').find(line=>line.startsWith('const LOCAL_CORE'))||'';
  assert.doesNotMatch(precacheList,/\.\/src\/(?:app\/AuthScreenSelector|components\/AuthScreens)\.js/);
  assert.match(serviceWorker,/current\.delete\(asset\)/);
  assert.match(serviceWorker,/Promise\.allSettled\(\['\.\/src\/app\/AuthScreenSelector\.js','\.\/src\/components\/AuthScreens\.js'\]/);
  assert.doesNotMatch(app,/import\s+.*(?:AuthScreenSelector|AuthScreens)/);
  assert.doesNotMatch(entry,/import\s+.*(?:AuthScreenSelector|AuthScreens)/);
  // Automatic cache population must follow actual compiled modules; excluded
  // screen modules must not be restored by a second precache owner.
  assert.match(precache,/readdir\('dist\/src',\{recursive:true\}\)/);
});
