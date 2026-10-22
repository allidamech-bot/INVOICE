import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createPurchase,createPurchaseItem,createSupplier,validatePurchase,supplierSnapshotFrom} from '../dist/src/lib/operations.js';
import {postPurchase} from '../dist/src/lib/operations.js';
import {supplierPayablesByCurrency} from '../dist/src/lib/payables.js';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope} from '../dist/src/lib/workspaces.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {appendAuditEventsForVaultDiff} from '../dist/src/lib/audit-diff.js';
import {synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';

function harness(source,names,context){
  const parsed=ts.createSourceFile('source.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const cls=parsed.statements.find(node=>ts.isClassDeclaration(node));
  assert.ok(cls);
  const members=cls.members.filter(node=>node.name&&names.includes(node.name.getText(parsed))).map(node=>node.getText(parsed));
  vm.runInNewContext(ts.transpileModule('class Harness{'+members.join('\n')+'}\nexports.Harness=Harness;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText,context);
  return new context.exports.Harness();
}

async function fixture(){
  const full=emptyVault(),supplier={...createSupplier(),id:'qa-supplier',nameEn:'Synthetic supplier'};
  const purchase={...createPurchase([],[supplier]),id:'qa-purchase',workspaceId:'default',branchId:'main'};
  purchase.items=[{...createPurchaseItem(),descriptionEn:'Synthetic service',quantity:'2',unitCost:'50'}];
  full.suppliers=[supplier];full.purchases=[purchase];
  full.branches.push({...full.branches[0],id:'east',name:'East'});
  full.purchases.push({...structuredClone(purchase),id:'qa-hidden',number:'QA-HIDDEN',branchId:'east'});
  let stored={uid:'qa-account',localRevision:1,payload:structuredClone(full)},writes=0,syncs=0,gates=0,page;
  const toasts=[];
  const appContext={exports:{},Error,Promise,structuredClone,t:en=>en,postPurchase,
    approvalGate:()=>{gates++;return{allowed:true};},scopeVault,applyWorkspaceScope,overlayWorkspaceScope,
    mergeVaultIntent,appendAuditEventsForVaultDiff,synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,
    currentCloudUser:()=>({uid:'qa-account'}),activeAccountStorageUid:()=> 'qa-account',
    getPlainWorkspace:async()=>structuredClone(stored),
    updatePlainWorkspaceIfUnchanged:async(uid,revision,payload)=>{
      if(uid!==stored.uid||revision!==stored.localRevision)return null;
      writes++;stored={uid,localRevision:revision+1,payload:structuredClone(payload)};return stored;
    }};
  const h=harness(await readFile('src/app/App.tsx','utf8'),['persist','postPurchaseRecord'],appContext);
  h.state={vault:structuredClone(full),cloudUser:{uid:'qa-account'},unlocked:true};
  h.requireVault=()=>scopeVault(h.state.vault);h.vaultWriteTail=Promise.resolve(null);h.waitForProtectedDataOperation=async()=>{};
  h.setState=(patch,done)=>{Object.assign(h.state,patch);if(page)page.props.purchases=h.requireVault().purchases;done?.();};
  h.scheduleCloudSync=()=>syncs++;h.showToast=(message,tone)=>toasts.push({message,tone});
  const pageContext={exports:{},Error,Promise,structuredClone,t:en=>en,validatePurchase,createPurchase,createPurchaseItem,supplierSnapshotFrom};
  page=harness(await readFile('src/components/OperationsPage.tsx','utf8'),[
    'mutationInFlight','editorBaseline','purchasePostingBaseline','viewPurchase','newPurchase','newPurchaseForSupplier','postPurchase','confirmAction','runMutation','fail',
  ],pageContext);
  page.state={purchaseEdit:null,confirmAction:null,error:'',busy:false};
  page.props={purchases:h.requireVault().purchases,suppliers:[supplier],items:[],defaultCurrency:'USD',onPostPurchase:h.postPurchaseRecord};
  page.setState=patch=>Object.assign(page.state,typeof patch==='function'?patch(page.state):patch);
  page.confirmDiscardCurrent=()=>true;
  page.viewPurchase(structuredClone(purchase));
  const change=async field=>{
    const base=h.requireVault(),next=structuredClone(base.purchases.find(row=>row.id===purchase.id));
    if(field==='cost')next.items[0].unitCost='75';else next.notes='New saved purchase instructions';
    await h.persist({...base,purchases:base.purchases.map(row=>row.id===next.id?next:row)});
  };
  return{h,page,purchase,change,get:()=>stored,counts:()=>({writes,syncs,gates}),toasts};
}

for(const field of ['cost','notes'])for(const when of ['before confirmation','after confirmation'])
test(`purchase posting rejects saved ${field} changes ${when} without a write or success`,async()=>{
  const p=await fixture();
  if(when==='before confirmation')await p.change(field);
  p.page.postPurchase();
  if(when==='after confirmation')await p.change(field);
  const before=JSON.stringify(p.get()),counts=p.counts();
  await p.page.confirmAction();
  assert.match(p.page.state.error,/purchase.*changed|draft.*changed/i);
  assert.equal(JSON.stringify(p.get()),before);assert.deepEqual(p.counts(),counts);
  assert.ok(p.page.state.purchaseEdit,'preserve the editor for recovery');assert.equal(p.toasts.length,0);
});

test('deleted saved draft cannot be recreated by an old posting confirmation',async()=>{
  const p=await fixture();p.page.postPurchase();const base=p.h.requireVault();
  await p.h.persist({...base,purchases:base.purchases.filter(row=>row.id!==p.purchase.id)});
  const before=JSON.stringify(p.get()),counts=p.counts();await p.page.confirmAction();
  assert.match(p.page.state.error,/purchase.*changed|draft.*changed|no longer exists/i);
  assert.equal(JSON.stringify(p.get()),before);assert.deepEqual(p.counts(),counts);assert.equal(p.toasts.length,0);
});

test('reviewed unsaved editor changes post exactly once against the unchanged saved draft',async()=>{
  const p=await fixture(),hidden=structuredClone(p.get().payload.purchases.find(row=>row.id==='qa-hidden'));
  p.page.state.purchaseEdit.items[0].unitCost='75';p.page.postPurchase();await p.page.confirmAction();
  const saved=p.get().payload;assert.equal(p.page.state.error,'');assert.equal(p.page.state.purchaseEdit,null);
  assert.equal(supplierPayablesByCurrency(saved.purchases.filter(row=>row.id===p.purchase.id),[])[0].remaining,'150.00');
  assert.equal(saved.purchases.find(row=>row.id===p.purchase.id).status,'posted');
  assert.deepEqual(saved.purchases.find(row=>row.id==='qa-hidden'),hidden);assert.equal(saved.inventoryMovements.length,0);
  assert.equal(saved.documentEvents.filter(row=>row.auditEntityId===p.purchase.id&&row.auditAction==='posted').length,1);
  assert.deepEqual(p.counts(),{writes:1,syncs:1,gates:1});assert.equal(p.toasts.length,1);
});

test('new unsaved purchase can be posted from its confirmation',async()=>{
  const p=await fixture();p.page.newPurchase(true);
  const id=p.page.state.purchaseEdit.id;
  p.page.state.purchaseEdit.items=[{...createPurchaseItem(),descriptionEn:'New synthetic service',quantity:'2',unitCost:'50'}];
  p.page.postPurchase();await p.page.confirmAction();
  assert.equal(p.page.state.error,'');assert.equal(p.get().payload.purchases.find(row=>row.id===id).status,'posted');
  assert.deepEqual(p.counts(),{writes:1,syncs:1,gates:1});
});

test('new purchase for supplier clears the previous saved editor baseline',async()=>{
  const p=await fixture();p.page.newPurchaseForSupplier(p.page.props.suppliers[0]);
  const id=p.page.state.purchaseEdit.id;
  p.page.state.purchaseEdit.items=[{...createPurchaseItem(),descriptionEn:'Supplier synthetic service',quantity:'2',unitCost:'50'}];
  p.page.postPurchase();await p.page.confirmAction();
  assert.equal(p.page.state.error,'');assert.equal(p.get().payload.purchases.find(row=>row.id===id).status,'posted');
  assert.deepEqual(p.counts(),{writes:1,syncs:1,gates:1});
});

test('new-purchase confirmation cannot overwrite a record created with that ID in the meantime',async()=>{
  const p=await fixture();p.page.newPurchase(true);
  p.page.state.purchaseEdit.items=[{...createPurchaseItem(),descriptionEn:'New synthetic service',quantity:'2',unitCost:'50'}];
  p.page.postPurchase();const concurrent=structuredClone(p.page.state.purchaseEdit);concurrent.notes='Accepted new draft';
  await p.h.persist({...p.h.requireVault(),purchases:[...p.h.requireVault().purchases,concurrent]});
  const before=JSON.stringify(p.get()),counts=p.counts();await p.page.confirmAction();
  assert.match(p.page.state.error,/purchase.*changed|draft.*changed/i);
  assert.equal(JSON.stringify(p.get()),before);assert.deepEqual(p.counts(),counts);
});

test('timestamp-only and default-scope normalization do not invalidate the saved baseline',async()=>{
  const p=await fixture(),base=structuredClone(p.purchase);delete base.workspaceId;delete base.branchId;
  base.updatedAt='2001-01-01T00:00:00.000Z';
  await p.h.postPurchaseRecord(structuredClone(p.purchase),base);
  assert.equal(p.get().payload.purchases.find(row=>row.id===p.purchase.id).status,'posted');
});

test('missing or mismatched saved baseline is rejected before approval or persistence',async()=>{
  for(const baseline of [undefined,null,{id:'another-purchase'}]){
    const p=await fixture(),before=JSON.stringify(p.get());
    await assert.rejects(p.h.postPurchaseRecord(structuredClone(p.purchase),baseline),/purchase.*changed|draft.*changed|review/i);
    assert.equal(JSON.stringify(p.get()),before);assert.deepEqual(p.counts(),{writes:0,syncs:0,gates:0});
  }
});

for(const change of ['cost','notes','delete'])
test(`queued purchase posting cannot overwrite an earlier accepted draft ${change}`,async()=>{
  const p=await fixture();p.page.postPurchase();
  const first=change==='delete'
    ?p.h.persist({...p.h.requireVault(),purchases:p.h.requireVault().purchases.filter(row=>row.id!==p.purchase.id)})
    :p.change(change);
  const second=p.page.confirmAction();await Promise.all([first,second]);
  assert.match(p.page.state.error,/purchase.*changed|draft.*changed/i);
  const saved=p.get().payload,row=saved.purchases.find(row=>row.id===p.purchase.id);
  if(change==='delete')assert.equal(row,undefined);
  else{
    assert.equal(row.status,'draft');
    if(change==='cost')assert.equal(row.items[0].unitCost,'75');
    else assert.equal(row.notes,'New saved purchase instructions');
  }
  assert.equal(saved.documentEvents.filter(event=>event.auditEntityId===p.purchase.id&&event.auditAction==='posted').length,0);
  assert.equal(saved.inventoryMovements.length,0);assert.equal(p.toasts.length,0);
  assert.deepEqual(p.counts(),{writes:1,syncs:1,gates:1});
  assert.ok(p.page.state.purchaseEdit,'the rejected posting must retain the editor');
});

test('posting against a timestamp-only queued save remains valid',async()=>{
  const p=await fixture();p.page.postPurchase();const base=p.h.requireVault();
  const first=p.h.persist({...base,purchases:base.purchases.map(row=>row.id===p.purchase.id
    ?{...row,updatedAt:'2099-01-01T00:00:00.000Z'}:row)});
  const second=p.page.confirmAction();await Promise.all([first,second]);
  assert.equal(p.page.state.error,'');
  const saved=p.get().payload,row=saved.purchases.find(row=>row.id===p.purchase.id);
  assert.equal(row.status,'posted');assert.equal(supplierPayablesByCurrency([row],[])[0].remaining,'100.00');
  assert.equal(saved.documentEvents.filter(event=>event.auditEntityId===p.purchase.id&&event.auditAction==='posted').length,1);
  assert.deepEqual(p.counts(),{writes:2,syncs:2,gates:1});
});

for(const change of ['cost','notes','delete'])
test(`merge rejects a local posting against a concurrently changed draft ${change} without mutating inputs`,async()=>{
  const p=await fixture(),base=p.h.requireVault(),intended={...base,purchases:[postPurchase(p.purchase,[],[]).purchase]};
  const current=structuredClone(p.purchase);
  if(change==='cost')current.items[0].unitCost='75';else current.notes='Accepted remotely';
  const latest={...base,purchases:change==='delete'?[]:[current]},before=JSON.stringify({base,intended,latest});
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/purchase.*changed|draft.*changed/i);
  assert.equal(JSON.stringify({base,intended,latest}),before);
});

test('canonical default scope alone does not block a concurrent purchase posting',async()=>{
  const p=await fixture(),base=p.h.requireVault(),current=structuredClone(p.purchase);
  delete current.workspaceId;delete current.branchId;current.updatedAt='2099-01-01T00:00:00.000Z';
  const intended={...base,purchases:[postPurchase(p.purchase,[],[]).purchase]},latest={...base,purchases:[current]};
  const before=JSON.stringify({base,intended,latest}),saved=mergeVaultIntent(base,intended,latest);
  assert.equal(saved.purchases[0].status,'posted');
  assert.equal(supplierPayablesByCurrency(saved.purchases,[])[0].remaining,'100.00');
  assert.equal(JSON.stringify({base,intended,latest}),before);
});
