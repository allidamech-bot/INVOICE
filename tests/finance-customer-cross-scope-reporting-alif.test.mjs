import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createCreditNoteDraft} from '../dist/src/lib/document-lifecycle.js';
import {invoicePaymentSummary,accountedInvoicePayments,accountedInvoiceCreditNotes} from '../dist/src/lib/payments.js';
import {customerStatement,receivablesByCurrency} from '../dist/src/lib/receivables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

// This is finance-only, fully synthetic historical AR data. Nothing connects
// to a real user, Vercel, Firebase, a production document, or LOUREX AI.
const asOf='2026-10-20';
function invoice(overrides={}){
  const document=createBlankDocument('invoice','INV-QA-AR-SCOPE',emptyVault().company);
  Object.assign(document,{
    id:'qa-ar-cross-scope-invoice',kind:'invoice',role:'standard',
    status:'final',lifecycleStatus:'active',issueDate:'2026-10-01',
    dueDate:'2026-11-01',currency:'USD',workspaceId:'company-a',
    branchId:'main',...overrides
  });
  document.customerSnapshot={...document.customerSnapshot,
    sourceCustomerId:'qa-ar-scope-buyer',companyNameEn:'Synthetic QA Buyer',
    companyNameAr:''};
  document.items=[{...document.items[0],descriptionEn:'Synthetic service',
    quantity:'1',unitPrice:'200.00',stockTreatment:'non-stock'}];
  document.adjustments={...document.adjustments,discountEnabled:false,
    shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  return document;
}
function receipt(source,id,amount='50.00',overrides={}){
  return{id,invoiceId:source.id,invoiceNumber:source.number,
    customerId:source.customerSnapshot.sourceCustomerId,customerNameEn:'Synthetic QA Buyer',
    customerNameAr:'',workspaceId:source.workspaceId,branchId:source.branchId,
    currency:source.currency,date:'2026-10-10',amount,reference:id,
    method:'bank-transfer',notes:'',createdAt:'2026-10-10T09:00:00.000Z',
    updatedAt:'2026-10-10T09:00:00.000Z',...overrides};
}
function credit(source,id,amount='40.00',overrides={}){
  const doc=createCreditNoteDraft(source,'CN-'+id,amount,
    {mode:'keep-vat',reason:'Synthetic QA credit note'});
  return {...doc,id,status:'final',lifecycleStatus:'active',
    issueDate:'2026-10-12',...overrides};
}
function totals(source,payments,documents=[source]){
  const s=invoicePaymentSummary(source,payments,asOf,documents);
  const ar=receivablesByCurrency(documents,payments,asOf)[0];
  const statement=customerStatement(source.customerSnapshot.sourceCustomerId,
    documents,payments,asOf)[0];
  assert.equal(s.paid,ar.paid);
  assert.equal(s.credits,ar.credits);
  assert.equal(s.remaining,ar.outstanding);
  assert.equal(statement.paid,ar.paid);
  assert.equal(statement.credits,ar.credits);
  assert.equal(statement.outstanding,ar.outstanding);
  return {s,ar,statement};
}

test('historical wrong-branch and wrong-company customer receipts do not reduce invoice AR',()=>{
 const source=invoice(),valid=receipt(source,'same-branch'),
   foreignBranch=receipt(source,'foreign-branch','80.00',{branchId:'other-branch'}),
   foreignCompany=receipt(source,'foreign-company','90.00',{workspaceId:'company-b'});
 const records=[valid,foreignBranch,foreignCompany],frozen=JSON.stringify(records);
 const {s,statement}=totals(source,records);
 assert.deepEqual([s.total,s.paid,s.remaining],['200.00','50.00','150.00']);
 assert.equal(accountedInvoicePayments(source,records,asOf).length,1);
 assert.deepEqual(statement.entries.map(x=>x.type),['invoice','payment']);
 assert.equal(JSON.stringify(records),frozen,'source financial history must be untouched');
});

test('historical wrong-company and wrong-branch credit notes do not lower unrelated AR',()=>{
 const source=invoice(),valid=credit(source,'valid'),
  foreignCompany=credit(source,'foreign-company','60.00',{workspaceId:'company-b'}),
  foreignBranch=credit(source,'foreign-branch','50.00',{branchId:'east'});
 const docs=[source,valid,foreignCompany,foreignBranch],frozen=JSON.stringify(docs);
 const {s,statement}=totals(source,[],docs);
 assert.deepEqual([s.total,s.credits,s.netTotal,s.remaining],
  ['200.00','40.00','160.00','160.00']);
 assert.equal(accountedInvoiceCreditNotes(source,docs,asOf).length,1);
 assert.deepEqual(statement.entries.map(x=>x.type),['invoice','credit-note']);
 assert.equal(JSON.stringify(docs),frozen,'historic credit notes cannot be rewritten');
});

test('same-company same-branch receipt and credit reconcile at exact cutoff',()=>{
 const source=invoice();
 const records=[receipt(source,'valid-50'),receipt(source,'future-90','90.00',{date:'2026-11-15'})];
 const docs=[source,credit(source,'valid-40'),credit(source,'future-20','20.00',{issueDate:'2026-11-15'})];
 const {s,statement}=totals(source,records,docs);
 assert.deepEqual([s.total,s.paid,s.credits,s.remaining],
  ['200.00','50.00','40.00','110.00']);
 assert.deepEqual(statement.entries.map(x=>x.type),['invoice','payment','credit-note']);
});

test('legacy absent default/main scope still matches default/main but not named branch',()=>{
 const defaultInvoice=invoice({workspaceId:undefined,branchId:undefined});
 const historical=receipt(defaultInvoice,'legacy-50','50.00',{
  workspaceId:undefined,branchId:undefined});
 const legacyCredit=credit(defaultInvoice,'legacy-credit','40.00',{
  workspaceId:undefined,branchId:undefined});
 const {s}=totals(defaultInvoice,[historical],[defaultInvoice,legacyCredit]);
 assert.deepEqual([s.paid,s.credits,s.remaining],['50.00','40.00','110.00']);
 const differentBranch=invoice({workspaceId:'default',branchId:'east'});
 const differentCompany=invoice({workspaceId:'company-a',branchId:'main'});
 assert.equal(accountedInvoicePayments(differentBranch,[historical],asOf).length,0);
 assert.equal(accountedInvoicePayments(differentCompany,[historical],asOf).length,0);
 assert.equal(accountedInvoiceCreditNotes(differentBranch,[legacyCredit],asOf).length,0);
 assert.equal(accountedInvoiceCreditNotes(differentCompany,[legacyCredit],asOf).length,0);
});

test('untouched wrong-scope legacy receipt survives cloud merge without contaminating statement',()=>{
 const source=invoice({workspaceId:'default',branchId:'main'});
 const wrong=receipt(source,'historical-wrong-branch','75.00',{branchId:'old-branch'});
 const base={...emptyVault(),documents:[source],payments:[wrong]};
 const original=JSON.stringify(base);
 const unrelated={...base,appSettings:{...base.appSettings,uiLanguage:'ar'}};
 const merged=mergeVaultIntent(base,unrelated,structuredClone(base));
 assert.equal(merged.payments.length,1);
 assert.equal(merged.payments[0].branchId,'old-branch');
 assert.equal(totals(source,merged.payments,merged.documents).s.remaining,'200.00');
 assert.equal(JSON.stringify(base),original,'read/merge must not rewrite historical source');
});
