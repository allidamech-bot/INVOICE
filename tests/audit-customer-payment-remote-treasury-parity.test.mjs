import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {appendTreasuryEntry,createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance,voidTreasuryEntry} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const base=emptyVault();
  const invoice=createBlankDocument('invoice','INV-2026-REMOTE-ALLOC',base.company);
  invoice.id='invoice-remote-bank-allocated';invoice.status='final';invoice.lifecycleStatus='active';
  invoice.role='standard';invoice.issueDate='2026-10-01';invoice.dueDate='2026-10-31';
  invoice.customerSnapshot={sourceCustomerId:'buyer-bank-remote',companyNameEn:'Remote Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],descriptionEn:'Service',quantity:'1',unitPrice:'150.00'}];
  const payment={id:'customer-payment-remote-allocated',invoiceId:invoice.id,
    invoiceNumber:invoice.number,customerId:'buyer-bank-remote',customerNameEn:'Remote Buyer',
    customerNameAr:'',currency:invoice.currency,amount:'40.00',date:'2026-10-10',
    method:'bank-transfer',reference:'BANK-001',notes:'',createdAt:'2026-10-10T09:00:00.000Z',
    updatedAt:'2026-10-10T09:00:00.000Z'};
  const bank=createTreasuryAccount({label:'Collections bank',kind:'bank',currency:invoice.currency,
    workspaceId:base.appSettings.activeWorkspaceId,branchId:base.appSettings.activeBranchId});
  const vault={...base,documents:[invoice],payments:[payment],treasuryAccounts:[bank]};
  const allocation={...createTreasuryEntry('collection',invoice.currency),
    id:'bank-receipt-allocated',workspaceId:base.appSettings.activeWorkspaceId,
    branchId:base.appSettings.activeBranchId,amount:'40.00',date:'2026-10-10',
    toAccountId:bank.id,sourceType:'customer-payment',sourceId:payment.id};
  return {vault:appendTreasuryEntry(vault,allocation),invoice,payment,bank,allocation};
}
function independentExpense(vault){
  return {...vault,expenses:[{...createExpense('USD'),id:'unrelated-expense',
    description:'Office connectivity',amount:'5.00'}]};
}

test('offline merge cannot accept remotely deleted bank-allocated customer payment',()=>{
  const {vault,bank}=fixture(),snapshot=JSON.stringify(vault);
  assert.throws(()=>mergeVaultIntent(vault,independentExpense(vault),{...vault,payments:[]}),
    /Customer payment has an active linked treasury entry/i);
  assert.equal(treasuryAccountBalance(bank.id,vault.treasuryEntries),'40.00');
  assert.equal(JSON.stringify(vault),snapshot);
});

test('offline merge cannot accept remotely altered allocated amount, source or reference',()=>{
  const {vault,payment}=fixture(),snapshot=JSON.stringify(vault);
  for(const change of [
    {amount:'90.00'},
    {amount:'20.00'},
    {reference:'BANK-REWRITTEN'},
    {invoiceId:'another-invoice'},
    {date:'2026-10-11'}
  ]){
    const latest={...vault,payments:[{...payment,...change,updatedAt:'2026-10-11T09:00:00.000Z'}]};
    assert.throws(()=>mergeVaultIntent(vault,independentExpense(vault),latest),
      /Customer payment has an active linked treasury entry/i);
    assert.equal(JSON.stringify(vault),snapshot);
  }
});

test('legitimate remote customer payment changes remain permitted after explicit treasury void',()=>{
  const {vault,payment,bank,allocation,invoice}=fixture();
  const voided=voidTreasuryEntry(allocation,'Wrong bank allocation');
  const latest={...vault,treasuryEntries:[voided],payments:[{...payment,amount:'60.00',
    updatedAt:'2026-10-12T10:00:00.000Z'}]};
  const merged=mergeVaultIntent(vault,independentExpense(vault),latest);
  assert.equal(merged.payments[0].amount,'60.00');
  assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'0.00');
  assert.equal(invoicePaymentSummary(invoice,merged.payments,'2026-10-20',merged.documents).paid,'60.00');
  assert.equal(merged.expenses.length,1);
});

test('unallocated customer receipt editing and deletion remain supported',()=>{
  const {vault,payment,invoice}=fixture();
  const noAllocation={...vault,treasuryEntries:[]};
  const revised={...payment,amount:'45.00',reference:'Corrected receipt'};
  const edited=mergeVaultIntent(noAllocation,{...noAllocation,payments:[revised]},noAllocation);
  assert.equal(invoicePaymentSummary(invoice,edited.payments,'2026-10-20',edited.documents).paid,'45.00');
  const removed=mergeVaultIntent(edited,{...edited,payments:[]},edited);
  assert.equal(removed.payments.length,0);
  assert.equal(invoicePaymentSummary(invoice,removed.payments,'2026-10-20',removed.documents).remaining,'150.00');
});
