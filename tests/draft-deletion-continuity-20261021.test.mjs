import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {appendAuditEventsForVaultDiff} from '../dist/src/lib/audit-diff.js';
import {auditEventsFor} from '../dist/src/lib/audit-trail.js';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope} from '../dist/src/lib/workspaces.js';
import {mergeVaultIntent,sameDocumentContent} from '../dist/src/storage/vault-merge.js';
import {migrateVault,synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';
import {exportPlainBackup,readPlainBackup} from '../dist/src/lib/backup.js';
import {auditedDocument,createDocumentEvent} from '../dist/src/lib/document-lifecycle.js';
import {isDeliveryLinkedInvoice} from '../dist/src/lib/sales-delivery-invoice.js';

function fixture(kind='invoice',legacy=false){
  const full=emptyVault();
  const draft={...createBlankDocument(kind,'QA-DRAFT-DELETE',full.company),id:'qa-deleted-draft',
    ...(legacy?{}:{workspaceId:'default',branchId:'main'})};
  const keep={...createBlankDocument('proforma','QA-KEEP',full.company),id:'qa-kept-draft',workspaceId:'default',branchId:'main'};
  full.documents=[draft,keep];
  // An inactive branch's record and event must remain byte-for-byte intact.
  full.branches.push({...full.branches[0],id:'east',name:'East'});
  full.documents.push({...keep,id:'qa-hidden',number:'QA-HIDDEN',branchId:'east'});
  const hiddenBefore={...full,documents:full.documents.filter(row=>row.id!=='qa-hidden')};
  const hiddenDeletion=appendAuditEventsForVaultDiff(full,hiddenBefore).documentEvents[0];
  full.documentEvents=[{...hiddenDeletion,id:'qa-prior-east-event'}];
  const base=scopeVault(full);
  const deleted=appendAuditEventsForVaultDiff(base,{...base,documents:base.documents.filter(row=>row.id!==draft.id)});
  const remote=overlayWorkspaceScope(full,deleted);
  return{full,base,draft,remote};
}
function unrelated(base){return applyWorkspaceScope(base,{...base,appSettings:{...base.appSettings,autoLockMinutes:15}});}
function deletion(vault,id='qa-deleted-draft'){return auditEventsFor(vault.documentEvents,'document',id).filter(e=>e.auditAction==='deleted');}

for(const kind of ['invoice','proforma','purchase-order'])for(const legacy of [false,true])
test(`stale unrelated save retains a deleted ${kind} and its single audit event (legacy=${legacy})`,()=>{
  const f=fixture(kind,legacy),original=JSON.stringify(f.remote),event=deletion(f.remote)[0];
  const merged=mergeVaultIntent(f.base,unrelated(f.base),scopeVault(f.remote));
  const next=overlayWorkspaceScope(f.remote,appendAuditEventsForVaultDiff(scopeVault(f.remote),merged));
  assert.ok(!next.documents.some(row=>row.id===f.draft.id),'stale save must not resurrect the deleted draft');
  assert.deepEqual(deletion(next),[event]);
  assert.equal(next.appSettings.autoLockMinutes,15);
  assert.deepEqual(next.documents.find(row=>row.id==='qa-hidden'),f.remote.documents.find(row=>row.id==='qa-hidden'));
  assert.deepEqual(next.documentEvents.find(row=>row.id==='qa-prior-east-event'),f.remote.documentEvents.find(row=>row.id==='qa-prior-east-event'));
  assert.equal(JSON.stringify(f.remote),original,'merge must not change its source');
});

test('stale edits or issuance of a deleted draft reject the whole save without discarding local work',()=>{
  for(const patch of [{notes:'Unsaved local work'},{status:'final'}, {number:'RENUMBERED'}, {issueDate:'2026-10-20'}]){
    const f=fixture(),candidate=applyWorkspaceScope(f.base,{...f.base,documents:f.base.documents.map(row=>row.id===f.draft.id?{...row,...patch}:row)});
    const intendedBefore=JSON.stringify(candidate),remoteBefore=JSON.stringify(f.remote);
    assert.throws(()=>mergeVaultIntent(f.base,candidate,scopeVault(f.remote)),/removed.*another.*save|deleted.*another.*save/i);
    assert.equal(JSON.stringify(candidate),intendedBefore);assert.equal(JSON.stringify(f.remote),remoteBefore);
  }
});

test('new drafts, deliberate local deletion and a surviving concurrently edited draft keep their supported behavior',()=>{
  const f=fixture(),fresh={...f.draft,id:'qa-new-draft',number:'QA-NEW'};
  const added=mergeVaultIntent(f.base,applyWorkspaceScope(f.base,{...f.base,documents:[...f.base.documents,fresh]}),scopeVault(f.remote));
  assert.ok(added.documents.some(row=>row.id===fresh.id));
  assert.ok(!added.documents.some(row=>row.id===f.draft.id));
  const removed=mergeVaultIntent(f.base,applyWorkspaceScope(f.base,{...f.base,documents:f.base.documents.filter(row=>row.id!==f.draft.id)}),f.base);
  assert.equal(deletion(appendAuditEventsForVaultDiff(f.base,removed)).length,1);
  const changed={...f.base,documents:f.base.documents.map(row=>row.id===f.draft.id?{...row,notes:'Remote change',updatedAt:'2099-01-01T00:00:00.000Z'}:row)};
  const retained=mergeVaultIntent(f.base,applyWorkspaceScope(f.base,{...f.base,documents:f.base.documents.filter(row=>row.id!==f.draft.id)}),changed);
  assert.equal(retained.documents.find(row=>row.id===f.draft.id).notes,'Remote change');
  assert.equal(deletion(appendAuditEventsForVaultDiff(changed,retained)).length,0,'a retained draft must not get a false deletion event');
});

async function persistence(f){
  const source=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');
  const start=source.indexOf('private persist=async('),end=source.indexOf('private persistFullMutation=async(',start);
  assert.ok(start>=0&&end>start);
  let stored={uid:'qa-audit-account',localRevision:'qa-r1',payload:structuredClone(f.full)},rejectCas=false,writes=0,syncs=0;
  const toasts=[];
  const context={exports:{},Error,Promise,structuredClone,scopeVault,applyWorkspaceScope,overlayWorkspaceScope,mergeVaultIntent,
    auditedDocument,isDeliveryLinkedInvoice,sameDocumentContent,t:en=>en,
    appendAuditEventsForVaultDiff,synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,
    currentCloudUser:()=>({uid:stored.uid}),activeAccountStorageUid:()=>stored.uid,
    getPlainWorkspace:async()=>structuredClone(stored),
    updatePlainWorkspaceIfUnchanged:async(uid,revision,next)=>{
      if(rejectCas||uid!==stored.uid||revision!==stored.localRevision)return null;
      writes++;stored={...stored,localRevision:'qa-r'+(writes+1),payload:structuredClone(next)};return stored;
    }};
  const deleteStart=source.indexOf('private deleteDocument=async('),deleteEnd=source.indexOf('private savePayment=async(',deleteStart);
  assert.ok(deleteStart>=0&&deleteEnd>deleteStart);
  vm.runInNewContext(ts.transpileModule('class Harness{'+source.slice(start,end)+source.slice(deleteStart,deleteEnd)+'}\nexports.Harness=Harness;',
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  const h=new context.exports.Harness();h.state={vault:structuredClone(f.full),cloudUser:{uid:stored.uid},unlocked:true};
  h.requireVault=()=>scopeVault(h.state.vault);h.vaultWriteTail=Promise.resolve(null);
  h.waitForProtectedDataOperation=async()=>{};h.setState=(patch,done)=>{Object.assign(h.state,patch);done?.();};h.scheduleCloudSync=()=>{syncs++;};
  h.showToast=(message,tone)=>toasts.push({message,tone});
  return{h,get:()=>stored,counts:()=>({writes,syncs}),reject:value=>{rejectCas=value;},toasts};
}

test('real App save queue does not recreate a deleted draft on replay and does not commit an audit event after failed CAS',async()=>{
  const f=fixture(),p=await persistence(f),base=p.h.requireVault();
  const removed={...base,documents:base.documents.filter(row=>row.id!==f.draft.id)};
  const first=p.h.persist(removed),stale=p.h.persist(unrelated(base));await Promise.all([first,stale]);
  assert.ok(!p.get().payload.documents.some(row=>row.id===f.draft.id));
  assert.equal(deletion(p.get().payload).length,1);assert.deepEqual(p.counts(),{writes:2,syncs:2});
  const failed=await persistence(f),snapshot=JSON.stringify(failed.get());failed.reject(true);
  await assert.rejects(failed.h.persist(removed),/Another tab updated/);
  assert.equal(JSON.stringify(failed.get()),snapshot);assert.deepEqual(failed.counts(),{writes:0,syncs:0});
  failed.reject(false);await failed.h.persist(removed);assert.equal(deletion(failed.get().payload).length,1);
});

test('actual portable backup export/import and reload normalization preserve the deleted draft identity and event once',async()=>{
  const f=fixture(),original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let captured;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{share:async({files})=>{captured=files[0];}}});
  try{
    await exportPlainBackup(f.remote);assert.ok(captured instanceof File);
    const imported=await readPlainBackup(captured),reloaded=migrateVault(JSON.parse(JSON.stringify(imported)));
    assert.deepEqual(deletion(imported),deletion(f.remote),'portable backup preserves the complete event');
    assert.ok(!reloaded.documents.some(row=>row.id===f.draft.id));
    // Existing reload normalization fills an empty event currency. Preserve
    // that established behavior; this nonfinancial deletion has no amount.
    assert.deepEqual(deletion(reloaded),deletion(f.remote).map(event=>({...event,currency:'USD'})));
    const replay=mergeVaultIntent(scopeVault(reloaded),unrelated(scopeVault(reloaded)),scopeVault(reloaded));
    assert.equal(deletion(appendAuditEventsForVaultDiff(scopeVault(reloaded),replay)).length,1);
  }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('real App rejects a queued stale autosave after deletion while retaining the editor changes and committed audit event',async()=>{
  const f=fixture(),p=await persistence(f),base=p.h.requireVault();
  const edited={...base,documents:base.documents.map(row=>row.id===f.draft.id?{...row,notes:'Keep my unsaved text'}:row)};
  p.h.state.editorDoc=edited.documents.find(row=>row.id===f.draft.id);
  const editorBefore=JSON.stringify(p.h.state.editorDoc);
  const removed=p.h.persist({...base,documents:base.documents.filter(row=>row.id!==f.draft.id)});
  const rejected=assert.rejects(p.h.persist(edited),/removed.*another.*save/i);
  await Promise.all([removed,rejected]);
  assert.equal(JSON.stringify(p.h.state.editorDoc),editorBefore);
  assert.ok(!p.get().payload.documents.some(row=>row.id===f.draft.id));
  assert.equal(deletion(p.get().payload).length,1);assert.deepEqual(p.counts(),{writes:1,syncs:1});
});

for(const legacy of [false,true])test(`scope-stamped unrelated and timestamp-only saves preserve newer draft content (legacy=${legacy})`,()=>{
  const f=fixture('proforma',legacy),latest={...f.base,documents:f.base.documents.map(row=>row.id===f.draft.id
    ?{...row,notes:'Newer remote text',updatedAt:'2099-01-01T00:00:00.000Z'}:row)};
  for(const touch of [false,true]){
    const intended=unrelated(f.base);
    if(touch)intended.documents=intended.documents.map(row=>row.id===f.draft.id?{...row,updatedAt:'2099-01-02T00:00:00.000Z'}:row);
    const merged=mergeVaultIntent(f.base,intended,latest);
    assert.deepEqual(merged.documents.find(row=>row.id===f.draft.id),latest.documents.find(row=>row.id===f.draft.id));
    assert.equal(merged.appSettings.autoLockMinutes,15);
  }
});

test('conflicting draft edits or issuance reject the whole stale save even when timestamps match',()=>{
  for(const status of ['draft','final'])for(const changedAt of [f=>f.draft.updatedAt,()=> '2099-01-01T00:00:00.000Z']){
    const f=fixture(),latest={...f.base,documents:f.base.documents.map(row=>row.id===f.draft.id
      ?{...row,notes:'Remote work',updatedAt:changedAt(f)}:row)};
    const intended=applyWorkspaceScope(f.base,{...f.base,documents:f.base.documents.map(row=>row.id===f.draft.id
      ?{...row,status,notes:'Local work'}:row)});
    const before=JSON.stringify({latest,intended});
    assert.throws(()=>mergeVaultIntent(f.base,intended,latest),/changed.*another.*save/i);
    assert.equal(JSON.stringify({latest,intended}),before,'neither side of a rejected conflict is mutated');
  }
});

test('independent draft edits, identical concurrent content and timestamp-only remote changes can still save',()=>{
  const f=fixture(),local={...f.draft,notes:'Local work',updatedAt:'2099-01-01T00:00:00.000Z'};
  const intended=applyWorkspaceScope(f.base,{...f.base,documents:f.base.documents.map(row=>row.id===local.id?local:row)});
  for(const remote of [f.draft,{...f.draft,updatedAt:'2099-01-02T00:00:00.000Z'}, {...local,updatedAt:'2099-01-03T00:00:00.000Z'}]){
    const latest={...f.base,documents:f.base.documents.map(row=>row.id===remote.id?remote:row)};
    assert.equal(mergeVaultIntent(f.base,intended,latest).documents.find(row=>row.id===local.id).notes,'Local work');
  }
  const other={...f.base,documents:f.base.documents.map(row=>row.id!==local.id?{...row,notes:'Other document work'}:row)};
  const merged=mergeVaultIntent(f.base,intended,other);
  assert.equal(merged.documents.find(row=>row.id===local.id).notes,'Local work');
  assert.equal(merged.documents.find(row=>row.id!==local.id).notes,'Other document work');
});

for(const kind of ['proforma','invoice','purchase-order'])
test(`different concurrent ${kind} issuances cannot overwrite the already issued version`,()=>{
  for(const matchingTimestamp of [false,true]){
    const f=fixture(kind),draft={...f.draft,
      customerSnapshot:{sourceCustomerId:'qa-buyer',companyNameEn:'QA Buyer',companyNameAr:''},
      items:[{...f.draft.items[0],descriptionEn:'QA service',quantity:'1',unitPrice:'100',stockTreatment:'non-stock'}]};
    const base={...f.base,documents:f.base.documents.map(row=>row.id===draft.id?draft:row)};
    const remote={...draft,status:'final',notes:'Already issued on device A',updatedAt:matchingTimestamp?draft.updatedAt:'2099-01-01T00:00:00.000Z'};
    const local={...draft,status:'final',notes:'Different issue on device B'};
    const latest={...base,documents:base.documents.map(row=>row.id===draft.id?remote:row)};
    const intended=applyWorkspaceScope(base,{...base,documents:base.documents.map(row=>row.id===draft.id?local:row)});
    const before=JSON.stringify({base,latest,intended});
    assert.throws(()=>mergeVaultIntent(base,intended,latest),/issued.*another.*save/i);
    assert.equal(JSON.stringify({base,latest,intended}),before,'rejected issuance must preserve both source versions');
  }
});

test('ordinary issuance and identical concurrent issuance replay remain supported',()=>{
  const f=fixture('proforma'),issued={...f.draft,status:'final',notes:'Reviewed issue'};
  const intended=applyWorkspaceScope(f.base,{...f.base,documents:f.base.documents.map(row=>row.id===issued.id?issued:row)});
  const normal=mergeVaultIntent(f.base,intended,f.base);
  assert.equal(normal.documents.find(row=>row.id===issued.id).status,'final');
  const latest={...f.base,documents:f.base.documents.map(row=>row.id===issued.id?{...issued,updatedAt:'2099-01-01T00:00:00.000Z'}:row)};
  const replay=mergeVaultIntent(f.base,intended,latest);
  assert.ok(sameDocumentContent(replay.documents.find(row=>row.id===issued.id),issued));
});

test('real App queue rejects conflicting issuance before a second commit or issuance event',async()=>{
  const f=fixture('proforma'),p=await persistence(f),base=p.h.requireVault();
  const issue=notes=>({...base,documents:base.documents.map(row=>row.id===f.draft.id?{...row,status:'final',notes}:row),
    documentEvents:[...base.documentEvents,createDocumentEvent({...f.draft,status:'final'},'issued',notes)]});
  const first=p.h.persist(issue('First approved issue'));
  const second=assert.rejects(p.h.persist(issue('Conflicting second issue')),/issued.*another.*save/i);
  await Promise.all([first,second]);
  assert.equal(p.get().payload.documents.find(row=>row.id===f.draft.id).notes,'First approved issue');
  assert.equal(p.get().payload.documentEvents.filter(row=>row.documentId===f.draft.id&&row.type==='issued').length,1);
  assert.deepEqual(p.counts(),{writes:1,syncs:1});
});

test('real App queue preserves a newer draft through unrelated settings saves and rejects competing text without a second commit',async()=>{
  for(const conflict of [false,true]){
    const f=fixture(),p=await persistence(f),base=p.h.requireVault();
    const first={...base,documents:base.documents.map(row=>row.id===f.draft.id?{...row,notes:'First committed work'}:row)};
    const second=conflict?{...base,documents:base.documents.map(row=>row.id===f.draft.id?{...row,notes:'Competing unsaved work'}:row)}:unrelated(base);
    const input=JSON.stringify(second),saving=p.h.persist(first);
    const next=p.h.persist(second);
    const finished=conflict?assert.rejects(next,/changed.*another.*save/i):next;
    await Promise.all([saving,finished]);
    assert.equal(p.get().payload.documents.find(row=>row.id===f.draft.id).notes,'First committed work');
    assert.equal(JSON.stringify(second),input);assert.equal(deletion(p.get().payload).length,0);
    assert.deepEqual(p.counts(),{writes:conflict?1:2,syncs:conflict?1:2});
  }
});

for(const status of ['draft','final'])test(`delete action reports a retained concurrent ${status} truthfully without a deletion event`,async()=>{
  const f=fixture('proforma'),p=await persistence(f),base=p.h.requireVault();
  p.h.state.deletingDoc=f.draft;
  const first=p.h.persist({...base,documents:base.documents.map(row=>row.id===f.draft.id
    ?{...row,status,notes:'Saved before deletion',updatedAt:'2099-01-01T00:00:00.000Z'}:row)});
  const removed=p.h.deleteDocument();await Promise.all([first,removed]);
  const retained=p.get().payload.documents.find(row=>row.id===f.draft.id);
  assert.equal(retained?.notes,'Saved before deletion');assert.equal(retained?.status,status);
  assert.equal(deletion(p.get().payload).length,0);
  assert.equal(p.toasts.some(row=>row.tone==='success'),false,'retained document must never be reported as deleted');
  assert.equal(p.toasts.at(-1)?.tone,'error');assert.match(p.toasts.at(-1).message,/not deleted|changed/i);
  assert.equal(p.h.state.deletingDoc,null,'stale confirmation must close so retry requires reviewing the current row');
});

test('concurrent content changes with unchanged timestamps also survive a stale delete request',async()=>{
  const f=fixture('proforma'),p=await persistence(f),base=p.h.requireVault();p.h.state.deletingDoc=f.draft;
  const saved=p.h.persist({...base,documents:base.documents.map(row=>row.id===f.draft.id?{...row,notes:'Newer content, same timestamp'}:row)});
  const deleted=p.h.deleteDocument();await Promise.all([saved,deleted]);
  assert.equal(p.get().payload.documents.find(row=>row.id===f.draft.id)?.notes,'Newer content, same timestamp');
  assert.equal(deletion(p.get().payload).length,0);assert.equal(p.toasts.at(-1)?.tone,'error');
});

test('ordinary draft deletion reports success only after removal, and a failed local save never reports success',async()=>{
  for(const fail of [false,true]){
    const f=fixture(),p=await persistence(f);p.h.state.deletingDoc=f.draft;p.reject(fail);
    await p.h.deleteDocument();
    assert.equal(p.get().payload.documents.some(row=>row.id===f.draft.id),fail);
    assert.equal(deletion(p.get().payload).length,fail?0:1);
    assert.equal(p.toasts.at(-1)?.tone,fail?'error':'success');
    assert.equal(p.toasts.filter(row=>row.tone==='success').length,fail?0:1);
  }
});

test('a session change after local deletion cannot report success against another or unavailable account view',async()=>{
  for(const change of ['account','locked']){
    const f=fixture(),p=await persistence(f);p.h.state.deletingDoc=f.draft;
    p.h.scheduleCloudSync=()=>{
      if(change==='account')p.h.state.cloudUser={uid:'qa-other-account'};
      else p.h.state.vault=null;
    };
    await p.h.deleteDocument();
    assert.ok(!p.get().payload.documents.some(row=>row.id===f.draft.id),'the original local operation already completed');
    assert.equal(deletion(p.get().payload).length,1);
    assert.equal(p.toasts.some(row=>row.tone==='success'),false);
    assert.equal(p.toasts.at(-1)?.tone,'error');assert.match(p.toasts.at(-1).message,/confirmed|session/i);
  }
});

test('a delete confirmation opened before a completed edit cannot delete the newer document without review',async()=>{
  const f=fixture('proforma'),p=await persistence(f),base=p.h.requireVault();p.h.state.deletingDoc=f.draft;
  await p.h.persist({...base,documents:base.documents.map(row=>row.id===f.draft.id?{...row,notes:'Edited while confirmation was open'}:row)});
  const before=JSON.stringify(p.get()),count=p.counts();
  await p.h.deleteDocument();
  assert.equal(JSON.stringify(p.get()),before,'stale confirmation must not commit a deletion');
  assert.deepEqual(p.counts(),count);assert.equal(deletion(p.get().payload).length,0);
  assert.equal(p.toasts.at(-1)?.tone,'error');assert.equal(p.h.state.deletingDoc,null);
});
