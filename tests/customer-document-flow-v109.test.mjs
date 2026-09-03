import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('customer workspace exposes direct quote and invoice actions', async () => {
  const source = await read('src/components/CustomersPage.tsx');
  assert.match(source, /onNewDocument:\(kind:DocumentKind,customer:Customer\)=>Promise<void>/);
  assert.match(source, /createDocument=async\(kind:DocumentKind,customer:Customer\)/);
  assert.match(source, /createDocument\('proforma',c\)/);
  assert.match(source, /createDocument\('invoice',c\)/);
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

test('v109 stylesheet remains app-only beneath the canonical document layer', async () => {
  const [html, sw] = await Promise.all([read('index.html'), read('public/sw.js')]);
  const v109 = './styles/customer-document-flow-v109.css';
  const v100 = './styles/performance-polish-v100.css';
  assert.ok(html.includes(v109));
  assert.ok(sw.includes(v109));
  assert.ok(html.indexOf(v109) < html.indexOf(v100));
  assert.equal((html.match(/<link rel="stylesheet"/g) || []).at(-1) !== undefined, true);
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.at(-1), './styles/document-premium-redesign-v141.css');
  assert.match(sw, /v103/);
  assert.match(sw, /const CACHE = 'lourex-invoice-v101'/);
});
