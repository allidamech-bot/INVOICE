import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { defaultCompany, emptyVault } from '../dist/src/lib/defaults.js';
import { createExpense, createManualInventoryMovement, createPurchase, createPurchaseItem, inventoryBalances, spendByCurrency, validatePurchase } from '../dist/src/lib/operations.js';
import { financialReportByCurrency, monthlyPerformanceReport, normalizeReportPeriod, reportDateInRange } from '../dist/src/lib/reports.js';

function supplier(){const at='2026-09-05T12:00:00.000Z';return{id:'supplier-integrity',createdAt:at,updatedAt:at,nameEn:'Supplier',nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'USD',paymentTerms:'',notes:''};}
function item(){const at='2026-09-05T12:00:00.000Z';return{id:'item-integrity',createdAt:at,updatedAt:at,sku:'SKU-I',descriptionEn:'Material',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'10.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:at,category:'',tags:[],favorite:false};}
function validPurchase(){const source=supplier();const saved=item();const purchase=createPurchase([], [source], 'USD');purchase.id='purchase-integrity';purchase.number='PUR-2026-0099';purchase.date='2026-09-05';const line=createPurchaseItem(saved);line.id='line-a';line.quantity='2';line.unitCost='10.00';purchase.items=[line];return {purchase,saved,source};}

test('reports reject impossible ISO-shaped calendar dates',()=>{
  assert.equal(reportDateInRange('2026-02-28','2026-01-01','2026-12-31'),true);
  assert.equal(reportDateInRange('2026-02-31','2026-01-01','2026-12-31'),false);
  assert.equal(reportDateInRange('2026-99-01','2026-01-01','2026-12-31'),false);
  const company=defaultCompany();const bad=createBlankDocument('invoice','INV-BAD-DATE',company);bad.status='final';bad.issueDate='2026-02-31';bad.items=[{...bad.items[0],descriptionEn:'Bad date sale',quantity:'1',unitPrice:'100.00',unitCost:'50.00'}];
  assert.deepEqual(financialReportByCurrency([bad],[],'2026-01-01','2026-12-31'),[]);
  assert.deepEqual(monthlyPerformanceReport([bad],[],'2026-01-01','2026-12-31'),[]);
});

test('report period normalization rejects impossible filter dates',()=>{
  const normalized=normalizeReportPeriod('2026-02-31','2026-09-05');
  assert.deepEqual(normalized,{from:'',to:'2026-09-05'});
  const invalidTo=normalizeReportPeriod('2026-01-01','2026-13-01');
  assert.equal(invalidTo.from,'2026-01-01');
  assert.match(invalidTo.to,/^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(invalidTo.to,'2026-13-01');
});

test('purchase validation rejects blank units duplicate linked items and nameless supplier snapshots',()=>{
  const {purchase,saved}=validPurchase();
  const blankUnit=structuredClone(purchase);blankUnit.items[0].unit='';
  assert.ok(validatePurchase(blankUnit,[saved]).some(error=>/unit is required/i.test(error)));
  const duplicate=structuredClone(purchase);duplicate.items.push({...duplicate.items[0],id:'line-b'});
  assert.ok(validatePurchase(duplicate,[saved]).some(error=>/already listed/i.test(error)));
  const nameless=structuredClone(purchase);nameless.supplierSnapshot.nameEn='';nameless.supplierSnapshot.nameAr='';
  assert.ok(validatePurchase(nameless,[saved]).some(error=>/supplier name is required/i.test(error)));
});

test('manual inventory cost cannot be recorded without valid cost and currency metadata',()=>{
  const saved=item();
  assert.throws(()=>createManualInventoryMovement(saved,'opening','5','2026-09-05','','bad-cost','USD'),/unit cost must be zero or greater/i);
  const noCurrency={...saved,lastCostCurrency:''};
  assert.throws(()=>createManualInventoryMovement(noCurrency,'opening','5','2026-09-05','','10.00',''),/currency is required/i);
  const movement=createManualInventoryMovement(saved,'opening','5','2026-09-05','','10.00','USD');
  assert.equal(movement.unitCost,'10.00');assert.equal(movement.currency,'USD');
});

test('spend summary excludes malformed legacy purchases and expenses instead of treating them as money',()=>{
  const {purchase}=validPurchase();purchase.status='posted';purchase.postedAt='2026-09-05T12:00:00.000Z';
  const validExpense=createExpense('USD');validExpense.date='2026-09-05';validExpense.description='Office';validExpense.amount='25.00';
  const badPurchase={...structuredClone(purchase),id:'bad-purchase',date:'2026-02-31'};
  const negativeExpense={...validExpense,id:'bad-expense',amount:'-999.00'};
  const rows=spendByCurrency([purchase,badPurchase],[validExpense,negativeExpense]);
  assert.deepEqual(rows,[{currency:'USD',purchases:'20.00',expenses:'25.00',total:'45.00'}]);
});

test('inventory balances ignore malformed legacy movements without deleting ledger history',()=>{
  const saved=item();
  const valid=createManualInventoryMovement(saved,'opening','5','2026-09-05');
  const malformedAmount={...valid,id:'bad-amount',quantity:'not-a-number'};
  const malformedDate={...valid,id:'bad-date',date:'2026-02-31',quantity:'50'};
  const balances=inventoryBalances([saved],[valid,malformedAmount,malformedDate]);
  assert.equal(balances.length,1);
  assert.equal(balances[0].quantity,'5');
});

test('financial CSV neutralizes spreadsheet formulas only in textual identity cells',()=>{
  const source=fs.readFileSync(new URL('../src/components/ReportsPage.tsx',import.meta.url),'utf8');
  assert.match(source,/function safeCsvText\(value:string\):string/);
  assert.match(source,/\^\[\\t\\r \]\*\[=\+\\-@\]/);
  assert.match(source,/safeCsvText\(row\.currency\),safeCsvText\(row\.customerName\),row\.netSales/);
  assert.doesNotMatch(source,/safeCsvText\(row\.netSales\)/);
});

test('operations integrity changes preserve unrelated vault defaults',()=>{
  const vault=emptyVault();
  assert.ok(Array.isArray(vault.purchases));assert.ok(Array.isArray(vault.expenses));assert.ok(Array.isArray(vault.inventoryMovements));
});
