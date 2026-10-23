import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createDocumentEvent} from '../dist/src/lib/document-lifecycle.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope} from '../dist/src/lib/workspaces.js';
import {appendAuditEventsForVaultDiff} from '../dist/src/lib/audit-diff.js';
import {synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';
import {readPlainBackup} from '../dist/src/lib/backup.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const root=emptyVault();
  const invoice=createBlankDocument('invoice','INV-AUDIT-EVENT-001',root.company);
  invoice.id='invoice-event-collisions';invoice.status='final';invoice.lifecycleStatus='active';
  invoice.workspaceId='default';invoice.branchId='main';
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


for(const [field,value] of Object.entries({type:'payment-deleted',amount:'20.00',note:'Different reference',
 at:'2099-01-01T00:00:00.000Z',documentId:'other-invoice',workspaceId:'other-company',branchId:'other-branch',auditActorKind:'system'}))
test(`concurrent new event ID collision rejects different ${field} on either device`,()=>{
 const {base,first}=fixture(),second={...first,[field]:value};
 for(const [local,remote] of [[first,second],[second,first]]){
  const intended={...base,documentEvents:[local]},latest={...base,documentEvents:[remote]};
  const snapshot=JSON.stringify({base,intended,latest});
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/concurrent document event ID collision/i);
  assert.equal(JSON.stringify({base,intended,latest}),snapshot,'rejection cannot rewrite either audit source');
 }
});

test('identical new-event replay accepts key ordering and canonical legacy scope without duplicating evidence',async()=>{
 const {base,first}=fixture(),canonical={...first,workspaceId:'default',branchId:'main'};
 const legacy=Object.fromEntries(Object.entries(canonical).reverse());delete legacy.workspaceId;delete legacy.branchId;
 for(const local of [structuredClone(canonical),legacy]){
  const merged=mergeVaultIntent(base,{...base,documentEvents:[local]},{...base,documentEvents:[canonical]});
  assert.equal(merged.documentEvents.length,1);assert.equal(merged.documentEvents[0].id,first.id);
  assert.equal(merged.documentEvents[0].amount,'35.00');assert.equal(merged.documentEvents[0].type,'payment-recorded');
  const text=JSON.stringify({format:'LOUREX_WORKSPACE_EXPORT_V2',version:2,payload:merged});
  const restored=await readPlainBackup({size:Buffer.byteLength(text),text:async()=>text});
  assert.deepEqual(restored.documentEvents,merged.documentEvents,'backup retains the single accepted event');
 }
});

test('actual App.persist rejects event collisions before CAS and preserves accepted remote audit/UI state',async()=>{
 const {base,first,second}=fixture(),remote={...base,documentEvents:[second]},intended={...base,documentEvents:[first]};
 let stored={uid:'qa-event-account',localRevision:1,payload:structuredClone(remote)},writes=0,syncs=0;
 const context={exports:{},Error,Promise,structuredClone,scopeVault,applyWorkspaceScope,overlayWorkspaceScope,
  mergeVaultIntent,appendAuditEventsForVaultDiff,synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,
  currentCloudUser:()=>({uid:stored.uid}),activeAccountStorageUid:()=>stored.uid,
  getPlainWorkspace:async()=>structuredClone(stored),updatePlainWorkspaceIfUnchanged:async(_uid,_revision,payload)=>{
   writes++;stored={...stored,payload:structuredClone(payload)};return stored;
  }};
 const source=await readFile('src/app/App.tsx','utf8'),parsed=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const member=parsed.statements.find(ts.isClassDeclaration).members.find(node=>node.name?.getText(parsed)==='persist');assert.ok(member);
 vm.runInNewContext(ts.transpileModule('class Harness{'+member.getText(parsed)+'}\nexports.Harness=Harness;',{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
 }).outputText,context);
 const h=new context.exports.Harness();h.state={vault:structuredClone(remote),cloudUser:{uid:stored.uid},unlocked:true};
 h.requireVault=()=>scopeVault(base);h.vaultWriteTail=Promise.resolve(null);h.waitForProtectedDataOperation=async()=>{};
 h.setState=(patch,done)=>{Object.assign(h.state,patch);done?.();};h.scheduleCloudSync=()=>syncs++;
 const before=JSON.stringify(stored),uiBefore=JSON.stringify(h.state.vault),intentBefore=JSON.stringify(intended);
 await assert.rejects(h.persist(intended),/concurrent document event ID collision/i);
 assert.equal(writes,0);assert.equal(syncs,0);assert.equal(JSON.stringify(stored),before);
 assert.equal(JSON.stringify(h.state.vault),uiBefore);assert.equal(JSON.stringify(intended),intentBefore);
});
