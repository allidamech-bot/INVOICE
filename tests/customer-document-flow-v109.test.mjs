import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('customer workspace exposes direct quote and invoice actions', async () => {
  const source = await read('src/components/CustomersPage.tsx');
  assert.match(source, /onNewDocument:\(kind:DocumentKind,customer:Customer\)=>Promise<void>/);
  assert.match(source, /createDocument=async\(kind:DocumentKind,customer:Customer\)/);
  assert.match(source, /this\.createDocument\('proforma',customer\)/);
  assert.match(source, /this\.createDocument\('invoice',customer\)/);
  assert.match(source, /creatingDocument/);
  assert.match(source, /customer-document-actions/);
});

test('app reserves the normal number and snapshots the selected customer', async () => {
  const source = await read('src/app/App.tsx');
  assert.match(source, /customerSnapshotFrom/);
  assert.match(source, /newDocumentForCustomer=async\(kind:DocumentKind,customer:Customer\)/);
  assert.match(source, /await this\.reserveDocument\(kind\)/);
  assert.match(source, /customerSnapshot:customerSnapshotFrom\(customer\)/);
  assert.match(source, /onNewDocument=\{this\.newDocumentForCustomer\}/);
  assert.doesNotMatch(source, /nextDocumentNumber\([^)]*customer/);
});

test('v109 styles keep customer actions touch-safe and responsive', async () => {
  const css = await read('src/styles/customer-document-flow-v109.css');
  assert.match(css, /\.customer-document-action/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /@media \(pointer:coarse\)/);
  assert.match(css, /@media print/);
  assert.doesNotMatch(css, /\.invoice-page/);
  assert.doesNotMatch(css, /\.items-table/);
});

test('customer actions ship through the current responsive app-only offline design, not the retired stylesheet owner',async()=>{
  const [html,sw,build,css]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('scripts/build.mjs'),read('src/styles/tailadmin-customers-v320.css')
  ]);
  assert.match(html,/href="\.\/styles\/tailadmin-customers-v320\.css/);
  assert.match(html,/href="\.\/styles\/tailadmin-reliability-bridge-v320\.css/);
  assert.ok(html.indexOf('tailadmin-customers-v320.css')<html.indexOf('tailadmin-reliability-bridge-v320.css'));
  assert.match(build,/const appBundleCss=styleParts\.join/);
  assert.match(build,/await writeFile\('dist\/styles\/app\.bundle\.css',appBundleCss\)/);
  assert.match(build,/sw=sw\.replace\(/);
  assert.match(sw,/src\/components\/CustomersPage\.js/);
  assert.match(sw,/src\/lib\/customers\.js|src\/components\/CustomersPage\.js/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v314'/);
  assert.match(css,/\.app-ui \.ta-customers-page/);
  assert.match(css,/@media screen/);
  assert.doesNotMatch(css,/@media print|\.invoice-page\s*\{/);
});
