import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {calculateTotals} from '../dist/src/lib/money.js';
import {createCreditNoteDraft,assertDocumentLifecycleInvariant,invoiceCreditCapacity} from '../dist/src/lib/document-lifecycle.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {outputVatReport} from '../dist/src/lib/tax-vat.js';
import {receivablesByCurrency,customerStatement} from '../dist/src/lib/receivables.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function invoice(id='qa26-usd',currency='USD',tax='20',price='100',date='2026-10-05'){
  const doc=createBlankDocument('invoice','INV-'+id,emptyVault().company);
  Object.assign(doc,{id,status:'final',issueDate:date,dueDate:'2026-12-05',
    currency,workspaceId:'default',branchId:'main'});
  doc.customerSnapshot={...doc.customerSnapshot,sourceCustomerId:'buyer-26-27',
    companyNameEn:'Synthetic VAT Buyer',companyNameAr:'',};
  doc.items=[{...doc.items[0],descriptionEn:'Synthetic service',
    quantity:'1',unitPrice:price}];
  doc.adjustments={...doc.adjustments,
    discountEnabled:false,discountMode:'fixed',discountValue:'0',
    shippingEnabled:false,shipping:'0',otherChargesEnabled:false,otherCharges:'0',
    taxEnabled:true,taxPercent:tax};
  return doc;
}
const treatment=(mode='invoice-tax')=>({mode,reason:'Synthetic QA contract adjustment'});
function credit(source,id,amount,mode='invoice-tax',date='2026-11-03'){
  const draft=createCreditNoteDraft(source,'CN-'+id,amount,treatment(mode));
  const issued={...draft,id,status:'final',issueDate:date};
  return issued;
}
function outputs(docs,from,to){
  const result=outputVatReport(docs,from,to);
  assert.equal(result.inputVatSupported,false);
  return result;
}

test('26-27: October invoice vs November tax-treated credit affect only their respective Output VAT periods',()=>{
  const source=invoice();
  const before=JSON.stringify(source);
  const draft=createCreditNoteDraft(source,'CN-26-DRAFT','60',treatment());
  assert.equal(draft.status,'draft');
  const settled={...draft,id:'qa26-nov-credit',status:'final',issueDate:'2026-11-03'};
  assertDocumentLifecycleInvariant(settled,[source,settled],[]);
  const docs=[source,settled];
  const october=outputs(docs,'2026-10-01','2026-10-31');
  const november=outputs(docs,'2026-11-01','2026-11-30');
  assert.equal(october.rows.length,1);
  assert.equal(october.rows[0].documentId,source.id);
  assert.deepEqual([october.currencies[0].taxableAmount,october.currencies[0].outputVat],
    ['100.00','20.00']);
  assert.equal(november.rows.length,1);
  assert.equal(november.rows[0].documentId,settled.id);
  assert.deepEqual([november.rows[0].taxableAmount,november.rows[0].outputVat,november.rows[0].grandTotal],
    ['-50.00','-10.00','-60.00']);
  assert.equal(invoicePaymentSummary(source,[],'2026-10-31',docs).remaining,'120.00');
  assert.equal(invoicePaymentSummary(source,[],'2026-11-03',docs).remaining,'60.00');
  assert.equal(JSON.stringify(source),before,'source invoice is immutable');
});

test('26-27: payment plus later credit reconcile exactly across AR, customer statement, and VAT',()=>{
  const source=invoice(),payment=normalizePaymentRecord(source,[],{
    id:'qa26-receipt',amount:'20.00',date:'2026-10-10',
    method:'bank-transfer',reference:'QA-RECEIPT-20',notes:''
  },[source]);
  const note=credit(source,'qa27-credit','60','invoice-tax','2026-11-03');
  assertDocumentLifecycleInvariant(note,[source,note],[payment]);
  const docs=[source,note],payments=[payment];
  assert.equal(invoicePaymentSummary(source,payments,'2026-10-31',docs).remaining,'100.00');
  assert.equal(invoicePaymentSummary(source,payments,'2026-11-30',docs).remaining,'40.00');
  assert.equal(receivablesByCurrency(docs,payments,'2026-10-31')[0].outstanding,'100.00');
  assert.equal(receivablesByCurrency(docs,payments,'2026-11-30')[0].outstanding,'40.00');
  const ledger=customerStatement('buyer-26-27',docs,payments,'2026-11-30')[0];
  assert.deepEqual(ledger.entries.map(entry=>entry.type),['invoice','payment','credit-note']);
  assert.equal(ledger.entries.at(-1)?.balance,'40.00');
  assert.deepEqual([outputs(docs,'2026-10-01','2026-10-31').currencies[0].outputVat,
    outputs(docs,'2026-11-01','2026-11-30').currencies[0].outputVat],['20.00','-10.00']);
  assert.equal(invoiceCreditCapacity(source,docs,payments).available,'40.00');
});

test('27: explicit keep-VAT credit reduces customer AR but preserves original Output VAT',()=>{
  const source=invoice(),note=credit(source,'qa27-keep','60','keep-vat','2026-11-03');
  assertDocumentLifecycleInvariant(note,[source,note],[]);
  assert.equal(note.adjustments.taxEnabled,false);
  assert.equal(calculateTotals(note.items,note.adjustments).grandTotal,'60.00');
  const report=outputs([source,note],'2026-10-01','2026-11-30');
  assert.deepEqual(report.rows.map(row=>row.documentId),[source.id],
    'no tax-disabled keep-VAT credit appears as a taxable reduction');
  assert.equal(report.currencies[0].outputVat,'20.00');
  assert.equal(invoicePaymentSummary(source,[],'2026-11-30',[source,note]).remaining,'60.00');
  assert.match(note.terms.remarks,/VAT treatment: unchanged VAT/);
});

