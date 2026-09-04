import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('batch 4 turns customers into profiles instead of edit-only cards',async()=>{
  const source=await read('src/components/CustomersPage.tsx');
  assert.match(source,/selectedId:string/);
  assert.match(source,/customer-profile-view/);
  assert.match(source,/Customer profile/);
  assert.match(source,/Document defaults/);
  assert.match(source,/onNewDocument\('proforma',customer\)/);
  assert.match(source,/onNewDocument\('invoice',customer\)/);
  assert.match(source,/Existing documents keep their stored customer snapshot/);
  assert.match(source,/Search name, phone, email, tax number or location/);
});

test('batch 4 exposes reusable product cost and a favorites filter',async()=>{
  const source=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(source,/favoriteOnly:boolean/);
  assert.match(source,/lastUnitCost:''/);
  assert.match(source,/lastCostCurrency:currency\|\|'USD'/);
  assert.match(source,/valid non-negative unit cost/);
  assert.match(source,/Unit cost \(internal\)/);
  assert.match(source,/never printed on customer documents/);
  assert.match(source,/With cost/);
  assert.match(source,/favoriteOnly\|\|Boolean\(item\.favorite\)/);
});

test('batch 4 styling is responsive, RTL-safe and isolated from printable document output',async()=>{
  const css=await read('src/styles/customer-items-v165.css');
  assert.match(css,/customer-profile-hero/);
  assert.match(css,/customer-directory-grid/);
  assert.match(css,/product-library-metrics-v165/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/\[dir='rtl'\]/);
  assert.doesNotMatch(css,/\.invoice-page\b/);
  assert.doesNotMatch(css,/\.items-table\b/);
});

test('batch 4 workspace layer loads after the design system and is cached offline',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.match(html,/customer-items-v165\.css/);
  assert.ok(html.indexOf('design-system-v164.css')<html.indexOf('customer-items-v165.css'));
  assert.ok(html.indexOf('customer-items-v165.css')<html.indexOf('document-premium-redesign-v141.css'));
  assert.match(sw,/customer-items-v165\.css/);
});
