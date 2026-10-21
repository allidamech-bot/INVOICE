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
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {migrateVault,synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';
import {exportPlainBackup,readPlainBackup} from '../dist/src/lib/backup.js';

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
  const context={exports:{},Error,Promise,structuredClone,scopeVault,applyWorkspaceScope,overlayWorkspaceScope,mergeVaultIntent,
    appendAuditEventsForVaultDiff,synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,
    currentCloudUser:()=>({uid:stored.uid}),activeAccountStorageUid:()=>stored.uid,
    getPlainWorkspace:async()=>structuredClone(stored),
    updatePlainWorkspaceIfUnchanged:async(uid,revision,next)=>{
      if(rejectCas||uid!==stored.uid||revision!==stored.localRevision)return null;
      writes++;stored={...stored,localRevision:'qa-r'+(writes+1),payload:structuredClone(next)};return stored;
    }};
  vm.runInNewContext(ts.transpileModule('class Harness{'+source.slice(start,end)+'}\nexports.Harness=Harness;',
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  const h=new context.exports.Harness();h.state={vault:structuredClone(f.full),cloudUser:{uid:stored.uid},unlocked:true};
  h.requireVault=()=>scopeVault(h.state.vault);h.vaultWriteTail=Promise.resolve(null);
  h.waitForProtectedDataOperation=async()=>{};h.setState=(patch,done)=>{Object.assign(h.state,patch);done?.();};h.scheduleCloudSync=()=>{syncs++;};
  return{h,get:()=>stored,counts:()=>({writes,syncs}),reject:value=>{rejectCas=value;}};
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
