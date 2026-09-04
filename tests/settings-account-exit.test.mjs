import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('settings keeps an explicit close control reachable on mobile',async()=>{
  const ui=await read('src/components/UI.tsx');
  const mobile=await read('src/styles/mobile-modal-v81.css');
  assert.match(ui,/IconButton icon="x" label=\{t\('Close','إغلاق'\)\}/);
  assert.match(mobile,/\.modal-header \.icon-btn/);
  assert.match(mobile,/position: sticky !important/);
  assert.match(mobile,/z-index: 20 !important/);
});

test('security settings exposes cloud account sign out when signed in',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  assert.match(settings,/Sign Out/);
  assert.match(settings,/تسجيل الخروج/);
  assert.match(settings,/onCloudSignOut/);
});
