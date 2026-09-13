import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v239 renders supplier item movement and purchase status identity through the active UI language',async()=>{
  const page=await read('src/components/OperationsPage.tsx');
  assert.match(page,/function localizedStored\(en:string,ar:string,fallback:string\):string\{return \(t\(en\|\|ar,ar\|\|en\)\|\|fallback\)\.trim\(\);\}/);
  assert.match(page,/function supplierLabel\(supplier:Supplier\):string\{return localizedStored\(supplier\.nameEn,supplier\.nameAr/);
  assert.match(page,/function purchaseSupplierLabel\(purchase:PurchaseRecord\):string\{return localizedStored\(purchase\.supplierSnapshot\?\.nameEn/);
  assert.match(page,/function itemLabel\(item:SavedItem\):string\{return \[item\.sku,localizedStored\(item\.descriptionEn,item\.descriptionAr/);
  assert.match(page,/function movementItemLabel\(movement:InventoryMovementRecord\):string\{return localizedStored\(movement\.itemNameEn/);
  assert.match(page,/function purchaseStatusLabel\(status:PurchaseRecord\['status'\]\):string/);
  assert.match(page,/\{purchaseStatusLabel\(edit\.status\)\}/);
});

test('v239 keeps Operations search bilingual while localizing canonical expense categories',async()=>{
  const page=await read('src/components/OperationsPage.tsx');
  assert.match(page,/p\.supplierSnapshot\?\.nameEn\|\|'',p\.supplierSnapshot\?\.nameAr\|\|''/);
  assert.match(page,/purchaseStatusLabel\(p\.status\)/);
  assert.match(page,/expenseCategoryLabel\(e\.category\)/);
  for(const arabic of ['عام','شحن','جمارك','تخزين','نقل','تسويق','مكتب','خدمات مهنية','رسوم بنكية','أخرى'])assert.ok(page.includes(arabic),arabic);
  assert.match(page,/expenseCategories\.map\(c=><option key=\{c\} value=\{c\}>\{expenseCategoryLabel\(c\)\}<\/option>\)/);
});

test('v239 restores editable Arabic purchase descriptions without changing the stored bilingual schema',async()=>{
  const page=await read('src/components/OperationsPage.tsx');
  assert.match(page,/t\('Description AR','الوصف AR'\)/);
  assert.match(page,/value=\{line\.descriptionAr\}/);
  assert.match(page,/this\.updatePurchaseItem\(line\.id,\{descriptionAr:e\.target\.value\}\)/);
  assert.match(page,/descriptionEn:saved\.descriptionEn,descriptionAr:saved\.descriptionAr/);
});

test('v239 refreshes installed clients for Operations locale purity',async()=>{
  const pwa=await read('scripts/pwa-cache-v205.mjs');
  assert.match(pwa,/v239 keeps Operations supplier, item, status and expense-category identity locale-pure and restores Arabic purchase descriptions/);
  assert.match(pwa,/lourex-invoice-v239: operations locale purity refresh/);
});
