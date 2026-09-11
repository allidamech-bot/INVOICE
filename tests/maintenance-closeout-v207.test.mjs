import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v207 replaces the raw browser file control with one localized accessible artwork picker',async()=>{
  const [settings,css]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/styles/maintenance-closeout-v207.css')]);
  assert.match(settings,/Replace image','استبدال الصورة/);
  assert.match(settings,/Choose image','اختيار صورة/);
  assert.match(settings,/className="asset-file-input" type="file" aria-label=\{chooseText\}/);
  assert.match(settings,/className="asset-file-trigger" aria-hidden="true"/);
  assert.match(css,/\.asset-file-input\{[\s\S]*clip-path:inset\(50%\)!important/);
  assert.match(css,/\.asset-upload-label:focus-within \.asset-file-trigger/);
});

test('v207 separates company identity from artwork controls in both reading directions',async()=>{
  const css=await read('src/styles/maintenance-closeout-v207.css');
  assert.match(css,/\.account-profile-logo-grid\{[\s\S]*display:grid!important[\s\S]*gap:14px!important/);
  assert.match(css,/\.account-profile-summary\{[\s\S]*flex-direction:column!important[\s\S]*gap:6px!important/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.account-profile-logo-grid\{grid-template-columns:minmax\(0,1fr\)!important/);
});

test('v207 purchase actions no longer cover mobile form fields',async()=>{
  const [css,visual]=await Promise.all([read('src/styles/maintenance-closeout-v207.css'),read('tests/visual/run-obsidian-financial.cjs')]);
  assert.match(css,/\.purchase-editor \.operations-editor-actions\{[\s\S]*position:static!important[\s\S]*background:transparent!important/);
  assert.match(visual,/purchase action bar covers editable fields/);
  assert.match(visual,/\.purchase-editor fieldset input/);
});

test('v207 remains app-only, loads last before protected document output, and publishes a fresh PWA generation',async()=>{
  const [css,index,patch]=await Promise.all([read('src/styles/maintenance-closeout-v207.css'),read('index.html'),read('scripts/pwa-cache-v205.mjs')]);
  assert.match(css,/@media screen/);
  assert.doesNotMatch(css,/invoice-page|invoice-pages|@media print/);
  const layer='./styles/maintenance-closeout-v207.css',print='./styles/document-premium-redesign-v141.css';
  assert.ok(index.includes(layer)&&index.indexOf(layer)<index.indexOf(print));
  assert.match(patch,/const CACHE = 'lourex-invoice-v207'/);
  assert.match(patch,/lourex-invoice-v206/);
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
