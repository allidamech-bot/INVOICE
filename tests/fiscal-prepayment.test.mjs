import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePrepayment as resolve} from '../api/_fiscal/prepayment.js';
const invoice={uuid:'11111111-1111-4111-8111-111111111111',number:'FINAL',kind:'invoice',mode:'standard',currency:'SAR',issueDate:'2026-11-18',issueTime:'10:00:00',seller:{vatNumber:'300000000000003'},buyer:{vatNumber:'311111111111113'}};
const totals={taxInclusiveTotal:'230.00'};
const ref={uuid:'22222222-2222-4222-8222-222222222222',number:'ADV',issueDate:'2026-11-17',issueTime:'10:00:00',typeCode:'386',currency:'SAR',mode:'standard',status:'cleared',sellerVat:invoice.seller.vatNumber,buyerVat:invoice.buyer.vatNumber,artifactDigest:'a'.repeat(64),category:'S',rate:'15',net:'86.96',vat:'13.04',remainingNet:'86.96',remainingVat:'13.04'};
const ctx=(...references)=>({kind:'adjustment',uuid:invoice.uuid,references});
test('advance receipt is explicit and matches actual received gross',()=>{
  const receipt={kind:'receipt',uuid:invoice.uuid,receivedAt:invoice.issueDate,receivedGross:'230.00',evidenceDigest:'b'.repeat(64)},advance={...invoice,kind:'prepayment'};
  assert.equal(resolve(advance,totals,receipt).kind,'receipt');
  assert.throws(()=>resolve(advance,totals));assert.throws(()=>resolve(advance,totals,{...receipt,receivedGross:'229.99'}));
  assert.throws(()=>resolve({...advance,supplyDate:invoice.issueDate},totals,receipt));
  assert.equal(resolve(invoice,totals),null);
});
test('settlement reconciles without changing gross or counting previous VAT as new supply',()=>{
  const out=resolve(invoice,totals,ctx(ref));assert.equal(out.prepaid,'100.00');assert.equal(out.payable,'130.00');assert.equal(totals.taxInclusiveTotal,'230.00');
  const exempt={...ref,category:'E',rate:'0',net:'40.00',vat:'0.00',remainingNet:'40.00',remainingVat:'0.00'};
  assert.equal(resolve(invoice,totals,ctx(ref,exempt)).payable,'90.00');
  const historic={...ref,rate:'5',net:'20.00',vat:'1.00',remainingNet:'20.00',remainingVat:'1.00'};
  assert.equal(resolve(invoice,totals,ctx(ref,historic)).prepaid,'121.00');
});
test('duplicate, cross-party, unaccepted, inconsistent or overdrawn references fail closed',()=>{
  for(const patch of [{uuid:invoice.uuid},{number:invoice.number},{sellerVat:'other'},{buyerVat:'other'},{currency:'USD'},{typeCode:'388'},{status:'uncertain'},{artifactDigest:'bad'},{issueDate:'2026-11-19'},{issueDate:'2026-11-31'},{issueTime:'25:00:00'},{vat:'13.05'},{remainingNet:'80.00'},{rate:'10'},{net:'0.00'},{unexpected:true}])assert.throws(()=>resolve(invoice,totals,ctx({...ref,...patch})));
  assert.throws(()=>resolve(invoice,totals,ctx(ref,ref)));
  assert.throws(()=>resolve(invoice,totals,ctx(ref,{...ref,category:'E',rate:'0',number:'OTHER',net:'1.00',vat:'0.00',remainingVat:'0.00'})));
  assert.throws(()=>resolve(invoice,{taxInclusiveTotal:'99.99'},ctx(ref)));
  assert.throws(()=>resolve({...invoice,buyer:null},totals,ctx(ref)));
  assert.throws(()=>resolve({...invoice,kind:'credit-note'},totals,ctx(ref)));
});
