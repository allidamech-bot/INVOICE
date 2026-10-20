import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {beginRevisionDraft,createRevisionRecord,voidFinalDocument} from '../dist/src/lib/document-lifecycle.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function setup(){
  const vault=emptyVault();
  const invoice=createBlankDocument('invoice','INV-2026-ISSUED-AUDIT',vault.company);
  invoice.id='unpaid-issued-audit-invoice';invoice.status='final';invoice.lifecycleStatus='active';
  invoice.role='standard';invoice.issueDate='2026-10-01';invoice.dueDate='2026-11-01';
  invoice.customerSnapshot={sourceCustomerId:'buyer-issued-guard',companyNameEn:'Audited Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],descriptionEn:'Service',quantity:'1',unitPrice:'180.00',
    stockTreatment:'non-stock'}];
  return {vault:{...vault,documents:[invoice]},invoice};
}
const expense=(vault)=>({...vault,expenses:[{...createExpense('USD'),id:'separate-electric-bill',
  description:'Utilities',amount:'15.00'}]});

test('directly deleting a final unpaid invoice cannot erase an issued financial claim',()=>{
  const {vault}=setup(),before=JSON.stringify(vault);
  assert.throws(()=>mergeVaultIntent(vault,{...vault,documents:[]},vault),
    /issued invoice history cannot be deleted/i);
  assert.equal(JSON.stringify(vault),before);
});

test('remote deletion of an issued invoice cannot accompany a stale local expense save',()=>{
  const {vault}=setup(),before=JSON.stringify(vault);
  assert.throws(()=>mergeVaultIntent(vault,expense(vault),
    {...vault,documents:[]}),/issued invoice history cannot be deleted/i);
  assert.equal(JSON.stringify(vault),before);
});

test('local and remote direct final-to-final price/customer changes require a proper revision workflow',()=>{
  const {vault,invoice}=setup(),before=JSON.stringify(vault);
  const tampered=[
    {...invoice,items:[{...invoice.items[0],unitPrice:'15.00'}]},
    {...invoice,adjustments:{...invoice.adjustments,taxPercent:'20'}},
    {...invoice,customerSnapshot:{...invoice.customerSnapshot,companyNameEn:'Different Buyer'}},
    {...invoice,currency:'EUR'},
    {...invoice,issueDate:'2026-10-02'}
  ];
  for(const changed of tampered){
    assert.throws(()=>mergeVaultIntent(vault,{...vault,documents:[changed]},vault),
      /issued invoice financial terms are immutable/i);
    assert.throws(()=>mergeVaultIntent(vault,expense(vault),{...vault,documents:[changed]}),
      /issued invoice financial terms are immutable/i);
    assert.equal(JSON.stringify(vault),before);
  }
});

test('legitimate audited invoice cancellation and harmless presentation edits still work',()=>{
  const {vault,invoice}=setup();
  const presentation={...invoice,appearance:{...invoice.appearance,showBank:!invoice.appearance.showBank},
    updatedAt:'2026-10-10T09:00:00.000Z'};
  const edited=mergeVaultIntent(vault,{...vault,documents:[presentation]},vault);
  assert.equal(edited.documents[0].appearance.showBank,!invoice.appearance.showBank);
  const cancelled=voidFinalDocument(invoice,'Incorrect duplicate invoice',vault.documents,vault.payments);
  const archived=mergeVaultIntent(vault,{...vault,documents:[cancelled]},vault);
  assert.equal(archived.documents[0].lifecycleStatus,'voided');
  assert.equal(archived.documents[0].items[0].unitPrice,'180.00');
});

test('proper snapshot-based revision and reissue may change invoice amount after draft stage',()=>{
  const {vault,invoice}=setup(),snapshot=createRevisionRecord(invoice);
  const draft=beginRevisionDraft(invoice);
  const opening=mergeVaultIntent(vault,{...vault,documents:[draft],
    documentRevisions:[snapshot]},vault);
  const reissued={...opening.documents[0],status:'final',updatedAt:'2026-10-10T12:00:00.000Z',
    items:[{...opening.documents[0].items[0],unitPrice:'240.00'}]};
  const saved=mergeVaultIntent(opening,{...opening,documents:[reissued]},opening);
  assert.equal(saved.documents[0].items[0].unitPrice,'240.00');
  assert.equal(saved.documentRevisions[0].snapshot.items[0].unitPrice,'180.00');
});

test('unmodified historical final invoice prices and unusual spelling are never normalized',()=>{
  const {vault,invoice}=setup();
  const original={...vault,documents:[{...invoice,
    items:[{...invoice.items[0],unitPrice:'1,2.00'}]}]};
  const before=JSON.stringify(original);
  const saved=mergeVaultIntent(original,expense(original),structuredClone(original));
  assert.equal(saved.documents[0].items[0].unitPrice,'1,2.00');
  assert.equal(saved.expenses.length,1);
  assert.equal(JSON.stringify(original),before);
});
