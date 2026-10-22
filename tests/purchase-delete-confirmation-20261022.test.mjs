import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createPurchase,createPurchaseItem,createSupplier} from '../dist/src/lib/operations.js';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope} from '../dist/src/lib/workspaces.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {appendAuditEventsForVaultDiff} from '../dist/src/lib/audit-diff.js';
import {synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';

async function fixture(){
  const full=emptyVault(),supplier={...createSupplier(),id:'qa-supplier',nameEn:'QA Supplier'};
  const purchase={...createPurchase([],[supplier]),id:'qa-purchase',workspaceId:'default',branchId:'main'};
  purchase.items=[{...createPurchaseItem(),descriptionEn:'QA service',quantity:'2',unitCost:'50'}];
  full.suppliers=[supplier];full.purchases=[purchase];
  full.branches.push({...full.branches[0],id:'east',name:'East'});
  full.purchases.push({...structuredClone(purchase),id:'qa-hidden',number:'QA-HIDDEN',branchId:'east'});
  let stored={uid:'qa-account',localRevision:1,payload:structuredClone(full)},writes=0,syncs=0,reject=false;
  const toasts=[];
  const source=await readFile('src/app/App.tsx','utf8');
  const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
  const context={exports:{},Error,Promise,structuredClone,t:en=>en,scopeVault,applyWorkspaceScope,overlayWorkspaceScope,
    mergeVaultIntent,appendAuditEventsForVaultDiff,synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,
    currentCloudUser:()=>({uid:'qa-account'}),activeAccountStorageUid:()=> 'qa-account',
    getPlainWorkspace:async()=>structuredClone(stored),
    updatePlainWorkspaceIfUnchanged:async(uid,revision,payload)=>{
      if(reject||uid!==stored.uid||revision!==stored.localRevision)return null;
      writes++;stored={uid,localRevision:revision+1,payload:structuredClone(payload)};return stored;
    }};
  const code='class Harness{'+section('private persist=async(','private persistFullMutation=async(')
    +section('private deletePurchaseRecord=async(','private reversePurchaseRecord=async(')+'}\nexports.Harness=Harness;';
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  const h=new context.exports.Harness();h.state={vault:structuredClone(full),cloudUser:{uid:'qa-account'},unlocked:true};
  h.requireVault=()=>scopeVault(h.state.vault);h.vaultWriteTail=Promise.resolve(null);h.waitForProtectedDataOperation=async()=>{};
  h.setState=(patch,done)=>{Object.assign(h.state,patch);done?.();};h.scheduleCloudSync=()=>syncs++;
  h.showToast=(message,tone)=>toasts.push({message,tone});
  return{h,purchase,get:()=>stored,counts:()=>({writes,syncs}),toasts,reject:()=>{reject=true;}};
}

for(const change of ['notes','cost'])for(const sameTimestamp of [false,true])
test(`stale purchase deletion confirmation preserves a completed ${change} edit (same timestamp=${sameTimestamp})`,async()=>{
  const p=await fixture(),confirmed=structuredClone(p.purchase),base=p.h.requireVault();
  const current={...p.purchase,updatedAt:sameTimestamp?p.purchase.updatedAt:'2099-01-01T00:00:00.000Z'};
  if(change==='notes')current.notes='New reviewed purchase instructions';
  else current.items=current.items.map(row=>({...row,unitCost:'75'}));
  await p.h.persist({...base,purchases:base.purchases.map(row=>row.id===current.id?current:row)});
  const before=JSON.stringify(p.get()),counts=p.counts();
  await assert.rejects(p.h.deletePurchaseRecord(confirmed),/purchase.*changed|draft.*changed/i);
  assert.equal(JSON.stringify(p.get()),before,'a stale confirmation must not write or delete newer purchase content');
  assert.deepEqual(p.counts(),counts);assert.equal(p.toasts.length,0);
});

test('ordinary purchase deletion keeps one audit event and preserves other branches',async()=>{
  const p=await fixture(),hidden=structuredClone(p.get().payload.purchases.find(row=>row.id==='qa-hidden'));
  await p.h.deletePurchaseRecord(structuredClone(p.purchase));
  const saved=p.get().payload;
  assert.ok(!saved.purchases.some(row=>row.id===p.purchase.id));
  assert.deepEqual(saved.purchases.find(row=>row.id==='qa-hidden'),hidden);
  assert.equal(saved.documentEvents.filter(row=>row.auditEntityId===p.purchase.id&&row.auditAction==='deleted').length,1);
  assert.deepEqual(p.counts(),{writes:1,syncs:1});assert.equal(p.toasts.at(-1)?.tone,'success');
});

test('timestamp-only and canonical default-scope changes do not block purchase deletion',async()=>{
  const p=await fixture(),confirmed={...p.purchase,updatedAt:'2026-01-01T00:00:00.000Z'};
  delete confirmed.workspaceId;delete confirmed.branchId;
  await p.h.deletePurchaseRecord(confirmed);
  assert.ok(!p.get().payload.purchases.some(row=>row.id===confirmed.id));
});

test('failed purchase deletion CAS reports no success and preserves the stored draft',async()=>{
  const p=await fixture(),before=JSON.stringify(p.get());p.reject();
  await assert.rejects(p.h.deletePurchaseRecord(p.purchase),/Another tab updated/i);
  assert.equal(JSON.stringify(p.get()),before);assert.equal(p.toasts.length,0);
  assert.deepEqual(p.counts(),{writes:0,syncs:0});
});

test('a purchase posted after opening deletion confirmation remains protected',async()=>{
  const p=await fixture();p.h.state.vault.purchases[0].status='posted';
  await assert.rejects(p.h.deletePurchaseRecord(p.purchase),/Only draft purchases/i);
  assert.deepEqual(p.counts(),{writes:0,syncs:0});assert.equal(p.toasts.length,0);
});
