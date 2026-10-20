import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createCreditNoteDraft} from '../dist/src/lib/document-lifecycle.js';
import {invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const empty=emptyVault();
  const invoice=createBlankDocument('invoice','INV-CREDIT-SCOPE',empty.company);
  invoice.id='invoice-credit-scope';invoice.status='final';
  invoice.lifecycleStatus='active';invoice.role='standard';
  invoice.issueDate='2026-10-01';invoice.dueDate='2026-10-31';
  invoice.workspaceId='default';invoice.branchId='main';
  invoice.customerSnapshot=customerSnapshotFrom({
    id:'buyer-credit-scope',companyNameEn:'Credit Scope Buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
  });
  invoice.items=[{...invoice.items[0],descriptionEn:'Consulting',quantity:'1',
    unitPrice:'200.00',stockTreatment:'non-stock'}];
  const credit=createCreditNoteDraft(invoice,'CN-CREDIT-SCOPE','60.00');
  credit.id='credit-scope-1';credit.status='final';credit.issueDate='2026-10-12';
  credit.workspaceId='default';credit.branchId='main';
  return{base:{...empty,documents:[invoice]},invoice,credit};
}
const unrelatedSave=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('direct new credit note cannot settle an invoice from another branch',()=>{
  const {base,credit}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,documents:[...base.documents,
    {...credit,branchId:'other-branch'}]},base),
    /same company and branch as its source invoice/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote cross-company or cross-branch credit note cannot slip into unrelated local save',()=>{
  const {base,credit}=fixture();
  for(const wrong of [
    {...credit,workspaceId:'other-company'},
    {...credit,branchId:'other-branch'}
  ])assert.throws(()=>mergeVaultIntent(base,unrelatedSave(base),
      {...base,documents:[...base.documents,wrong]}),
    /same company and branch as its source invoice/i);
});

test('cross-branch draft credit and reassignment of a previously linked credit are rejected',()=>{
  const {base,credit}=fixture();
  assert.throws(()=>mergeVaultIntent(base,{...base,documents:[...base.documents,
    {...credit,status:'draft',branchId:'other-branch'}]},base),
    /same company and branch as its source invoice/i);
  const recorded={...base,documents:[...base.documents,credit]};
  assert.throws(()=>mergeVaultIntent(recorded,{...recorded,documents:[base.documents[0],
    {...credit,branchId:'other-branch'}]},recorded),
    /same company and branch as its source invoice/i);
});

test('issued source invoice cannot move company or branch and strand existing settlement history',()=>{
  const {base,invoice}=fixture();
  for(const changed of [
    {...invoice,workspaceId:'other-company'},
    {...invoice,branchId:'other-branch'}
  ])assert.throws(()=>mergeVaultIntent(base,{...base,documents:[changed]},base),
    /issued invoice financial terms are immutable/i);
});

test('valid same-branch credit notes settle the correct invoice without doubling credit on retries',()=>{
  const {base,invoice,credit}=fixture();
  const saved=mergeVaultIntent(base,{...base,documents:[invoice,credit]},base);
  let summary=invoicePaymentSummary(invoice,saved.payments,'2026-10-20',saved.documents);
  assert.equal(summary.credits,'60.00');
  assert.equal(summary.remaining,'140.00');
  const replay=mergeVaultIntent(base,{...base,documents:[invoice,credit]},
    {...base,documents:[invoice,{...credit}]});
  summary=invoicePaymentSummary(invoice,replay.payments,'2026-10-20',replay.documents);
  assert.equal(replay.documents.filter(doc=>doc.role==='credit-note').length,1);
  assert.equal(summary.credits,'60.00');
});

test('unchanged historical foreign-scope credit note is not reclassified by unrelated save',()=>{
  const {base,credit}=fixture();
  const legacy={...base,documents:[...base.documents,{...credit,branchId:'historic-branch'}]};
  const before=JSON.stringify(legacy);
  const result=mergeVaultIntent(legacy,unrelatedSave(legacy),structuredClone(legacy));
  assert.equal(result.documents[1].branchId,'historic-branch');
  assert.equal(JSON.stringify(legacy),before);
});
