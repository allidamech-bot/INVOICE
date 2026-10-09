import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current artwork picker retains localized accessible file input and keyboard focus',async()=>{
  const [settings,css]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/styles/tailadmin-settings-v320.css')]);
  assert.match(settings,/Replace image','استبدال الصورة/);
  assert.match(settings,/Choose image','اختيار صورة/);
  assert.match(settings,/className="ta-settings-asset-upload"/);
  assert.match(settings,/<input type="file" aria-label=\{chooseText\} disabled=\{this\.state\.busy\|\|this\.state\.cleaningAssets\}/);
  assert.match(settings,/className="ta-settings-asset-trigger" aria-hidden="true"/);
  assert.match(css,/\.ta-settings-asset-upload input\{[^}]*position:absolute[^}]*opacity:0/);
  assert.match(css,/\.ta-settings-asset-upload:focus-within\{[^}]*outline:2px/);
});

test('current account logo and identity have responsive independent layout owners',async()=>{
  const css=await read('src/styles/tailadmin-settings-v320.css');
  assert.match(css,/\.ta-account-logo-grid\{display:grid;[^}]*gap:18px/);
  assert.match(css,/\.ta-account-summary\{[^}]*background:var\(--ft-surface-2\)/);
  assert.match(css,/@media\(max-width:980px\)[^{]*\{[^}]*\.ta-account-logo-grid\{grid-template-columns:1fr\}/);
});

test('current mobile purchasing actions do not overlay editable fields',async()=>{
  const [css,visual]=await Promise.all([read('src/styles/tailadmin-operations-v320.css'),read('tests/visual/run-obsidian-financial.cjs')]);
  assert.match(css,/\.ta-ops-editor-scroll\{min-height:0;overflow:auto/);
  assert.match(css,/\.ta-ops-editor-actions\{display:flex;[^}]*padding:13px 16px/);
  assert.match(css,/@media\(max-width:1180px\)[^{]*\{[^}]*:is\(\.ta-ops-editor,\.ta-ops-editor-card\)\{position:static;max-height:none\}/);
  assert.match(visual,/purchase action bar covers editable fields/);
  assert.match(visual,/\.purchase-editor fieldset input/);
});

test('current app-only account and purchasing owners do not change A4 printing',async()=>{
  const [settings,ops,index,patch]=await Promise.all([read('src/styles/tailadmin-settings-v320.css'),read('src/styles/tailadmin-operations-v320.css'),read('index.html'),read('scripts/pwa-cache-v205.mjs')]);
  for(const css of [settings,ops]){
    assert.match(css,/@media screen/);
    assert.doesNotMatch(css,/@media print/);
  }
  const settingsLayer='./styles/tailadmin-settings-v320.css',opsLayer='./styles/tailadmin-operations-v320.css';
  const print='./styles/document-premium-redesign-v141.css';
  assert.ok(index.includes(settingsLayer)&&index.includes(opsLayer)&&index.includes(print));
  assert.match(patch,/const CACHE = 'lourex-invoice-v225'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v224'.*legacy marker/);
});

test('v207 reacts to account sign-out without a permanent high-frequency polling loop',async()=>{
  const [index,cloud]=await Promise.all([read('src/app/index.tsx'),read('src/cloud/firebase.ts')]);
  assert.match(cloud,/export function subscribeCloudUser/);
  assert.match(cloud,/auth\(\)\.onAuthStateChanged/);
  assert.match(index,/const handleAuthChange=\(user:ReturnType<typeof currentCloudUser>\):void=>\{/);
  assert.match(index,/subscribeCloudUser\(handleAuthChange\)/);
  assert.match(index,/AUTH_RESTORATION_GRACE_MS=2500/);
  assert.match(index,/clearPendingAuthLoss\(\)/);
  assert.doesNotMatch(index,/setInterval/);
});

test('v207 Firebase password guidance uses the shared account policy',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/import \{ MIN_ACCOUNT_PASSWORD_LENGTH \} from '\.\.\/lib\/account-security\.js'/);
  assert.match(cloud,/at least \$\{MIN_ACCOUNT_PASSWORD_LENGTH\} characters/);
  assert.doesNotMatch(cloud,/at least 6 characters/);
});
