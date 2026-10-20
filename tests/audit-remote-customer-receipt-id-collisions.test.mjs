import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault();
  const invoice=createBlankDocument('invoice','INV-REMOTE-NEW-COLLISION',vault.company);
  invoice.id='invoice-new-payment-remote-collision';
  invoice.status='final';invoice.lifecycleStatus='active';invoice.role='standard';
  invoice.issueDate='2026-10-01';invoice.dueDate='2026-10-31';
  invoice.customerSnapshot={sourceCustomerId:'buyer-remote-receipt-id',
    companyNameEn:'Remote Receipt Buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],descriptionEn:'Services',quantity:'1',unitPrice:'200.00'}];
  const payment={id:'new-reused-remote-customer-id',invoiceId:invoice.id,
    invoiceNumber:invoice.number,customerId:'buyer-remote-receipt-id',
    customerNameEn:'Remote Receipt Buyer',customerNameAr:'',currency:invoice.currency,
    amount:'50.00',date:'2026-10-12',method:'bank-transfer',reference:'RECEIPT-50',
    notes:'',createdAt:'2026-10-12T09:00:00.000Z',updatedAt:'2026-10-12T09:00:00.000Z'};
  return {base:{...vault,documents:[invoice]},invoice,payment};
}
const unrelatedExpense=base=>({...base,expenses:[{...createExpense('USD'),
  id:'nonpayment-unrelated-expense',description:'Office cleaning',amount:'6.00'}]});

test('remote new customer receipts cannot share an ID and lose one collected amount during an unrelated save',()=>{
  const {base,payment}=fixture(),before=JSON.stringify(base);
  const other={...payment,amount:'65.00',reference:'RECEIPT-65'};
  assert.throws(()=>mergeVaultIntent(base,unrelatedExpense(base),
    {...base,payments:[payment,other]}),/new customer payment IDs must be unique/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote new customer receipt IDs cannot be blank even if their money parses',()=>{
  const {base,payment}=fixture();
  assert.throws(()=>mergeVaultIntent(base,unrelatedExpense(base),
    {...base,payments:[{...payment,id:''}]}),
    /new customer payment IDs must be unique/i);
});

test('valid independent local and remote receipts keep both amounts and the unrelated expense',()=>{
  const {base,invoice,payment}=fixture();
  const local={...payment,id:'fresh-local-customer-receipt',amount:'40.00',
    reference:'LOCAL-40'};
  const cloud={...payment,id:'fresh-remote-customer-receipt',amount:'65.00',
    reference:'CLOUD-65'};
  const merged=mergeVaultIntent(base,{...unrelatedExpense(base),payments:[local]},
    {...base,payments:[cloud]});
  assert.equal(merged.payments.length,2);
  assert.deepEqual(new Set(merged.payments.map(p=>p.id)),
    new Set([local.id,cloud.id]));
  assert.equal(merged.expenses.length,1);
  const summary=invoicePaymentSummary(invoice,merged.payments,'2026-10-20',merged.documents);
  assert.equal(summary.paid,'105.00');
  assert.equal(summary.remaining,'95.00');
});

test('previously saved unusual customer receipt money remains byte-for-byte unchanged during unrelated save',()=>{
  const {base,payment,invoice}=fixture();
  const legacy={...base,payments:[{...payment,amount:'1,2.00'}]};
  const before=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,unrelatedExpense(legacy),structuredClone(legacy));
  assert.equal(merged.payments[0].amount,'1,2.00');
  assert.equal(invoicePaymentSummary(invoice,merged.payments,'2026-10-20',merged.documents).paid,'12.00');
  assert.equal(JSON.stringify(legacy),before);
});

test('edits and deletion of an unallocated customer receipt remain legal and exact',()=>{
  const {base,payment,invoice}=fixture();
  const existing={...base,payments:[payment]};
  const edited=mergeVaultIntent(existing,{...existing,payments:[{...payment,amount:'55.00'}]},existing);
  assert.equal(invoicePaymentSummary(invoice,edited.payments,'2026-10-20',edited.documents).paid,'55.00');
  const removed=mergeVaultIntent(edited,{...edited,payments:[]},edited);
  assert.equal(removed.payments.length,0);
  assert.equal(invoicePaymentSummary(invoice,removed.payments,'2026-10-20',removed.documents).remaining,'200.00');
});
