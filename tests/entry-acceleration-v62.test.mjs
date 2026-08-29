import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('customer quick-add reuses the current search text instead of forcing re-entry',async()=>{
  const source=await read('src/components/CustomersPage.tsx');
  assert.match(source,/blankCustomer\(seed=''\)/);
  assert.match(source,/private newCustomer=\(\)=>this\.setState\(\{editing:blankCustomer\(this\.state\.query\)/);
  assert.match(source,/Create this customer without typing the name again/);
  assert.match(source,/query:''/);
});

test('saved-item quick-add prefills the searched description and resets search after save',async()=>{
  const source=await read('src/components/SavedItemsModal.tsx');
  assert.match(source,/function blank\(currency:string,seed=''\)/);
  assert.match(source,/private newItem=\(\)=>this\.setState\(\{editing:blank\(this\.props\.currency,this\.state\.query\)/);
  assert.match(source,/Create it without typing the description again/);
  assert.match(source,/editing:null,query:''/);
});

test('v62 preserves language-aware prefill and existing data contracts',async()=>{
  const customers=await read('src/components/CustomersPage.tsx');
  const items=await read('src/components/SavedItemsModal.tsx');
  assert.match(customers,/companyNameEn:arabic\?'':name,companyNameAr:arabic\?name:''/);
  assert.match(items,/descriptionEn:arabic\?'':description,descriptionAr:arabic\?description:''/);
  assert.match(customers,/Existing documents keep their saved customer snapshot/);
  assert.match(items,/Existing documents are not changed/);
});

test('v62 quick-add modules remain in the current PWA release',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.ok(sw.includes('./src/components/CustomersPage.js'));
  assert.ok(sw.includes('./src/components/SavedItemsModal.js'));
});
