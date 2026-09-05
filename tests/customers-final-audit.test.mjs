import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('customer cards open a read profile before explicit editing',async()=>{
  const source=await read('src/components/CustomersPage.tsx');
  assert.match(source,/private openProfile=\(customer:Customer\)=>this\.setState\(\{viewingId:customer\.id,error:''\}\)/);
  assert.match(source,/className="customer-card-main" onClick=\{\(\)=>this\.openProfile\(c\)\}/);
  assert.doesNotMatch(source,/className="customer-card-main" onClick=\{\(\)=>this\.beginEdit\(c\)\}/);
  assert.match(source,/private renderProfile=\(customer:Customer\)/);
  assert.match(source,/Customer profile/);
  assert.match(source,/Contact & address/);
  assert.match(source,/Business identity/);
  assert.match(source,/Document defaults/);
  assert.match(source,/Credit control/);
});

test('customer profile keeps quote invoice edit and delete actions explicit',async()=>{
  const source=await read('src/components/CustomersPage.tsx');
  assert.match(source,/createDocument\('proforma',customer\)/);
  assert.match(source,/createDocument\('invoice',customer\)/);
  assert.match(source,/Edit customer/);
  assert.match(source,/Delete customer/);
  assert.match(source,/viewingId:this\.state\.viewingId===c\.id\?'':this\.state\.viewingId/);
  assert.match(source,/event\.key==='Escape'&&this\.state\.viewingId/);
});

test('phone and email searches never become accidental company names',async()=>{
  const source=await read('src/components/CustomersPage.tsx');
  assert.match(source,/function customerSearchSeed/);
  assert.match(source,/seed\.includes\('@'\)/);
  assert.match(source,/\^\[\+\\d\\s\(\)\.\-\]\{5,\}\$/);
  assert.match(source,/blankCustomer\(customerSearchSeed\(this\.state\.query\)\)/);
  assert.match(source,/const suggestedName=customerSearchSeed\(query\)/);
});

test('customer discovery includes commercial terms and internal notes without changing stored shape',async()=>{
  const source=await read('src/components/CustomersPage.tsx');
  assert.match(source,/c\.preferredCurrency,c\.creditCurrency,c\.paymentTerms,c\.notes/);
  assert.match(source,/terms\.every\(term=>haystack\.includes\(term\)\)/);
  assert.doesNotMatch(source,/interface Customer \{/);
});

test('customer profile is responsive touch-safe app UI only',async()=>{
  const css=await read('src/styles/customer-document-flow-v109.css');
  assert.match(css,/\.customer-profile-grid/);
  assert.match(css,/\.customer-profile-back/);
  assert.match(css,/\.customer-profile-quick-actions>button/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/@media \(max-width:390px\)/);
  assert.match(css,/@media print/);
  assert.doesNotMatch(css,/\.invoice-page/);
  assert.doesNotMatch(css,/\.items-table/);
});

test('deleting a customer preserves historical document snapshots by contract',async()=>{
  const [page,defaults]=await Promise.all([read('src/components/CustomersPage.tsx'),read('src/lib/defaults.ts')]);
  assert.match(page,/Existing documents keep their saved customer snapshot/);
  assert.match(page,/تحتفظ المستندات الحالية بنسخة بيانات العميل المحفوظة فيها/);
  assert.match(defaults,/export function customerSnapshotFrom/);
  assert.match(defaults,/sourceCustomerId: customer\.id/);
});
