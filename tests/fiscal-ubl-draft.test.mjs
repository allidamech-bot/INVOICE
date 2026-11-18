import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDomesticStandardInvoiceCandidate} from '../api/_fiscal/ubl-draft.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../dist/src/lib/fiscal-issuance.js';

const party={country:'SA',vatNumber:'300000000000003',crn:'1000000000',building:'1234',postal:'12345',street:'شارع اختبار',district:'حي اختبار',city:'الرياض',name:'شركة & اختبار'};
const line={id:'qa-line',name:'عبوة <اختبار>',quantity:'2',unitNetPrice:'50',unitCode:'PCE',category:'S',rate:'15'};
const input={currency:'SAR',mode:'standard',kind:'invoice',uuid:'11111111-1111-4111-8111-111111111111',icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,number:'QA-1',issueDate:'2026-11-18',issueTime:'10:00:00',supplyDate:'2026-11-18',paymentMeans:'30',seller:party,buyer:{...party,name:'مشتري اختبار',vatNumber:'311111111111113'},lines:[line]};
test('XML candidate includes shared tax engine totals and correct standard type',()=>{
  const out=buildDomesticStandardInvoiceCandidate(input),xml=out.bytes.toString('utf8');
  assert.equal(out.status,'unsigned-candidate');
  assert.equal(out.totals.taxExclusiveTotal,'100.00');
  assert.equal(out.totals.vatTotal,'15.00');
  assert.equal(out.totals.taxInclusiveTotal,'115.00');
  assert.match(xml,/<cbc:InvoiceTypeCode name="0100000">388<\/cbc:InvoiceTypeCode>/);
  assert.match(xml,/<cbc:PayableAmount currencyID="SAR">115.00<\/cbc:PayableAmount>/);
  assert.match(xml,/<cbc:ID>ICV<\/cbc:ID><cbc:UUID>1<\/cbc:UUID>/);
  assert.ok(xml.includes(FIRST_PREVIOUS_INVOICE_HASH));
  assert.match(xml,/<cbc:Name>عبوة &lt;اختبار&gt;<\/cbc:Name>/);
  assert.ok(xml.includes('شركة &amp; اختبار'));
  assert.doesNotMatch(xml,/SignatureValue|<cbc:ID>QR<\/cbc:ID>/);
});
test('unsupported fiscal scenarios are rejected rather than silently dropped',()=>{
  for(const patch of [{mode:'simplified'},{kind:'credit-note'},{currency:'USD'},{discount:'10.00'},{prepaid:'10.00'},{adjustments:[]},{paymentMeans:undefined},{supplyDate:'2026-11-19'},{issueDate:'2026-02-30'},{issueTime:'25:00:00'},{previousInvoiceHash:'invalid'},{buyer:{...input.buyer,country:'TR'}}])
    assert.throws(()=>buildDomesticStandardInvoiceCandidate({...input,...patch}));
  for(const patch of [{allowance:'1.00'},{rate:'0'},{category:'Z'},{quantity:'0'},{unitCode:'"><x>'},{name:'bad\u0000text'},{unknown:'ignored'}])
    assert.throws(()=>buildDomesticStandardInvoiceCandidate({...input,lines:[{...line,...patch}]}));
});
test('subsequent invoice chain, multiple lines and immutable caller inputs',()=>{
  const request=Object.freeze({...input,icv:'2',previousInvoiceHash:Buffer.alloc(32,1).toString('base64'),lines:Object.freeze([Object.freeze(line),Object.freeze({...line,id:'qa-line2',quantity:'1',unitNetPrice:'25'})])});
  const a=buildDomesticStandardInvoiceCandidate(request),b=buildDomesticStandardInvoiceCandidate(request);
  assert.deepEqual(a,b);assert.equal(a.totals.taxInclusiveTotal,'143.75');assert.equal(request.lines.length,2);
  assert.throws(()=>buildDomesticStandardInvoiceCandidate({...request,lines:[line,line]}));
});
