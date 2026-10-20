import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault();
  const base={...vault,documents:[]};
  const invoice=createBlankDocument('invoice','INV-NEW-DOC-001',vault.company);
  invoice.id='two-device-same-document-id';
  invoice.status='final';invoice.lifecycleStatus='active';invoice.role='standard';
  invoice.issueDate='2026-10-01';invoice.dueDate='2026-11-01';
  invoice.customerSnapshot=customerSnapshotFrom({
    id:'buyer-document-identity',companyNameEn:'Invoice Buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
  });
  invoice.items=[{...invoice.items[0],descriptionEn:'Service',
    quantity:'1',unitPrice:'100.00',stockTreatment:'non-stock'}];
  const remote={...invoice,number:'INV-NEW-DOC-002',
    items:[{...invoice.items[0],unitPrice:'180.00'}]};
  return{base,invoice,remote};
}
const unrelatedSave=base=>({...base,expenses:[{...createExpense('USD'),
  id:'unrelated-new-document-save',description:'Office expense',amount:'5.00'}]});

test('two independent newly issued invoices sharing an ID must not silently overwrite one another',()=>{
  const {base,invoice,remote}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,documents:[invoice]},
    {...base,documents:[remote]}),/New document ID collision across devices/i);
  assert.equal(JSON.stringify(base),before);
});

test('a local import cannot introduce two fresh documents with one ID',()=>{
  const {base,invoice,remote}=fixture();
  assert.throws(()=>mergeVaultIntent(base,{...base,documents:[invoice,remote]},base),
    /New document IDs must be unique/i);
});

test('a cloud import cannot introduce two fresh documents sharing an ID during unrelated save',()=>{
  const {base,invoice,remote}=fixture();
  assert.throws(()=>mergeVaultIntent(base,unrelatedSave(base),
    {...base,documents:[invoice,remote]}),/New document IDs must be unique/i);
});

test('distinct local and remote issued invoices preserve both receivables and amounts',()=>{
  const {base,invoice,remote}=fixture();
  const second={...remote,id:'remote-independent-invoice'};
  const merged=mergeVaultIntent(base,{...base,documents:[invoice]},
    {...base,documents:[second]});
  assert.equal(merged.documents.length,2);
  assert.deepEqual(new Set(merged.documents.map(doc=>doc.id)),
    new Set([invoice.id,second.id]));
  assert.deepEqual(new Set(merged.documents.map(doc=>doc.items[0].unitPrice)),
    new Set(['100.00','180.00']));
});

test('identical cross-device invoice replay is saved exactly once',()=>{
  const {base,invoice}=fixture();
  const merged=mergeVaultIntent(base,{...base,documents:[invoice]},
    {...base,documents:[structuredClone(invoice)]});
  assert.equal(merged.documents.length,1);
  assert.equal(merged.documents[0].number,invoice.number);
});

test('historical unusual duplicate document IDs are not silently migrated or deleted on unrelated save',()=>{
  const {base,invoice,remote}=fixture();
  const legacy={...base,documents:[invoice,remote]};
  const before=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,unrelatedSave(legacy),structuredClone(legacy));
  assert.equal(merged.documents.length,2);
  assert.equal(JSON.stringify(legacy),before);
});
