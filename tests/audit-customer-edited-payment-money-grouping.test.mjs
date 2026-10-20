import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(amount='40.00'){
  const base=emptyVault();
  const invoice=createBlankDocument('invoice','INV-2026-EDIT-MONEY',base.company);
  invoice.id='invoice-edit-money';invoice.status='final';invoice.lifecycleStatus='active';
  invoice.role='standard';invoice.issueDate='2026-10-01';invoice.dueDate='2026-11-01';
  invoice.customerSnapshot={sourceCustomerId:'buyer-edit-money',companyNameEn:'Buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
    vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],descriptionEn:'Service',quantity:'1',unitPrice:'200.00'}];
  const payment={id:'customer-receipt-edit-money',invoiceId:invoice.id,invoiceNumber:invoice.number,
    customerId:'buyer-edit-money',customerNameEn:'Buyer',customerNameAr:'',
    currency:invoice.currency,amount,date:'2026-10-02',method:'cash',
    reference:'ORIGINAL-RECEIPT',notes:'',createdAt:'2026-10-02T09:00:00.000Z',
    updatedAt:'2026-10-02T09:00:00.000Z'};
  return {base:{...base,documents:[invoice],payments:[payment]},invoice,payment};
}
const localExpense=(base)=>({...base,expenses:[{...createExpense('USD'),description:'Office',amount:'10.00'}]});

test('changed existing customer payment amounts reject malformed monetary grouping at vault authority',()=>{
  const {base,payment}=fixture(),original=JSON.stringify(base);
  for(const amount of ['1,2.00','12,34.56','1.2,00','١,٢.٠٠']){
    const changed={...payment,amount,updatedAt:'2026-10-03T09:00:00.000Z'};
    assert.throws(()=>mergeVaultIntent(base,{...base,payments:[changed]},base),
      /customer payment amount.*invalid monetary grouping/i,amount);
    assert.equal(JSON.stringify(base),original);
  }
});

test('remote changed customer payment amounts obey the same grouping rule on unrelated local save',()=>{
  const {base,payment}=fixture(),before=JSON.stringify(base);
  const remote={...base,payments:[{...payment,amount:'1,2.00',
    updatedAt:'2026-10-03T09:00:00.000Z'}]};
  assert.throws(()=>mergeVaultIntent(base,localExpense(base),remote),
    /customer payment amount.*invalid monetary grouping/i);
  assert.equal(JSON.stringify(base),before);
});

test('valid customer payment correction preserves invoiced and paid arithmetic',()=>{
  const {base,payment,invoice}=fixture();
  const corrected={...payment,amount:'1,25.00'};
  assert.throws(()=>mergeVaultIntent(base,{...base,payments:[corrected]},base),
    /customer payment amount.*invalid monetary grouping/i);
  const legit={...payment,amount:'125.00',reference:'CORRECTED-RECEIPT'};
  const accepted=mergeVaultIntent(base,{...base,payments:[legit]},base);
  assert.equal(invoicePaymentSummary(invoice,accepted.payments,'2026-10-20',accepted.documents).paid,'125.00');
  assert.equal(invoicePaymentSummary(invoice,accepted.payments,'2026-10-20',accepted.documents).remaining,'75.00');
});

test('historic customer payment money spelling remains unchanged during reference edits and cloud replays',()=>{
  const {base,payment,invoice}=fixture('1,2.00'),prior=JSON.stringify(base);
  const correctedNote={...payment,reference:'Additional bank reference'};
  const intended={...base,payments:[correctedNote]};
  const merged=mergeVaultIntent(base,intended,structuredClone(base));
  assert.equal(merged.payments[0].amount,'1,2.00');
  assert.equal(merged.payments[0].reference,'Additional bank reference');
  assert.equal(invoicePaymentSummary(invoice,merged.payments,'2026-10-20',merged.documents).paid,'12.00');
  assert.equal(JSON.stringify(base),prior,'existing historical amount is never converted or modified');
});
