import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v105 expands customer discovery without changing stored customer shape',async()=>{
  const page=await read('src/components/CustomersPage.tsx');
  assert.match(page,/c\.email,c\.phone,c\.city,c\.country,c\.vatTaxNumber,c\.commercialRegistration/);
  assert.match(page,/terms\.every\(term=>haystack\.includes\(term\)\)/);
  assert.match(page,/Recently updated/);
  assert.match(page,/event\.key==='\/'/);
  assert.match(page,/customers-search-clear/);
});

test('v105 prevents duplicate customers and validates optional email before persistence',async()=>{
  const page=await read('src/components/CustomersPage.tsx');
  assert.match(page,/normalizeCustomerName/);
  assert.match(page,/duplicateCustomer/);
  assert.match(page,/already exists/);
  assert.match(page,/Enter a valid email address or leave it empty/);
});

test('v105 gives the customer editor a clear progressive hierarchy',async()=>{
  const [page,css]=await Promise.all([
    read('src/components/CustomersPage.tsx'),
    read('src/styles/workspace-mobile-v94.css')
  ]);
  assert.match(page,/customer-form-section/);
  assert.match(page,/Core identity used on quotes and invoices/);
  assert.match(page,/Business details/);
  assert.match(css,/v105 — customer workspace clarity/);
  assert.match(css,/premium-customer-card/);
  assert.match(css,/customer-form-grid/);
  assert.match(css,/@media \(max-width:430px\)/);
});
