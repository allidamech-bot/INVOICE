import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createRevisionRecord} from '../dist/src/lib/document-lifecycle.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const root=emptyVault();
  const invoice=createBlankDocument('invoice','INV-REVISION-HISTORY-1',root.company);
  invoice.id='historical-revision-invoice';invoice.status='final';invoice.lifecycleStatus='active';
  invoice.issueDate='2026-10-01';invoice.dueDate='2026-10-31';
  invoice.items=[{...invoice.items[0],descriptionEn:'Consultancy service',
    quantity:'1',unitPrice:'150.00'}];
  const revision={...createRevisionRecord(invoice),id:'historical-revision-record'};
  const base={...root,documents:[invoice],documentRevisions:[revision]};
  return {base,invoice,revision};
}
const unrelatedExpense=(base)=>({...base,expenses:[{...createExpense('USD'),
  description:'Office maintenance',amount:'5.00'}]});

test('issued invoice revision snapshots cannot be deleted from a local vault intent',()=>{
  const {base}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,documentRevisions:[]},base),
    /document revision history cannot be deleted/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote removal or financial rewrite of an old revision cannot be accepted during unrelated expense save',()=>{
  const {base,revision}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,unrelatedExpense(base),{...base,documentRevisions:[]}),
    /document revision history cannot be deleted/i);
  const rewritten={...revision,snapshot:{...revision.snapshot,items:[
    {...revision.snapshot.items[0],unitPrice:'10.00'}]}};
  assert.throws(()=>mergeVaultIntent(base,unrelatedExpense(base),
    {...base,documentRevisions:[rewritten]}),
    /document revision history is immutable/i);
  assert.equal(JSON.stringify(base),before);
});

test('two newly added revision snapshots must not collide on the same record ID',()=>{
  const {base,revision}=fixture();
  const before={...base,documentRevisions:[]};
  const duplicated={...revision,revision:revision.revision+1,
    snapshot:{...revision.snapshot,items:[
      {...revision.snapshot.items[0],unitPrice:'200.00'}]}};
  assert.throws(()=>mergeVaultIntent(before,
    {...before,documentRevisions:[revision,duplicated]},before),
    /new document revision IDs must be unique/i);
  assert.throws(()=>mergeVaultIntent(before,unrelatedExpense(before),
    {...before,documentRevisions:[revision,duplicated]}),
    /new document revision IDs must be unique/i);
});

test('legitimate concurrent new revision snapshots retain independent document identities',()=>{
  const {base,invoice}=fixture();
  const second={...createBlankDocument('invoice','INV-REVISION-HISTORY-2',base.company),
    id:'another-revision-invoice',status:'final',lifecycleStatus:'active',
    issueDate:'2026-10-01',dueDate:'2026-10-31'};
  second.items=[{...second.items[0],descriptionEn:'Freight service',quantity:'1',unitPrice:'50.00'}];
  const root={...base,documents:[invoice,second],documentRevisions:[]};
  const local={...createRevisionRecord(invoice),id:'new-revision-local'};
  const remote={...createRevisionRecord(second),id:'new-revision-remote'};
  const merged=mergeVaultIntent(root,{...root,documentRevisions:[local]},
    {...root,documentRevisions:[remote]});
  assert.equal(merged.documentRevisions.length,2);
  assert.deepEqual(new Set(merged.documentRevisions.map(r=>r.documentId)),
    new Set([invoice.id,second.id]));
});

test('old historical snapshot spelling is unchanged when cloud JSON is deserialized',()=>{
  const {base,revision}=fixture();
  const legacy={...base,documentRevisions:[{...revision,snapshot:{
    ...revision.snapshot,items:[{...revision.snapshot.items[0],unitPrice:'1,2.00'}]}}]};
  const before=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,unrelatedExpense(legacy),structuredClone(legacy));
  assert.equal(merged.documentRevisions[0].snapshot.items[0].unitPrice,'1,2.00');
  assert.equal(merged.expenses.length,1);
  assert.equal(JSON.stringify(legacy),before);
});
