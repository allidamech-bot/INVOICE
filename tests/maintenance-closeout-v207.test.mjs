import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current artwork picker is localized, accessible and visibly keyboard-focusable',async()=>{
  const [settings,css]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/styles/tailadmin-settings-v320.css')]);
  assert.match(settings,/Replace image','استبدال الصورة/);
  assert.match(settings,/Choose image','اختيار صورة/);
  assert.match(settings,/<label className="ta-settings-asset-upload">/);
  assert.match(settings,/<input type="file" aria-label=\{chooseText\} disabled=\{this\.state\.busy\|\|this\.state\.cleaningAssets\}/);
  assert.match(settings,/accept="image\/png,image\/webp,image\/jpeg"/);
  assert.match(settings,/className="ta-settings-asset-trigger" aria-hidden="true"/);
  assert.match(css,/\.ta-settings-asset-upload input\{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none\}/);
  assert.match(css,/\.ta-settings-asset-upload:focus-within\{outline:2px solid var\(--ft-accent\);outline-offset:3px\}/);
  assert.match(css,/\.ta-settings-asset-trigger\{grid-column:2;min-height:44px/);
});

test('current account identity and artwork remain separate in both reading directions',async()=>{
  const [settings,css]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/styles/tailadmin-settings-v320.css')]);
  assert.match(settings,/className="ta-account-logo-grid"/);
  assert.match(settings,/className="ta-account-summary"/);
  assert.match(settings,/className="ta-settings-artwork-grid"/);
  assert.match(css,/\.ta-account-logo-grid\{display:grid;grid-template-columns:minmax\(280px,\.8fr\) minmax\(0,1\.2fr\);gap:18px/);
  assert.match(css,/\.ta-account-summary\{min-width:0;padding:16px/);
  assert.match(css,/\.ta-settings-artwork-grid\{display:grid;grid-template-columns:1fr 1fr;gap:14px/);
  assert.match(css,/@media\(max-width:980px\)[\s\S]*\.ta-account-logo-grid\{grid-template-columns:1fr\}/);
});

test('current purchase editor keeps controls scrollable above its action row on mobile',async()=>{
  const [css,visual]=await Promise.all([read('src/styles/tailadmin-operations-v320.css'),read('tests/visual/run-obsidian-financial.cjs')]);
  assert.match(css,/\.ta-ops-editor-scroll\{min-height:0;overflow:auto;padding:16px\}/);
  assert.match(css,/\.ta-ops-editor-actions\{display:flex;justify-content:flex-end;gap:8px;padding:13px 16px;border-top:1px solid var\(--ft-line\);background:var\(--ft-surface\)\}/);
  assert.match(visual,/purchase action bar covers editable fields/);
  assert.match(visual,/\.purchase-editor fieldset input/);
});

test('current settings are screen-only, bundled for offline use, and print-isolated',async()=>{
  const [css,index,build,sw]=await Promise.all([read('src/styles/tailadmin-settings-v320.css'),read('index.html'),read('scripts/build.mjs'),read('public/sw.js')]);
  assert.match(css,/@media screen/);
  assert.doesNotMatch(css,/\.invoice-page|\.invoice-pages|@media print/);
  assert.match(index,/href="\.\/styles\/tailadmin-settings-v320\.css/);
  assert.match(index,/href="\.\/styles\/tailadmin-reliability-bridge-v320\.css/);
  assert.match(build,/await writeFile\('dist\/styles\/app\.bundle\.css',appBundleCss\)/);
  assert.match(build,/sw=sw\.replace\(/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v314'/);
});

test('v207 reacts to account sign-out without a permanent high-frequency polling loop',async()=>{
  const [index,cloud]=await Promise.all([read('src/app/index.tsx'),read('src/cloud/firebase.ts')]);
  assert.match(cloud,/export function subscribeCloudUser/);
  assert.match(cloud,/auth\(\)\.onAuthStateChanged/);
  assert.match(index,/subscribeCloudUser\(user=>\{/);
  assert.doesNotMatch(index,/setInterval/);
});

test('v207 Firebase password guidance uses the shared account policy',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/import \{ MIN_ACCOUNT_PASSWORD_LENGTH \} from '\.\.\/lib\/account-security\.js'/);
  assert.match(cloud,/at least \$\{MIN_ACCOUNT_PASSWORD_LENGTH\} characters/);
  assert.doesNotMatch(cloud,/at least 6 characters/);
});
