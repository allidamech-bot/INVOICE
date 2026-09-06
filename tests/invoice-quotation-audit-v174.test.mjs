import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { customerMatchesSearch } from '../dist/src/lib/customer-search.js';

const read=path=>readFile(path,'utf8');

const customer={
  id:'cust-a',createdAt:'2026-09-06T00:00:00.000Z',updatedAt:'2026-09-06T00:00:00.000Z',
  companyNameEn:'North Star Trading',companyNameAr:'شركة نجم الشمال',contactPerson:'Omar Khaled',
  addressEn:'King Fahd Road 18',addressAr:'طريق الملك فهد ١٨',city:'Riyadh',country:'Saudi Arabia',
  phone:'+966 55 123 4567',email:'accounts@northstar.example',vatTaxNumber:'310123456700003',commercialRegistration:'1010998877',
  preferredCurrency:'USD',paymentTermPresetId:'net30',paymentTerms:'Net 30',paymentDueDays:'30',creditLimit:'50000',creditCurrency:'SAR',notes:'Wholesale priority account'
};

test('document customer search finds operational identifiers, not only company name',()=>{
  assert.equal(customerMatchesSearch(customer,'north star'),true);
  assert.equal(customerMatchesSearch(customer,'نجم الشمال'),true);
  assert.equal(customerMatchesSearch(customer,'055 123'),true);
  assert.equal(customerMatchesSearch(customer,'accounts@northstar'),true);
  assert.equal(customerMatchesSearch(customer,'Riyadh'),true);
  assert.equal(customerMatchesSearch(customer,'310123456700003'),true);
  assert.equal(customerMatchesSearch(customer,'1010998877'),true);
  assert.equal(customerMatchesSearch(customer,'Omar Riyadh'),true);
  assert.equal(customerMatchesSearch(customer,'unrelated customer'),false);
});

test('invoice and quotation editor exposes a clear no-results state and hides quick picks while searching',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/customerMatchesSearch\(c,this\.state\.customerQuery\)/);
  assert.match(core,/customers\.length===0/);
  assert.match(core,/No matching customers\./);
  assert.match(core,/!this\.state\.customerQuery\.trim\(\)&&recentCustomers\.length/);
  assert.doesNotMatch(core,/c\.companyNameEn\.toLowerCase\(\)\.includes\(this\.state\.customerQuery\.toLowerCase\(\)\)/);
});

test('tablet does not mount the hidden desktop A4 renderer between 901 and 1180px',async()=>{
  const [core,css]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/styles/editor-workspace-v162.css')
  ]);
  assert.match(css,/@media\(max-width:1180px\)[\s\S]*\.app-ui \.preview-pane\{display:none!important\}/);
  assert.match(core,/window\.matchMedia\('\(min-width:1181px\)'\)/);
  assert.doesNotMatch(core,/window\.matchMedia\('\(min-width:901px\)'\)/);
});

test('draft editor contains no hidden quotation conversion control',async()=>{
  const [core,css]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/styles/editor-workflow-v61.css')
  ]);
  assert.doesNotMatch(core,/convert-invoice-button/);
  assert.doesNotMatch(css,/\.app-ui \.convert-invoice-button\{display:none!important\}/);
});
