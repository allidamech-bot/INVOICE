import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createDocumentEvent} from '../dist/src/lib/document-lifecycle.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const root=emptyVault();
  const invoice=createBlankDocument('invoice','INV-AUDIT-EVENT-001',root.company);
  invoice.id='invoice-event-collisions';invoice.status='final';invoice.lifecycleStatus='active';
  invoice.role='standard';invoice.issueDate='2026-10-01';invoice.dueDate='2026-11-01';
  invoice.items=[{...invoice.items[0],descriptionEn:'Monthly service',quantity:'1',unitPrice:'100.00'}];
  const base={...root,documents:[invoice]};
  const first={...createDocumentEvent(invoice,'payment-recorded','BANK-35',undefined,'35.00'),
    id:'document-event-new-collision'};
  const second={...createDocumentEvent(invoice,'payment-deleted','BANK-20',undefined,'20.00'),
    id:first.id};
  return {base,invoice,first,second};
}
function independentExpense(base){return {...base,expenses:[{...createExpense('USD'),
  id:'unrelated-operation-expense',description:'Electricity',amount:'10.00'}]};}

test('new invoice collection and correction events cannot share an ID and silently lose one audit action',()=>{
  const {base,first,second}=fixture(),snapshot=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,documentEvents:[first,second]},base),
    /new document event IDs must be unique/i);
  assert.equal(JSON.stringify(base),snapshot);
});

test('a remote duplicate invoice event cannot be accepted during an unrelated expense save',()=>{
  const {base,first,second}=fixture();
  const cloud={...base,documentEvents:[first,second]};
  assert.throws(()=>mergeVaultIntent(base,independentExpense(base),cloud),
    /new document event IDs must be unique/i);
  assert.equal(base.documentEvents.length,0,'rejected remote audit event batch cannot alter original history');
});

test('separate local and remote invoice events retain both identities and amounts after merging',()=>{
  const {base,first,second}=fixture();
  const latest={...base,documentEvents:[{...second,id:'remote-correction-event'}]};
  const intended={...base,documentEvents:[first]};
  const merged=mergeVaultIntent(base,intended,latest);
  assert.deepEqual(new Set(merged.documentEvents.map(e=>e.id)),new Set([first.id,'remote-correction-event']));
  assert.equal(merged.documentEvents.find(e=>e.id===first.id).amount,'35.00');
  assert.equal(merged.documentEvents.find(e=>e.id==='remote-correction-event').amount,'20.00');
  assert.equal(merged.documentEvents.length,2);
});

test('stored historical document events survive independent edits and cloud deserialization unchanged',()=>{
  const {base,first}=fixture(),legacy={...base,documentEvents:[{...first,id:'historical-audit-event',amount:'1,2.00'}]};
  const snapshot=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,independentExpense(legacy),structuredClone(legacy));
  assert.equal(merged.documentEvents.length,1);
  assert.equal(merged.documentEvents[0].amount,'1,2.00');
  assert.equal(JSON.stringify(legacy),snapshot);
});
