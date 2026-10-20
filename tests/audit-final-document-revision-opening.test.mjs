import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {beginRevisionDraft,createRevisionRecord,restoreRevisionSnapshot} from '../dist/src/lib/document-lifecycle.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function setup(){
  const root=emptyVault();
  const invoice=createBlankDocument('invoice','INV-2026-REVISION-SAFE',root.company);
  invoice.id='invoice-safe-revision-gate';
  invoice.status='final';invoice.lifecycleStatus='active';
  invoice.role='standard';invoice.issueDate='2026-10-01';invoice.dueDate='2026-11-01';
  invoice.items=[{...invoice.items[0],descriptionEn:'Non-stock consulting',quantity:'1',unitPrice:'135.00'}];
  return {invoice,vault:{...root,documents:[invoice]}};
}
const unrelated=(vault)=>({...vault,expenses:[{...createExpense('USD'),
  id:'revision-unrelated-expense',description:'Office electricity',amount:'8.00'}]});

test('a local direct final-to-draft transition cannot discard the original issued invoice without a snapshot',()=>{
  const {invoice,vault}=setup(),original=JSON.stringify(vault);
  const altered={...beginRevisionDraft(invoice),items:[
    {...invoice.items[0],unitPrice:'15.00'}]};
  assert.throws(()=>mergeVaultIntent(vault,{...vault,documents:[altered]},vault),
    /final document revision.*snapshot/i);
  assert.equal(JSON.stringify(vault),original);
});

test('a remote final-to-draft transition without its original snapshot cannot ride an unrelated local save',()=>{
  const {invoice,vault}=setup(),original=JSON.stringify(vault);
  const remote={...vault,documents:[beginRevisionDraft(invoice)]};
  assert.throws(()=>mergeVaultIntent(vault,unrelated(vault),remote),
    /final document revision.*snapshot/i);
  assert.equal(JSON.stringify(vault),original);
});

test('a forged original revision snapshot or unincremented draft revision must be rejected',()=>{
  const {invoice,vault}=setup(),revision=createRevisionRecord(invoice);
  const forged={...revision,snapshot:{...revision.snapshot,items:[
    {...revision.snapshot.items[0],unitPrice:'1.00'}]}};
  const draft=beginRevisionDraft(invoice);
  assert.throws(()=>mergeVaultIntent(vault,{
    ...vault,documents:[draft],documentRevisions:[forged]
  },vault),/final document revision.*snapshot/i);
  const invalidDraft={...draft,revision:invoice.revision};
  assert.throws(()=>mergeVaultIntent(vault,{
    ...vault,documents:[invalidDraft],documentRevisions:[revision]
  },vault),/final document revision.*number/i);
});

test('normal issuance-to-revision sequence saves the final snapshot and permits discard restoration',()=>{
  const {invoice,vault}=setup(),draft=beginRevisionDraft(invoice);
  const revision=createRevisionRecord(invoice);
  const saved=mergeVaultIntent(vault,{...vault,documents:[draft],documentRevisions:[revision]},vault);
  assert.equal(saved.documents[0].status,'draft');
  assert.equal(saved.documents[0].revision,2);
  assert.equal(saved.documentRevisions[0].snapshot.items[0].unitPrice,'135.00');
  const restored=restoreRevisionSnapshot(saved.documents[0],saved.documentRevisions);
  assert.equal(restored.status,'final');
  assert.equal(restored.items[0].unitPrice,'135.00');
  const discarded=mergeVaultIntent(saved,{...saved,documents:[restored]},saved);
  assert.equal(discarded.documents[0].status,'final');
  assert.equal(discarded.documentRevisions.length,1);
});

test('valid remote revision opening survives independent expense save and preserves historical snapshots unchanged',()=>{
  const {invoice,vault}=setup();
  const validRemote={...vault,documents:[beginRevisionDraft(invoice)],
    documentRevisions:[createRevisionRecord(invoice)]};
  const before=JSON.stringify(vault);
  const merged=mergeVaultIntent(vault,unrelated(vault),validRemote);
  assert.equal(merged.documents[0].status,'draft');
  assert.equal(merged.documentRevisions.length,1);
  assert.equal(merged.documentRevisions[0].snapshot.items[0].unitPrice,'135.00');
  assert.equal(merged.expenses.length,1);
  assert.equal(JSON.stringify(vault),before);
});
