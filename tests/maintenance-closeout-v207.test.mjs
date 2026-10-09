import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current account artwork picker is localized, keyboard-visible and has a 44px hit target',async()=>{
  const [settings,css]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/styles/tailadmin-settings-v320.css')]);
  assert.match(settings,/Replace image','استبدال الصورة/);
  assert.match(settings,/Choose image','اختيار صورة/);
  assert.match(settings,/className="ta-settings-asset-upload"/);
  assert.match(settings,/<input type="file" aria-label=\{chooseText\} disabled=\{this\.state\.busy\|\|this\.state\.cleaningAssets\}/);
  assert.match(settings,/className="ta-settings-asset-trigger" aria-hidden="true"/);
  assert.match(css,/\.ta-settings-asset-upload input\{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none\}/);
  assert.match(css,/\.ta-settings-asset-upload:focus-within\{outline:2px solid var\(--ft-accent\)/);
  assert.match(css,/\.ta-settings-asset-trigger\{grid-column:2;min-height:44px/);
});

test('current account identity and artwork grids preserve responsive RTL-friendly layout',async()=>{
  const [settings,css]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/styles/tailadmin-settings-v320.css')]);
  assert.match(settings,/className="ta-account-logo-grid"/);
  assert.match(settings,/className="ta-settings-artwork-grid"/);
  assert.match(css,/\.ta-account-logo-grid\{display:grid;grid-template-columns:minmax\(280px,\.8fr\) minmax\(0,1\.2fr\);gap:18px/);
  assert.match(css,/\.ta-settings-artwork-grid\{display:grid;grid-template-columns:1fr 1fr;gap:14px/);
  assert.match(css,/@media\(max-width:980px\)[\s\S]*\.ta-account-logo-grid\{grid-template-columns:1fr\}/);
  assert.match(css,/\.ta-settings-shell\.is-account\{grid-template-columns:1fr\}/);
});

test('current purchasing editor keeps actions separate from scrolling fields on mobile',async()=>{
  const [css,visual]=await Promise.all([read('src/styles/tailadmin-operations-v320.css'),read('tests/visual/run-obsidian-financial.cjs')]);
  assert.match(css,/\.ta-ops-editor-scroll\{min-height:0;overflow:auto;padding:16px\}/);
  assert.match(css,/\.ta-ops-editor-actions\{display:flex;justify-content:flex-end;gap:8px;padding:13px 16px;border-top:1px solid var\(--ft-line\);background:var\(--ft-surface\)\}/);
  assert.match(css,/@media\(max-width:1180px\)[\s\S]*position:static;max-height:none/);
  assert.match(css,/@media\(max-width:860px\)[\s\S]*safe-area-inset-bottom/);
  assert.match(css,/@media\(max-width:860px\)[\s\S]*\.ta-ops-editor-head>button\{width:44px;height:44px;min-width:44px;min-height:44px\}/);
  assert.match(visual,/purchase action bar covers editable fields/);
  assert.match(visual,/\.purchase-editor fieldset input/);
});

test('current settings and operations CSS are active screen-only owners and PWA caches startup runtime',async()=>{
  const [settingsCss,operationsCss,index,sw]=await Promise.all([
    read('src/styles/tailadmin-settings-v320.css'),
    read('src/styles/tailadmin-operations-v320.css'),
    read('index.html'),
    read('public/sw.js')
  ]);
  assert.match(settingsCss,/@media screen/);
  assert.match(operationsCss,/@media screen/);
  assert.doesNotMatch(settingsCss,/@media print|\.invoice-page/);
  assert.doesNotMatch(operationsCss,/@media print|\.invoice-page/);
  assert.match(index,/\.\/styles\/tailadmin-settings-v320\.css/);
  assert.match(index,/\.\/styles\/tailadmin-operations-v320\.css/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v\d+'/);
  assert.match(sw,/\.\/src\/cloud\/startup\.js/);
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