test('27: full invoice-tax credit exactly reverses original discount, shipping and tax totals',()=>{
  const source=invoice();
  source.adjustments={...source.adjustments,
    discountEnabled:true,discountMode:'fixed',discountValue:'10.00',
    shippingEnabled:true,shipping:'10.00'};
  assert.equal(calculateTotals(source.items,source.adjustments).grandTotal,'120.00');
  const before=JSON.stringify(source);
  const note=credit(source,'qa27-full','120','invoice-tax','2026-11-03');
  assertDocumentLifecycleInvariant(note,[source,note],[]);
  assert.deepEqual(calculateTotals(note.items,note.adjustments),
    calculateTotals(source.items,source.adjustments));
  assert.equal(note.adjustments.discountValue,'10.00');
  assert.equal(note.adjustments.shipping,'10.00');
  assert.equal(invoicePaymentSummary(source,[],'2026-11-30',[source,note]).remaining,'0.00');
  assert.equal(outputs([source,note],'2026-10-01','2026-11-30').currencies[0].outputVat,'0.00');
  assert.equal(JSON.stringify(source),before);
});

test('27: over-credit, cross-currency, wrong-customer and predated credit are rejected before issue',()=>{
  const source=invoice();
  const payment=normalizePaymentRecord(source,[],{
    id:'qa27-paid80',amount:'80',date:'2026-10-10',method:'cash',reference:'',notes:''
  },[source]);
  const aboveBalance=credit(source,'qa27-too-much','60');
  assert.throws(()=>assertDocumentLifecycleInvariant(aboveBalance,[source,aboveBalance],[payment]),
    /cannot exceed the remaining invoice balance/i);
  const valid=credit(source,'qa27-valid','40');
  assert.doesNotThrow(()=>assertDocumentLifecycleInvariant(valid,[source,valid],[payment]));
  const wrongCurrency={...valid,currency:'EUR'};
  assert.throws(()=>assertDocumentLifecycleInvariant(wrongCurrency,[source,wrongCurrency],[payment]),/currency must match/i);
  const wrongCustomer={...valid,customerSnapshot:{...valid.customerSnapshot,sourceCustomerId:'other-buyer'}};
  assert.throws(()=>assertDocumentLifecycleInvariant(wrongCustomer,[source,wrongCustomer],[payment]),/customer must match/i);
  const beforeInvoice={...valid,issueDate:'2026-10-01'};
  assert.throws(()=>assertDocumentLifecycleInvariant(beforeInvoice,[source,beforeInvoice],[payment]),/cannot be before/i);
  assert.equal(outputs([source,wrongCurrency,wrongCustomer,beforeInvoice],'2026-10-01','2026-11-30').rows.length,1,
    'malformed historical credit notes do not contaminate Output VAT selection');
});

test('26-27: voided, draft, proforma and unlinked credits never enter Output VAT ledger',()=>{
  const source=invoice(),draft=createCreditNoteDraft(source,'CN-27-DRAFT','60',treatment());
  const voided={...credit(source,'qa27-voided','60'),lifecycleStatus:'voided'};
  const unlinked={...credit(source,'qa27-unlinked','60'),creditForId:'different-invoice'};
  const proforma={...source,id:'qa26-quote',kind:'proforma'};
  const result=outputs([source,draft,voided,unlinked,proforma],'2026-10-01','2026-11-30');
  assert.deepEqual(result.rows.map(x=>x.documentId),[source.id]);
  assert.equal(result.currencies[0].outputVat,'20.00');
  assert.equal(result.currencies[0].documents,1);
  assert.equal(result.currencies[0].creditNotes,0);
});

test('26: distinct USD/EUR tax rates and credit VAT never mix FX into original sales documents',()=>{
  const usd=invoice('qa26-multi-usd','USD','20','100');
  const eur=invoice('qa26-multi-eur','EUR','10','200');
  const eurNote=credit(eur,'qa27-eur-credit','110','invoice-tax','2026-11-03');
  assertDocumentLifecycleInvariant(eurNote,[eur,eurNote],[]);
  const docs=[usd,eur,eurNote],source=JSON.stringify(docs);
  const report=outputs(docs,'2026-10-01','2026-11-30');
  assert.deepEqual(report.currencies.map(x=>x.currency),['EUR','USD']);
  assert.deepEqual(report.currencies.map(x=>[x.currency,x.outputVat,x.invoiceVat,x.creditVat]),
    [['EUR','10.00','20.00','-10.00'],['USD','20.00','20.00','0.00']]);
  assert.deepEqual(report.currencies.map(x=>x.rates.map(r=>r.taxRate)),[['10'],['20']]);
  const ar=receivablesByCurrency(docs,[],'2026-11-30');
  assert.deepEqual(ar.map(x=>[x.currency,x.outstanding]),[['EUR','110.00'],['USD','120.00']]);
  assert.equal(JSON.stringify(docs),source,'report aggregation does not revalue input data');
});
