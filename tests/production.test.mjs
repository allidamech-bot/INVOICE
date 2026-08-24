import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

test('production shell has PWA, local React runtime, and compiled app entry', async () => {
  const html = await read('dist/index.html');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /vendor\/react\.production\.min\.js/);
  assert.match(html, /src\/app\/index\.js/);
  assert.ok((await stat(new URL('dist/brand/lourex-logo.svg', root))).size > 1000);
});

test('offline service worker precaches the application module graph', async () => {
  const sw = await read('dist/sw.js');
  for (const asset of ['src/app/index.js','src/components/EditorPage.js','src/templates/TemplateRenderer.js','src/storage/db.js','src/crypto/crypto.js']) assert.ok(sw.includes(asset), asset);
});

test('print stylesheet isolates A4 documents from application chrome', async () => {
  const appCss = await read('dist/styles/app.css');
  const docCss = await read('dist/styles/document.css');
  assert.match(appCss, /@media print/);
  assert.match(appCss, /\.app-ui\{display:none!important\}/);
  assert.match(docCss, /width:210mm;height:297mm/);
  assert.match(appCss, /page-break-after:always/);
});

test('source contains no unfinished UI placeholders or external database clients', async () => {
  const app = [
    await read('src/app/App.tsx'), await read('src/components/DocumentsPage.tsx'), await read('src/components/CustomersPage.tsx'),
    await read('src/components/EditorPage.tsx'), await read('src/components/SettingsModal.tsx')
  ].join('\n');
  assert.doesNotMatch(app, /TODO|Coming Soon|Supabase|Firebase|MongoDB|PostgreSQL/i);
});
