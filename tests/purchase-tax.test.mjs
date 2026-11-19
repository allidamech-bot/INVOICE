import test from 'node:test';
import assert from 'node:assert/strict';
import {createPurchase,createPurchaseItem,createSupplier,postPurchase,purchaseTotals,purchaseFinancialTotals,validatePurchase,purchaseAccountingIsValid} from '../dist/src/lib/operations.js';
import {purchasePayableSummary} from '../dist/src/lib/payables.js';
import {purchaseTaxDraft,purchaseTaxValid,assertUniquePurchaseTaxReference,recordedPurchaseTaxRows,recordedPurchaseTaxReport} from '../dist/src/lib/purchase-tax.js';
const supplier={...createSupplier(),id:'supplier',nameEn:'Supplier',defaultCurrency:'SAR'};
const item={id:'item',sku:'SKU',descriptionEn:'Stock',descriptionAr:'صنف',unit:'PCS',lastUnitCost:'45',lastCostCurrency:'SAR'};
const base={...createPurchase([],[supplier],'SAR'),id:'p',number:'P-1',workspaceId:'default',branchId:'main',date:'2026-11-01',dueDate:'2026-11-30',items:[{...createPurchaseItem(item),quantity:'2',unitCost:'50'}]};
const tax={mode:'tax',invoiceReference:'TAX-2026-1',vat:'15.00',deductibleVat:'15.00'};
const typed={...base,purchaseTax:tax};
test('ordinary and historical purchases retain legacy cost and payable',()=>{
 for(const p of [base,{...base,purchaseTax:purchaseTaxDraft('ordinary')}]){const t=purchaseFinancialTotals(p);assert.equal(t.vat,'0.00');assert.equal(t.landedTotal,'100.00');assert.equal(t.payableTotal,'100.00');assert.equal(purchaseTaxValid(p),true);}
 assert.deepEqual(purchaseTotals(base),{subtotal:'100.00',freight:'0.00',duty:'0.00',other:'0.00',landedTotal:'100.00'});
});
test('fully deductible VAT posts only the net stock cost while supplier owes gross',()=>{
 const t=purchaseFinancialTotals(typed);assert.deepEqual([t.net,t.vat,t.deductibleVat,t.payableTotal,t.landedTotal],['100.00','15.00','15.00','115.00','100.00']);
 const posted=postPurchase(typed,[item]);assert.equal(posted.movements.length,1);assert.equal(posted.movements[0].unitCost,'50.0000');assert.equal(posted.movements[0].quantity,'2');assert.equal(posted.savedItems[0].lastUnitCost,'50.0000');
 const purchase={...posted.purchase,postedAt:'2026-11-01T10:00:00Z'};assert.equal(purchasePayableSummary(purchase,[],'2026-11-30').remaining,'115.00');
 assert.equal(base.items[0].unitCost,'50');assert.equal(item.lastUnitCost,'45');
});
test('only the non-deductible portion is allocated to stock and never deducted from supplier liability',()=>{
 for(const [deductible,cost,unit] of [['10.00','105.00','52.5000'],['0.00','115.00','57.5000']]){
 const p={...typed,purchaseTax:{...tax,deductibleVat:deductible}},result=postPurchase(p,[item]),t=purchaseFinancialTotals(p);
 assert.equal(t.landedTotal,cost);assert.equal(t.payableTotal,'115.00');assert.equal(result.movements[0].unitCost,unit);
 }
});
test('invalid VAT, missing references, excess deductions and ordinary purchase tax are rejected before posting',()=>{
 for(const purchaseTax of [{...tax,invoiceReference:''},{...tax,vat:'15.001'},{...tax,vat:'-1.00'},{...tax,deductibleVat:'15.01'},{...tax,mode:'ordinary'},{...tax,vat:'1,000.00'}]){
  const p={...base,purchaseTax};assert.equal(purchaseTaxValid(p),false);assert.equal(purchaseAccountingIsValid(p),false);assert.ok(validatePurchase(p,[item]).length>0);assert.throws(()=>postPurchase(p,[item]));
 }
 assert.throws(()=>assertUniquePurchaseTaxReference({...typed,id:'new'},[typed]));
 assert.doesNotThrow(()=>assertUniquePurchaseTaxReference({...typed,id:'new',purchaseTax:{...tax,invoiceReference:'TAX-2'}},[typed]));
});
test('recorded VAT register never counts drafts, shows actual dated reversal and separates currencies',()=>{
 const posted={...typed,status:'posted',postedAt:'2026-11-01T10:00:00Z'},reversed={...posted,status:'reversed',reversedAt:'2026-12-02T10:00:00Z'};
 assert.deepEqual(recordedPurchaseTaxReport([posted],'2026-11-01','2026-11-30'),[{currency:'SAR',vat:'15.00',deductibleVat:'15.00',nonDeductibleVat:'0.00',count:1}]);
 assert.deepEqual(recordedPurchaseTaxReport([typed],'2026-11-01','2026-11-30'),[]);
 assert.equal(recordedPurchaseTaxRows([reversed],'2026-12-01','2026-12-31')[0].vat,'-15.00');
 assert.equal(recordedPurchaseTaxReport([reversed],'2026-11-01','2026-12-31')[0].vat,'0.00');
 assert.throws(()=>recordedPurchaseTaxRows([posted,posted],'','2026-11-30'));
 const usd={...posted,id:'p2',currency:'USD',purchaseTax:{...tax,invoiceReference:'TAX-2'}};
 assert.deepEqual(recordedPurchaseTaxReport([posted,usd],'','2026-11-30').map(x=>x.currency),['SAR','USD']);
});
