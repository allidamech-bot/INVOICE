import test from 'node:test';
import assert from 'node:assert/strict';
import {withInvoiceMode,invoiceModeValid,assertInvoiceMode,needsSaudiFiscalIssuance} from '../dist/src/lib/invoice-mode.js';
import {documentKindLabel,documentKindTitle} from '../dist/src/lib/document-kinds.js';
import {calculateTotals} from '../dist/src/lib/money.js';
const adjustments={taxEnabled:true,taxPercent:'15',discountEnabled:false,discountMode:'fixed',discountValue:'0',shippingEnabled:false,shipping:'0',otherChargesEnabled:false,otherCharges:'0'};
const doc={kind:'invoice',role:'standard',status:'draft',companySnapshot:{country:'Türkiye',vatNumber:'1234567890'},items:[{quantity:'2',unitPrice:'50'}],adjustments};
test('ordinary invoice removes configured VAT, preserves original and calculates zero tax',()=>{
 const ordinary=withInvoiceMode(doc,'ordinary');assert.equal(ordinary.invoiceMode,'ordinary');assert.equal(ordinary.adjustments.taxEnabled,false);assert.equal(ordinary.adjustments.taxPercent,'0');assert.equal(calculateTotals(ordinary.items,ordinary.adjustments).tax,'0.00');assert.equal(calculateTotals(ordinary.items,ordinary.adjustments).grandTotal,'100.00');assert.equal(doc.adjustments.taxPercent,'15');assert.equal(invoiceModeValid(ordinary),true);
});
test('tax invoice preserves explicit preset and calculates VAT independently',()=>{
 const tax=withInvoiceMode(doc,'tax');assert.equal(tax.adjustments.taxEnabled,true);assert.equal(calculateTotals(tax.items,tax.adjustments).tax,'15.00');assert.equal(calculateTotals(tax.items,tax.adjustments).grandTotal,'115.00');assert.equal(invoiceModeValid(tax),true);assert.equal(needsSaudiFiscalIssuance(tax),false);
});
test('no preset: non-Saudi rate must be reviewed; Saudi default suggests 15 and remains gated',()=>{
 const blank={...doc,adjustments:{...adjustments,taxEnabled:false,taxPercent:'0'}};
 assert.equal(withInvoiceMode(blank,'tax').adjustments.taxPercent,'');
 const saudi=withInvoiceMode({...blank,companySnapshot:{country:'SA',vatNumber:''}},'tax');
 assert.equal(saudi.adjustments.taxPercent,'15');assert.equal(needsSaudiFiscalIssuance(saudi),true);
 assert.equal(needsSaudiFiscalIssuance(withInvoiceMode({...blank,companySnapshot:{country:'Türkiye',vatNumber:'300000000000003'}},'tax')),true);
});
test('type cannot be changed, removed or mismatched by a stale edit',()=>{
 const ordinary=withInvoiceMode(doc,'ordinary'),tax=withInvoiceMode(doc,'tax');
 for(const bad of [{...ordinary,adjustments},{...ordinary,invoiceMode:undefined},{...tax}])assert.throws(()=>assertInvoiceMode(bad,ordinary));
 assert.throws(()=>withInvoiceMode(ordinary,'tax'));assert.throws(()=>withInvoiceMode({...doc,status:'final'},'ordinary'));assert.throws(()=>withInvoiceMode({...doc,kind:'proforma'},'tax'));
 assert.equal(invoiceModeValid({...tax,adjustments:{...adjustments,taxEnabled:false,taxPercent:'0'}}),false);
 assert.equal(invoiceModeValid({...tax,role:'credit-note',adjustments:{...adjustments,taxEnabled:false,taxPercent:'0'}}),true);
});
test('legacy invoices and other document titles are unchanged; typed invoices have distinct labels and print titles',()=>{
 assert.equal(invoiceModeValid(doc),true);assert.equal(documentKindLabel('invoice').ar,'فاتورة تجارية');assert.equal(documentKindLabel('invoice','standard','ordinary').ar,'فاتورة عادية');assert.equal(documentKindTitle('invoice','standard','tax').en,'TAX INVOICE');assert.equal(documentKindLabel('invoice','credit-note','tax').ar,'إشعار دائن');assert.equal(documentKindTitle('proforma').en,'QUOTATION');
});
