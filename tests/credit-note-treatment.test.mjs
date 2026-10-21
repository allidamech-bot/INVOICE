import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {calculateTotals} from '../dist/src/lib/money.js';
import {createCreditNoteDraft,assertDocumentLifecycleInvariant} from '../dist/src/lib/document-lifecycle.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {outputVatReport} from '../dist/src/lib/tax-vat.js';
function fixture(tax='20',price='100'){
 const invoice=createBlankDocument('invoice','INV-QA-TREATMENT',emptyVault().company);
 Object.assign(invoice,{id:'qa-treatment-invoice',status:'final',issueDate:'2026-10-01',dueDate:'2026-10-01',currency:'USD',workspaceId:'default',branchId:'main'});
 invoice.customerSnapshot={...invoice.customerSnapshot,sourceCustomerId:'qa-treatment-customer',companyNameEn:'Synthetic QA'};
 invoice.items=[{...invoice.items[0],quantity:'1',unitPrice:price,descriptionEn:'Synthetic service'}];
 invoice.adjustments={...invoice.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:true,taxPercent:tax};
 return invoice;
}
const options=(mode='invoice-tax',reason='Agreed price reduction')=>({mode,reason});
test('taxable partial credit splits gross 60 into net 50 and VAT 10, leaving zero receivable and VAT 10',()=>{
 const invoice=fixture(),before=JSON.stringify(invoice);
 const payment=normalizePaymentRecord(invoice,[],{id:'qa-receipt',amount:'60',date:'2026-10-01',method:'cash',reference:'QA',notes:''},[invoice]);
 const draft=createCreditNoteDraft(invoice,'CN-QA-TAX','60',options());
 assert.equal(draft.status,'draft');
 assert.equal(draft.adjustments.taxEnabled,true);
 assert.deepEqual(calculateTotals(draft.items,draft.adjustments),{subtotal:'50.00',discount:'0.00',shipping:'0.00',otherCharges:'0.00',tax:'10.00',grandTotal:'60.00'});
 const credit={...draft,status:'final',issueDate:'2026-10-02'};
 assertDocumentLifecycleInvariant(credit,[invoice,credit],[payment]);
 assert.equal(invoicePaymentSummary(invoice,[payment],'2026-10-31',[invoice,credit]).remaining,'0.00');
 assert.equal(outputVatReport([invoice,credit],'2026-10-01','2026-10-31').currencies[0].outputVat,'10.00');
 assert.match(credit.terms.remarks,/Agreed price reduction/);
 assert.equal(JSON.stringify(invoice),before);
 const restored=JSON.parse(JSON.stringify(credit));
 assert.equal(outputVatReport([invoice,restored],'2026-10-01','2026-10-31').currencies[0].outputVat,'10.00');
 const voided={...restored,lifecycleStatus:'voided'};
 assert.equal(outputVatReport([invoice,voided],'2026-10-01','2026-10-31').currencies[0].outputVat,'20.00');
});
test('explicit keep-VAT treatment preserves gross and source VAT for full as well as partial credits',()=>{
 const invoice=fixture();
 for(const amount of ['60','120']){
  const credit={...createCreditNoteDraft(invoice,'CN-QA-KEEP',amount,options('keep-vat','Approved financial adjustment')),status:'final',issueDate:'2026-10-02'};
  assert.equal(credit.adjustments.taxEnabled,false);
  assert.equal(calculateTotals(credit.items,credit.adjustments).grandTotal,amount+'.00');
  assert.equal(outputVatReport([invoice,credit],'2026-10-01','2026-10-31').currencies[0].outputVat,'20.00');
  assert.match(credit.terms.remarks,/Approved financial adjustment/);
 }
});
test('full invoice-tax credit retains original lines, discount, shipping and tax',()=>{
 const invoice=fixture();invoice.adjustments={...invoice.adjustments,discountEnabled:true,discountMode:'percent',discountValue:'10',shippingEnabled:true,shipping:'10'};
 const before=JSON.stringify(invoice);
 const credit=createCreditNoteDraft(invoice,'CN-QA-FULL','120',options());
 assert.equal(calculateTotals(credit.items,credit.adjustments).tax,'20.00');
 assert.equal(credit.items[0].unitPrice,'100');
 assert.equal(credit.adjustments.discountEnabled,true);
 assert.equal(JSON.stringify(invoice),before);
});
test('zero-rate and tax-disabled sources do not invent VAT',()=>{
 for(const enabled of [true,false]){
  const invoice=fixture(enabled?'0':'20');invoice.adjustments.taxEnabled=enabled;
  const credit=createCreditNoteDraft(invoice,'CN-QA-ZERO','50',options());
  assert.equal(calculateTotals(credit.items,credit.adjustments).tax,'0.00');
  assert.equal(calculateTotals(credit.items,credit.adjustments).grandTotal,'50.00');
 }
});
test('explicit treatment requires valid mode, reason and positive amount within original total',()=>{
 const invoice=fixture();
 for(const value of [{mode:'invalid',reason:'QA'},options('invoice-tax',''),options('keep-vat',' ')]){
  assert.throws(()=>createCreditNoteDraft(invoice,'CN-QA-INVALID','60',value));
 }
 for(const amount of ['0','-1','121','bad','0.001']){
  assert.throws(()=>createCreditNoteDraft(invoice,'CN-QA-AMOUNT',amount,options()));
 }
});
test('rounding never silently increases or decreases requested gross credit',()=>{
 const invoice=fixture('20','1');
 const credit=createCreditNoteDraft(invoice,'CN-QA-CENTS','0.01',options());
 assert.equal(calculateTotals(credit.items,credit.adjustments).grandTotal,'0.01');
 const impossible=fixture('100','1');
 assert.throws(()=>createCreditNoteDraft(impossible,'CN-QA-UNREPRESENTABLE','0.01',options()),/round|represent/i);
});
test('legacy creation without explicit treatment retains existing saved-workflow semantics',()=>{
 const invoice=fixture(),credit=createCreditNoteDraft(invoice,'CN-QA-LEGACY','60');
 assert.equal(credit.adjustments.taxEnabled,false);
 assert.equal(calculateTotals(credit.items,credit.adjustments).grandTotal,'60.00');
});
