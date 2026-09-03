import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

test('production shell has local matched React runtime, PWA and premium design layer', async () => {
  const html = await read('dist/index.html');
  const sw = await read('dist/sw.js');
  const bundle = await read('dist/styles/app.bundle.css');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /\.\/vendor\/react\.production\.min\.js/);
  assert.match(html, /\.\/vendor\/react-dom\.production\.min\.js/);
  assert.doesNotMatch(html, /react@16\.0\.0|react-dom@16\.0\.1/);
  assert.doesNotMatch(html, /https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\/[^\"]*react/);
  assert.match(sw, /vendor\/react\.production\.min\.js/);
  assert.match(sw, /vendor\/react-dom\.production\.min\.js/);
  assert.ok((await stat(new URL('dist/vendor/react.production.min.js', root))).size > 5000);
  assert.ok((await stat(new URL('dist/vendor/react-dom.production.min.js', root))).size > 5000);
  assert.ok((await stat(new URL('dist/vendor/firebase-app-compat.js', root))).size > 5000);
  assert.ok((await stat(new URL('dist/vendor/firebase-auth-compat.js', root))).size > 5000);
  assert.ok((await stat(new URL('dist/vendor/firebase-firestore-compat.js', root))).size > 5000);
  assert.match(html, /src\/app\/index\.js/);
  assert.match(html, /styles\/app\.bundle\.css/);
  assert.doesNotMatch(html, /styles\/premium\.css/);
  assert.match(bundle, /\/\* --- premium\.css --- \*\//);
  assert.match(bundle, /\/\* --- accounting-polish\.css --- \*\//);
  assert.match(bundle, /\/\* --- v44-audit\.css --- \*\//);
  assert.match(bundle, /--radius-xl/);
  assert.match(bundle, /\.save-indicator\.state-saved/);
  assert.match(bundle, /@media \(max-width:720px\)/);
  assert.match(bundle, /--acct-blue/);
  assert.match(bundle, /\.editor-validation-summary/);
  assert.match(bundle, /\.section-has-error/);
  assert.ok((await stat(new URL('dist/brand/lourex-logo.svg', root))).size > 1000);
});

test('production shell redirects deployment URLs to the canonical Vercel project origin', async () => {
  const html = await read('dist/index.html');
  const runtime = await read('dist/runtime-config.js');
  const build = await read('scripts/build.mjs');
  const sw = await read('dist/sw.js');
  assert.match(html, /runtime-config\.js/);
  assert.match(html, /runtime\.canonicalHost/);
  assert.match(html, /window\.location\.replace/);
  assert.match(build, /VERCEL_PROJECT_PRODUCTION_URL/);
  assert.match(build, /VERCEL_URL/);
  assert.match(runtime, /__LOUREX_RUNTIME__/);
  assert.match(sw, /runtime-config\.js/);
  assert.match(sw, /cache:'no-store'/);
});

test('editor continuously autosaves incomplete drafts while explicit actions validate', async () => {
  const editor = await read('src/components/EditorPageCore.tsx');
  assert.match(editor, /setTimeout\(\(\)=>void this\.save\(true\),500\)/);
  assert.match(editor, /Saving draft/);
  assert.match(editor, /Draft auto-saved/);
  assert.match(editor, /validateCurrent/);
  assert.match(editor, /editor-validation-summary/);
  assert.match(editor, /has-validation-errors/);
  assert.match(editor, /scrollToFirstError/);
  assert.match(editor, /saveAndClose/);
  assert.match(editor, /visibilitychange/);
  assert.doesNotMatch(editor, /schedule=.*validateDocument/);
});

test('editor remounts its local draft state when document identity changes', async () => {
  const wrapper = await read('src/components/EditorPage.tsx');
  assert.match(wrapper, /EditorPageCore/);
  assert.match(wrapper, /key=\{props\.document\.id\}/);
});

test('existing encrypted local vault can unlock without a live cloud session', async () => {
  const selector = await read('src/app/AuthScreenSelector.tsx');
  const unlockBranch = selector.indexOf("if (props.mode === 'unlock')");
  const cloudGate = selector.indexOf('if (!currentCloudUser())');
  assert.ok(unlockBranch >= 0, 'unlock branch missing');
  assert.ok(cloudGate > unlockBranch, 'cloud account gate must not block an existing local vault');
  assert.match(selector, /return <UnlockScreen/);
  assert.match(selector, /return <AccountEntryScreen/);
});

test('backup uses the native share sheet for Save to Files with download fallback', async () => {
  const backup = await read('src/lib/backup.ts');
  assert.match(backup, /navigator\.share/);
  assert.match(backup, /canShare/);
  assert.match(backup, /Save to Files/);
  assert.match(backup, /downloadFallback/);
  assert.match(backup, /LOUREX-Backup-/);
});

test('Firebase cloud sync stores the encrypted vault under owner-only user paths', async () => {
  const html = await read('dist/index.html');
  const cloud = await read('src/cloud/firebase.ts');
  const rules = await read('firestore.rules');
  const app = await read('src/app/App.tsx');
  assert.match(html, /vendor\/firebase-app-compat\.js/);
  assert.match(html, /vendor\/firebase-auth-compat\.js/);
  assert.match(html, /vendor\/firebase-firestore-compat\.js/);
  assert.match(cloud, /LOUREX_CLOUD_V1/);
  assert.match(cloud, /splitCipher/);
  assert.match(cloud, /cipherSha256/);
  assert.match(cloud, /pushLocalVaultToCloud/);
  assert.match(cloud, /reconcileCloudVault/);
  assert.match(cloud, /Cloud conflict detected/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(app, /scheduleCloudSync/);
  assert.match(app, /CloudAccountModal/);
});

test('first-run onboarding requires account entry before the simplified local PIN setup', async () => {
  const html = await read('dist/index.html');
  const auth = await read('src/components/AuthScreens.tsx');
  const account = await read('src/components/AccountEntryScreen.tsx');
  const selector = await read('src/app/AuthScreenSelector.tsx');
  const css = await read('dist/styles/app.bundle.css');
  assert.match(html, /styles\/app\.bundle\.css/);
  assert.match(css, /\/\* --- auth-entry\.css --- \*\//);
  assert.match(account, /Create your account/);
  assert.match(account, /Sign In/);
  assert.match(account, /createCloudUser/);
  assert.match(account, /signInCloudUser/);
  assert.match(account, /Confirm Password/);
  assert.match(auth, /Create your LOUREX PIN/);
  assert.match(auth, /account password cannot replace or recover this PIN/i);
  assert.match(selector, /if \(!currentCloudUser\(\)\)/);
  assert.match(selector, /return <AccountEntryScreen/);
  assert.doesNotMatch(auth, /Restore Backup|Choose Backup File|restoreOpen/);
  assert.match(css, /account-entry-tabs/);
  assert.match(css, /setup-account-badge/);
});

test('offline service worker precaches the complete application module graph and current runtime', async () => {
  const sw = await read('dist/sw.js');
  assert.match(sw, /lourex-invoice-v\d+/);
  for (const asset of ['src/app/index.js','src/components/EditorPage.js','src/components/EditorPageCore.js','src/templates/TemplateRenderer.js','src/storage/db.js','src/storage/vault-merge.js','src/crypto/crypto.js','styles/app.bundle.css','src/cloud/firebase.js','src/components/CloudAccountModal.js','vendor/react.production.min.js','vendor/firebase-auth-compat.js','vendor/html2canvas.min.js','vendor/jspdf.umd.min.js','vendor/xlsx.full.min.js']) assert.ok(sw.includes(asset), asset);
});

test('print stylesheet isolates A4 documents from application chrome', async () => {
  const css = await read('dist/styles/app.bundle.css');
  assert.match(css, /@media print/);
  assert.match(css, /\.app-ui\{display:none!important\}/);
  assert.match(css, /width:210mm;height:297mm/);
  assert.match(css, /page-break-after:always/);
});

test('source contains no unfinished UI placeholders or unintended backend clients', async () => {
  const app = [
    await read('src/app/App.tsx'), await read('src/components/DocumentsPage.tsx'), await read('src/components/CustomersPage.tsx'),
    await read('src/components/EditorPage.tsx'), await read('src/components/EditorPageCore.tsx'), await read('src/components/SettingsModal.tsx')
  ].join('\n');
  assert.doesNotMatch(app, /TODO|Coming Soon|Supabase|MongoDB|PostgreSQL/i);
});
