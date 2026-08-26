import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

test('production shell has PWA, React runtime, compiled app entry and premium design layer', async () => {
  const html = await read('dist/index.html');
  const premium = await read('dist/styles/premium.css');
  const accounting = await read('dist/styles/accounting-polish.css');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /react@16\.0\.0/);
  assert.match(html, /src\/app\/index\.js/);
  assert.match(html, /styles\/premium\.css/);
  assert.match(html, /styles\/accounting-polish\.css/);
  assert.match(premium, /--radius-xl/);
  assert.match(premium, /\.save-indicator\.state-saved/);
  assert.match(premium, /@media \(max-width:720px\)/);
  assert.match(accounting, /--acct-blue/);
  assert.match(accounting, /\.editor-validation-summary/);
  assert.match(accounting, /\.section-has-error/);
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
  assert.doesNotMatch(editor, /schedule=.*validateDocument/);
});

test('editor remounts its local draft state when document identity changes', async () => {
  const wrapper = await read('src/components/EditorPage.tsx');
  assert.match(wrapper, /EditorPageCore/);
  assert.match(wrapper, /key=\{props\.document\?\.id/);
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
  assert.match(html, /firebase-app-compat\.js/);
  assert.match(html, /firebase-auth-compat\.js/);
  assert.match(html, /firebase-firestore-compat\.js/);
  assert.match(cloud, /LOUREX_CLOUD_V1/);
  assert.match(cloud, /splitCipher/);
  assert.match(cloud, /cipherSha256/);
  assert.match(cloud, /pushLocalVaultToCloud/);
  assert.match(cloud, /reconcileCloudVault/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(app, /scheduleCloudSync/);
  assert.match(app, /CloudAccountModal/);
});

test('first-run onboarding requires a cloud account before local PIN setup', async () => {
  const html = await read('dist/index.html');
  const auth = await read('src/components/AuthScreens.tsx');
  const css = await read('dist/styles/auth-entry.css');
  assert.match(html, /styles\/auth-entry\.css/);
  assert.match(auth, /Create your account/);
  assert.match(auth, /Sign In/);
  assert.match(auth, /createCloudUser/);
  assert.match(auth, /signInCloudUser/);
  assert.match(auth, /Confirm Password/);
  assert.match(auth, /Create your local PIN/);
  assert.doesNotMatch(auth, /Restore Backup|Choose Backup File|restoreOpen/);
  assert.match(css, /account-entry-tabs/);
  assert.match(css, /setup-account-badge/);
});

test('offline service worker precaches the application module graph, premium styles and cloud UI', async () => {
  const sw = await read('dist/sw.js');
  for (const asset of ['src/app/index.js','src/components/EditorPage.js','src/components/EditorPageCore.js','src/templates/TemplateRenderer.js','src/storage/db.js','src/crypto/crypto.js','styles/premium.css','styles/accounting-polish.css','styles/cloud.css','styles/auth-entry.css','src/cloud/firebase.js','src/components/CloudAccountModal.js']) assert.ok(sw.includes(asset), asset);
});

test('print stylesheet isolates A4 documents from application chrome', async () => {
  const appCss = await read('dist/styles/app.css');
  const docCss = await read('dist/styles/document.css');
  assert.match(appCss, /@media print/);
  assert.match(appCss, /\.app-ui\{display:none!important\}/);
  assert.match(docCss, /width:210mm;height:297mm/);
  assert.match(appCss, /page-break-after:always/);
});

test('source contains no unfinished UI placeholders or unintended backend clients', async () => {
  const app = [
    await read('src/app/App.tsx'), await read('src/components/DocumentsPage.tsx'), await read('src/components/CustomersPage.tsx'),
    await read('src/components/EditorPage.tsx'), await read('src/components/EditorPageCore.tsx'), await read('src/components/SettingsModal.tsx')
  ].join('\n');
  assert.doesNotMatch(app, /TODO|Coming Soon|Supabase|MongoDB|PostgreSQL/i);
});
