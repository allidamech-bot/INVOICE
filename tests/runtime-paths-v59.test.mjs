import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');

test('saved document open path clones persisted data and remounts editor by identity', async () => {
  const app = await read('src/app/App.tsx');
  const wrapper = await read('src/components/EditorPage.tsx');
  assert.match(app, /openDocument=\(doc:LourexDocument\)=>this\.setState\(\{screen:'editor',editorDoc:structuredClone\(doc\)\}\)/);
  assert.match(app, /screen==='editor'&&this\.state\.editorDoc\?<EditorPage/);
  assert.match(wrapper, /key=\{props\.document\.id\}/);
  assert.match(wrapper, /EditorPageCore/);
});

test('editor close path flushes unsaved draft before returning to documents', async () => {
  const editor = await read('src/components/EditorPageCore.tsx');
  assert.match(editor, /private saveAndClose=async\(\)=>/);
  assert.match(editor, /await this\.props\.onSave\(snapshot,true\);this\.props\.onClose\(\)/);
  assert.match(editor, /if\(this\.state\.saving\)\{window\.setTimeout\(\(\)=>void this\.saveAndClose\(\),100\);return;\}/);
  assert.match(editor, /visibilitychange/);
  assert.match(editor, /document\.visibilityState!=='hidden'/);
});

test('white-screen recovery boundary wraps the full application root', async () => {
  const index = await read('src/app/index.tsx');
  const boundary = await read('src/app/AppErrorBoundary.tsx');
  assert.match(index, /<AppErrorBoundary><App\/><\/AppErrorBoundary>/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /Copy diagnostics/);
  assert.match(boundary, /window\.location\.reload/);
});

test('print/PDF/share path waits for fonts and image assets before invoking system print', async () => {
  const app = await read('src/app/App.tsx');
  assert.match(app, /document\.fonts\.ready/);
  assert.match(app, /querySelectorAll<HTMLImageElement>\('\.print-portal img'\)/);
  assert.match(app, /image\.decode/);
  assert.match(app, /await this\.waitForPrintAssets\(\)/);
  assert.match(app, /window\.print\(\)/);
  assert.match(app, /afterprint/);
  assert.match(app, /document\.body\.classList\.remove\('printing'\)/);
  assert.match(app, /<TemplateRenderer document=\{this\.state\.printDoc\} scale=\{1\}/);
});

test('mobile preview remains deferred while desktop live preview and print renderer stay real', async () => {
  const renderer = await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer, /class DeferredMobilePreview/);
  assert.match(renderer, /this\.state\.active\?renderDocument\(this\.props\)/);
  assert.match(renderer, /scale===0\.48&&!props\.compact/);
  assert.match(renderer, /return renderDocument\(props\)/);
});

test('installed PWA update path is non-fatal and never forces an automatic reload', async () => {
  const index = await read('src/app/index.tsx');
  assert.match(index, /const hadController=Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(index, /controllerchange/);
  assert.match(index, /if\(hadController\)showUpdateNotice\(\)/);
  assert.match(index, /then\(registration=>registration\.update\(\)\)\.catch\(\(\)=>undefined\)/);
  assert.doesNotMatch(index, /controllerchange[^]*window\.location\.reload\(\)/);
});

test('offline cache includes every module required by open, edit, recover and print paths', async () => {
  const sw = await read('public/sw.js');
  for (const asset of [
    './src/app/index.js',
    './src/app/App.js',
    './src/app/AppErrorBoundary.js',
    './src/components/DocumentsPage.js',
    './src/components/EditorPage.js',
    './src/components/EditorPageCore.js',
    './src/templates/TemplateRenderer.js',
    './src/lib/documents.js',
    './src/storage/vault.js'
  ]) assert.ok(sw.includes(asset), `offline cache missing ${asset}`);
});
