import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTotals, decimalToScaled, formatMoney, isDecimalInput, isFinancialDecimalInput, lineTotal, normalizeDecimalInput } from '../dist/src/lib/money.js';
import { createBlankDocument, validateDocument, validateStoredFinalForOutput } from '../dist/src/lib/documents.js';
import { customerSnapshotFrom, defaultCompany } from '../dist/src/lib/defaults.js';
import { getDocumentReadiness } from '../dist/src/lib/readiness.js';
import { invoicePaymentSummary, normalizePaymentRecord } from '../dist/src/lib/payments.js';
import { receivablesByCurrency, customerStatement } from '../dist/src/lib/receivables.js';

function validDocument(){
  const doc=createBlankDocument('invoice','INV-2026-0001',defaultCompany());
  doc.customerSnapshot=customerSnapshotFrom({id:'c1',companyNameEn:'Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});
  doc.items[0].descriptionEn='Product';
  doc.items[0].quantity='1';
  doc.items[0].unitPrice='10';
  return doc;
}

test('readiness is not 100 percent when a financial field fails issue validation',()=>{
  const invalidPrice=validDocument();
  invalidPrice.items[0].unitPrice='1,2.00';
  assert.ok(validateDocument(invalidPrice)['item-0-price']);
  const priceReadiness=getDocumentReadiness(invalidPrice);
  assert.equal(priceReadiness.ready,false);
  assert.ok(priceReadiness.percent<100);
  assert.equal(priceReadiness.groups.find(group=>group.key==='pricing')?.complete,false);

  const invalidQuantity=validDocument();
  invalidQuantity.items[0].quantity='1.2,00';
  assert.ok(validateDocument(invalidQuantity)['item-0-quantity']);
  const quantityReadiness=getDocumentReadiness(invalidQuantity);
  assert.equal(quantityReadiness.ready,false);
  assert.ok(quantityReadiness.percent<100);
  assert.equal(quantityReadiness.groups.find(group=>group.key==='items')?.complete,false);
});

test('malformed mixed thousands separators cannot silently change financial inputs',()=>{
  for(const input of ['1,2.00','1.2,00','12,34.56','12.34,56',',123.45','.123,45','1234,567.89','1,,234.56','1..234,56']){
    assert.equal(isFinancialDecimalInput(input),false,input);
    const doc=validDocument();
    doc.items[0].unitPrice=input;
    assert.ok(validateDocument(doc)['item-0-price'],input);
    doc.items[0].unitPrice='10';
    doc.items[0].quantity=input;
    assert.ok(validateDocument(doc)['item-0-quantity'],input);
    doc.items[0].quantity='1';
    Object.assign(doc.adjustments,{discountEnabled:true,discountValue:input,shippingEnabled:true,shipping:input,otherChargesEnabled:true,otherCharges:input,taxEnabled:true,taxPercent:input});
    const errors=validateDocument(doc);
    for(const field of ['discount','shipping','otherCharges','tax'])assert.ok(errors[field],`${input}: ${field}`);
  }
});

test('legacy malformed saved amounts retain their financial meaning without rewriting records',()=>{
  const doc=validDocument();
  doc.status='final';doc.issueDate='2026-01-01';doc.dueDate='2026-12-31';
  doc.items[0].unitPrice='1,2.00';
  const payment={id:'legacy-payment',invoiceId:doc.id,customerId:'c1',currency:doc.currency,amount:'1,0.00',date:'2026-01-02',method:'cash'};
  const snapshot=JSON.stringify({doc,payment});
  assert.equal(calculateTotals(doc.items,doc.adjustments).grandTotal,'12.00');
  const summary=invoicePaymentSummary(doc,[payment],'2026-10-19',[doc]);
  assert.equal(summary.paid,'10.00');assert.equal(summary.remaining,'2.00');
  assert.equal(receivablesByCurrency([doc],[payment],'2026-10-19')[0].outstanding,'2.00');
  assert.equal(customerStatement('c1',[doc],[payment],'2026-10-19')[0].entries.at(-1).balance,'2.00');
  assert.equal(JSON.stringify({doc,payment}),snapshot);
  assert.throws(()=>normalizePaymentRecord(doc,[payment],{...payment,id:'new-payment',amount:'1,0.00'},[doc]),/Payment amount/);
  const valid=normalizePaymentRecord(doc,[payment],{...payment,id:'new-payment',amount:'2.00'},[doc]);
  assert.equal(valid.amount,'2.00');
  assert.equal(invoicePaymentSummary(doc,[payment,valid],'2026-10-19',[doc]).remaining,'0.00');
});


test('persisted final output keeps historical money readable but never relaxes new or changed inputs',()=>{
  const final=validDocument();
  final.status='final';
  final.issueDate='2026-01-01';
  final.dueDate='2026-12-31';
  final.items[0].unitPrice='1,2.00';
  const stored=structuredClone(final);
  const before=JSON.stringify({final,stored});
  assert.ok(validateDocument(final)['item-0-price'],'new issuance stays strict even if status is final');
  assert.deepEqual(validateStoredFinalForOutput(final,stored),{},'unaltered persisted final remains eligible for output');
  assert.equal(calculateTotals(final.items,final.adjustments).grandTotal,'12.00');
  assert.equal(JSON.stringify({final,stored}),before,'no historical value is rewritten');

  const newFinal=structuredClone(final);
  newFinal.id='another-document';
  assert.ok(validateStoredFinalForOutput(newFinal,stored)['item-0-price'],'a different document cannot borrow output compatibility');
  assert.ok(validateStoredFinalForOutput({...final,status:'draft'},stored)['item-0-price'],'drafts remain strict');
  assert.ok(validateStoredFinalForOutput(final)['item-0-price'],'unsaved final remains strict');

  const changedCurrency=structuredClone(final);
  changedCurrency.currency='EUR';
  assert.ok(validateStoredFinalForOutput(changedCurrency,stored)['item-0-price'],'changed currency cannot borrow historical output compatibility');
  const changedDate=structuredClone(final);
  changedDate.issueDate='2026-02-01';
  assert.ok(validateStoredFinalForOutput(changedDate,stored)['item-0-price'],'changed issue date cannot borrow historical output compatibility');
  const changedNumber=structuredClone(final);
  changedNumber.number='INV-REWRITTEN';
  assert.ok(validateStoredFinalForOutput(changedNumber,stored)['item-0-price'],'changed document identity cannot borrow historical output compatibility');
  const tampered=structuredClone(final);
  tampered.items[0].unitPrice='1,3.00';
  assert.ok(validateStoredFinalForOutput(tampered,stored)['item-0-price'],'changed money fields remain strict');
  const changedCharges=structuredClone(final);
  changedCharges.adjustments.shippingEnabled=true;
  changedCharges.adjustments.shipping='1,3.00';
  assert.ok(validateStoredFinalForOutput(changedCharges,stored).shipping,'changed adjustments remain strict');
  const notNumeric=structuredClone(final);
  notNumeric.items[0].unitPrice='NaN';
  const persistedInvalid=structuredClone(notNumeric);
  assert.ok(validateStoredFinalForOutput(notNumeric,persistedInvalid)['item-0-price'],'invalid historic values do not become valid money');
});

test('both application and document-editor output gates preserve stored-final compatibility',async()=>{
  const {readFile}=await import('node:fs/promises');
  const app=await readFile('src/app/App.tsx','utf8');
  const editor=await readFile('src/components/EditorPageCore.tsx','utf8');
  assert.match(app,/private requestPrint=async[\s\S]*?validateStoredFinalForOutput\(doc,vault\.documents\.find/);
  assert.match(editor,/private validateCurrent=\(\):boolean=>\{\s*const errors=validateStoredFinalForOutput\(this\.state\.doc/);
  assert.match(editor,/private save=async\(auto=false\)=>\{[\s\S]*?const errors=validateDocument\(snapshot\)/,'document saving still has strict validation');
});

test('valid international grouping preserves totals and existing decimal-comma policy',()=>{
  for(const input of ['1,234,567.89','1.234.567,89','١٬٢٣٤٬٥٦٧٫٨٩','۱٬۲۳۴٬۵۶۷٫۸۹']){
    assert.equal(isDecimalInput(input),true,input);
    assert.equal(isFinancialDecimalInput(input),true,input);
    assert.equal(decimalToScaled(input,2),123456789n,input);
    assert.equal(lineTotal('2',input),'2469135.78',input);
  }
  assert.equal(decimalToScaled('1,234',4),12340n);
  assert.equal(decimalToScaled('12,5',2),1250n);
  assert.equal(decimalToScaled('-1.234,56',2),-123456n);
});

test('fixed-precision parser rounds excess decimals instead of silently truncating them',()=>{
  assert.equal(decimalToScaled('1.005',2),101n);
  assert.equal(decimalToScaled('1.004',2),100n);
  assert.equal(decimalToScaled('-1.005',2),-101n);
  assert.equal(lineTotal('1','1.005'),'1.01');
});

test('financial validation accepts the same decimal grammar used by calculations',()=>{
  assert.equal(isDecimalInput('100.25'),true);
  assert.equal(isDecimalInput('.5'),true);
  assert.equal(isDecimalInput('1e2'),false);
  assert.equal(isDecimalInput('Infinity'),false);
  assert.equal(isDecimalInput('NaN'),false);

  const doc=validDocument();
  doc.items[0].quantity='1e2';
  assert.ok(validateDocument(doc)['item-0-quantity']);
  doc.items[0].quantity='1';
  doc.items[0].unitPrice='1e2';
  assert.ok(validateDocument(doc)['item-0-price']);
  doc.items[0].unitPrice='10';
  doc.adjustments.shippingEnabled=true;
  doc.adjustments.shipping='1e2';
  assert.ok(validateDocument(doc).shipping);
});

test('high-rate tax percentages remain supported while negative tax is rejected',()=>{
  const doc=validDocument();
  doc.adjustments.taxEnabled=true;
  doc.adjustments.taxPercent='150';
  assert.equal(validateDocument(doc).tax,undefined);
  doc.adjustments.taxPercent='-1';
  assert.equal(validateDocument(doc).tax,'Tax must be 0 or greater.');
});

test('quantities that round to zero at engine precision are rejected',()=>{
  const doc=validDocument();
  doc.items[0].quantity='0.00001';
  assert.ok(validateDocument(doc)['item-0-quantity']);
});

test('money formatting does not collapse very large fixed-precision values to zero',()=>{
  const huge='1234567890123456789012345678901234567890.12';
  assert.equal(formatMoney(huge,'USD'),'1,234,567,890,123,456,789,012,345,678,901,234,567,890.12 USD');
  assert.equal(formatMoney('-1000.5','EUR'),'-1,000.50 EUR');
});

test('Arabic-Indic and Eastern Arabic digits use the same fixed-precision financial engine',()=>{
  assert.equal(normalizeDecimalInput('١٢٣٫٤٥'),'123.45');
  assert.equal(normalizeDecimalInput('۱۲۳٫۴۵'),'123.45');
  assert.equal(decimalToScaled('١٬٢٣٤٫٥٦',2),123456n);
  assert.equal(decimalToScaled('۱٬۲۳۴٫۵۶',2),123456n);
  assert.equal(lineTotal('٢٫٥','٤٫٢٠'),'10.50');
  assert.equal(isDecimalInput('١٢٬٣٤'),false,'malformed Arabic thousands grouping must remain invalid');
});

test('localized digits flow through discount shipping and tax totals without numeric drift',()=>{
  const totals=calculateTotals(
    [{quantity:'٢',unitPrice:'١٠'}],
    {discountEnabled:true,discountMode:'percent',discountValue:'١٠',shippingEnabled:true,shipping:'٥',otherChargesEnabled:false,otherCharges:'٠',taxEnabled:true,taxPercent:'١٥'}
  );
  assert.deepEqual(totals,{subtotal:'20.00',discount:'2.00',shipping:'5.00',otherCharges:'0.00',tax:'3.45',grandTotal:'26.45'});
});
