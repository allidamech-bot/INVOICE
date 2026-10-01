import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(p,'utf8');

test('Batch 10 stays inside Reports and preserves frozen primary navigation',async()=>{
  const [reports,app]=await Promise.all([read('src/components/ReportsPage.tsx'),read('src/app/App.tsx')]);
  assert.match(reports,/view:'performance'[\s\S]*'tax'/);
  assert.match(reports,/<TaxVatCenter company=\{this\.props\.company\} documents=\{this\.props\.documents\}/);
  assert.match(reports,/Tax \/ VAT/);
  assert.doesNotMatch(app,/TaxVatCenter/);
});

test('Output VAT is derived only from active final sales invoices and accounted credit notes',async()=>{
  const engine=await read('src/lib/tax-vat.ts');
  assert.match(engine,/doc\.kind==='invoice'&&doc\.role!=='credit-note'&&doc\.status==='final'&&doc\.lifecycleStatus!=='voided'/);
  assert.match(engine,/accountedInvoiceCreditNotes\(invoice,documents\)/);
  assert.match(engine,/doc\.adjustments\.taxEnabled/);
  assert.match(engine,/calculateTotals\(doc\.items,doc\.adjustments\)/);
  assert.match(engine,/doc\.role==='credit-note'\?-1n:1n/);
});

test('Tax reporting stays currency and rate separated with no hidden FX or purchase VAT',async()=>{
  const engine=await read('src/lib/tax-vat.ts');
  assert.match(engine,/currencyMap=new Map/);
  assert.match(engine,/rates:new Map/);
  assert.match(engine,/currency\.rates\.set\(row\.taxRate,rate\)/);
  assert.match(engine,/inputVatSupported:false/);
  assert.doesNotMatch(engine,/PurchaseRecord|SupplierPaymentRecord|exchangeRate|fxRate|convertCurrency/);
});

test('Tax center explicitly scopes Input VAT out until Purchase VAT exists',async()=>{
  const component=await read('src/components/TaxVatCenter.tsx');
  assert.match(component,/Output VAT only/);
  assert.match(component,/Purchase VAT is not represented in the purchase accounting model yet/);
  assert.match(component,/does not calculate or claim Input VAT/);
  assert.match(component,/Currencies shown separately/);
  assert.match(component,/Credit notes are shown as negative values/);
});

test('Tax center is bilingual, mobile first and has practical touch targets',async()=>{
  const [component,styles]=await Promise.all([read('src/components/TaxVatCenter.tsx'),read('src/styles/tax-vat-batch10.css')]);
  assert.match(component,/مركز الضريبة/);
  assert.match(component,/ضريبة المخرجات/);
  assert.match(styles,/html\[dir="rtl"\]/);
  assert.match(styles,/@media\(max-width:720px\)/);
  assert.match(styles,/min-height:44px/);
  assert.match(styles,/prefers-reduced-motion/);
});

test('existing Settings tax presets remain presets rather than a duplicate Tax Center',async()=>{
  const [types,reports]=await Promise.all([read('src/types.ts'),read('src/components/ReportsPage.tsx')]);
  assert.match(types,/taxPresets: TaxPreset\[\]/);
  assert.match(reports,/TaxVatCenter/);
  assert.doesNotMatch(reports,/onSaveTaxPreset|saveTaxPreset/);
});