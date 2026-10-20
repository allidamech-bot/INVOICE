import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(branchId='main',workspaceId='default'){
  const vault=emptyVault();
  const invoice=createBlankDocument('invoice','INV-RECEIPT-SCOPE',vault.company);
  invoice.id='invoice-receipt-scope';invoice.role='standard';
  invoice.status='final';invoice.lifecycleStatus='active';
  invoice.workspaceId=workspaceId;invoice.branchId=branchId;
  invoice.issueDate='2026-10-01';invoice.dueDate='2026-10-31';
  invoice.customerSnapshot=customerSnapshotFrom({
    id:'buyer-receipt-scope',companyNameEn:'Scoped Buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
  });
  invoice.items=[{...invoice.items[0],descriptionEn:'Service',
    quantity:'1',unitPrice:'200.00',stockTreatment:'non-stock'}];
  const base={...vault,documents:[invoice]};
  const payment=normalizePaymentRecord(invoice,[],{
    id:'receipt-scoped-1',amount:'75.00',date:'2026-10-12',
    method:'cash',reference:'RCPT-1',notes:''
  },[invoice]);
  payment.workspaceId=workspaceId;payment.branchId=branchId;
  return{base,invoice,payment};
}
const unrelatedSave=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('new local customer receipt cannot attach a different branch to an existing invoice',()=>{
  const {base,payment}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,payments:[{...payment,branchId:'other-branch'}]},base),
    /same company and branch as its invoice/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote cross-company or cross-branch receipt cannot slip into an unrelated local save',()=>{
  const {base,payment}=fixture(),before=JSON.stringify(base);
  for(const mismatch of [
    {...payment,workspaceId:'another-company'},
    {...payment,branchId:'other-branch'}
  ]){
    assert.throws(()=>mergeVaultIntent(base,unrelatedSave(base),{...base,payments:[mismatch]}),
      /same company and branch as its invoice/i);
    assert.equal(JSON.stringify(base),before);
  }
});

test('changing the invoice or scope of an existing receipt cannot link it across branches',()=>{
  const {base,payment}=fixture();
  const recorded={...base,payments:[payment]};
  assert.throws(()=>mergeVaultIntent(recorded,{...recorded,payments:[{...payment,branchId:'other-branch'}]},recorded),
    /same company and branch as its invoice/i);
});

test('valid independent local and remote receipts in the invoice branch are both retained',()=>{
  const {base,invoice,payment}=fixture('regional-branch','company-a');
  const other={...payment,id:'receipt-scoped-2',amount:'80.00',reference:'RCPT-2'};
  const merged=mergeVaultIntent(base,{...base,payments:[payment]},{...base,payments:[other]});
  assert.equal(merged.payments.length,2);
  const summary=invoicePaymentSummary(invoice,merged.payments,'2026-10-20',merged.documents);
  assert.equal(summary.paid,'155.00');
  assert.equal(summary.remaining,'45.00');
});

test('replayed identical receipt stays singular and untouched legacy cross-scope record is grandfathered',()=>{
  const {base,payment}=fixture();
  const replay=mergeVaultIntent(base,{...base,payments:[payment]},{...base,payments:[{...payment}]});
  assert.equal(replay.payments.length,1);
  const legacy={...base,payments:[{...payment,branchId:'historic-branch'}]};
  const original=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,unrelatedSave(legacy),structuredClone(legacy));
  assert.equal(merged.payments[0].branchId,'historic-branch');
  assert.equal(JSON.stringify(legacy),original);
});
