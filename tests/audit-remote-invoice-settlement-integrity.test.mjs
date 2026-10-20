import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const base=emptyVault();
  const invoice=createBlankDocument('invoice','INV-2026-REMOTE-LOSS',base.company);
  invoice.id='invoice-financial-remote-loss';invoice.status='final';
  invoice.lifecycleStatus='active';invoice.role='standard';
  invoice.issueDate='2026-10-01';invoice.dueDate='2026-11-01';
  invoice.customerSnapshot={sourceCustomerId:'cust-financial-remote-loss',companyNameEn:'Customer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
    vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],descriptionEn:'Consulting service',quantity:'1',unitPrice:'100.00'}];
  const payment={id:'payment-financial-remote-loss',invoiceId:invoice.id,invoiceNumber:invoice.number,
    customerId:'cust-financial-remote-loss',customerNameEn:'Customer',customerNameAr:'',
    currency:invoice.currency,amount:'40.00',date:'2026-10-02',method:'bank-transfer',
    reference:'B-40',notes:'',createdAt:'2026-10-02T09:00:00.000Z',
    updatedAt:'2026-10-02T09:00:00.000Z'};
  return {base:{...base,documents:[invoice],payments:[payment]},invoice,payment};
}
function localExpense(base){
  return {...base,expenses:[{...createExpense('USD'),id:'independent-remote-financial-expense',
    description:'Office rental',amount:'5.00'}]};
}

test('unrelated offline save cannot accept a remotely deleted invoice that still has a payment',()=>{
  const {base}=fixture(),snapshot=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,localExpense(base),{...base,documents:[]}),
    /financial activity cannot remain linked to a missing source invoice/i);
  assert.equal(JSON.stringify(base),snapshot,'no financial data is rewritten during rejection');
});

test('remote invoice reduction below its settled amount is rejected even when local edit is unrelated',()=>{
  const {base,invoice}=fixture();
  const lower={...invoice,items:[{...invoice.items[0],unitPrice:'20.00'}],
    updatedAt:'2026-10-03T10:00:00.000Z'};
  assert.throws(()=>mergeVaultIntent(base,localExpense(base),{...base,documents:[lower]}),
    /invoice balance cannot fall below|invoice total cannot be reduced/i);
});

test('remotely voided paid invoice cannot reach an unrelated local write',()=>{
  const {base,invoice}=fixture();
  const cancelled={...invoice,lifecycleStatus:'voided',voidedAt:'2026-10-03T10:00:00.000Z',
    voidReason:'Incorrect sale'};
  assert.throws(()=>mergeVaultIntent(base,localExpense(base),{...base,documents:[cancelled]}),
    /invoice with payments.*active final|invoice.*active final/i);
});

test('valid remotely appended payment merges with an independent local expense',()=>{
  const {base,invoice,payment}=fixture();
  const other={...payment,id:'independent-remote-receipt',amount:'15.00',
    reference:'B-15',createdAt:'2026-10-04T09:00:00.000Z',date:'2026-10-04'};
  const merged=mergeVaultIntent(base,localExpense(base),{...base,payments:[payment,other]});
  assert.equal(merged.payments.length,2);
  assert.equal(merged.expenses.length,1);
  assert.equal(invoicePaymentSummary(invoice,merged.payments,'2026-10-20',merged.documents).paid,'55.00');
});

test('freshly deserialized but unchanged historic invoice must not be strictly revalidated',()=>{
  const {base,invoice,payment}=fixture();
  const historical={...base,documents:[{...invoice,items:[{...invoice.items[0],unitPrice:'1,2.00'}]}]};
  const immutableBefore=JSON.stringify(historical);
  const remote=structuredClone(historical);
  const merged=mergeVaultIntent(historical,localExpense(historical),remote);
  assert.equal(merged.documents[0].items[0].unitPrice,'1,2.00');
  assert.equal(merged.payments[0].amount,payment.amount);
  assert.equal(merged.expenses.length,1);
  assert.equal(JSON.stringify(historical),immutableBefore);
});
