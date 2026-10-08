import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {prepareAiBulkProductUpdate, applyAiBulkProductUpdate, AI_BULK_PRODUCT_LIMIT} from '../dist/src/lib/ai-product-bulk-update.js';
import {createAiToolRuntime, executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {applyApprovedToolExecution} from '../dist/src/lib/ai-tool-actions.js';
import {registerVaultMutationBridge} from '../dist/src/storage/vault-mutation-bridge.js';

const stamp='2026-09-01T00:00:00.000Z';
function product(id,sku,descriptionEn,price='4.00',workspaceId='default'){
  return {id,workspaceId,branchId:'main',createdAt:stamp,updatedAt:stamp,sku,descriptionEn,descriptionAr:'',
    hsCode:'',origin:'TR',packing:'12 pcs',unit:'CTN',lastUnitPrice:price,lastCurrency:'USD',
    lastUnitCost:'2.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',category:'Snacks',tags:[],favorite:false,archived:false};
}
function vault(){
  const v=emptyVault();
  v.savedItems=[product('one','OLD-1','Chocolate 50g'),product('two','OLD-2','Wafer 75g'),product('hidden','HIDDEN','Secret', '9.00','other')];
  return v;
}
function entries(){
  return [{sku:'OLD-1',patch:{sku:'NEW-1',lastUnitPrice:'5.75',category:'Confectionery'}},
          {name:'Wafer 75g',patch:{lastUnitPrice:'7.20'}}];
}
test('B05: 2 product edits are staged with complete old/new previews and no mutation',()=>{
  const v=vault(),before=JSON.stringify(v);
  const batch=prepareAiBulkProductUpdate(v,entries());
  assert.equal(batch.rows.length,2);
  assert.equal(batch.rows[0].preview.before.lastUnitPrice,'4.00');
  assert.equal(batch.rows[0].preview.after.lastUnitPrice,'5.75');
  assert.equal(batch.rows[0].preview.after.sku,'NEW-1');
  assert.equal(batch.rows[1].preview.after.category,'Snacks');
  assert.equal(JSON.stringify(v),before);
});
test('B05: a single approved save preserves unrelated fields and other companies',()=>{
  const v=vault(),batch=prepareAiBulkProductUpdate(v,entries());
  const saved=applyAiBulkProductUpdate(v,batch,'2026-10-08T09:00:00.000Z');
  assert.equal(saved.savedItems.length,3);
  assert.equal(saved.savedItems[0].sku,'NEW-1');
  assert.equal(saved.savedItems[1].lastUnitPrice,'7.20');
  assert.equal(saved.savedItems[0].lastUnitCost,'2.00');
  assert.equal(saved.savedItems[0].usageCount,0);
  assert.deepEqual(saved.savedItems[2],v.savedItems[2]);
  assert.equal(v.savedItems[0].sku,'OLD-1');
});
test('B05: preflight refuses all rows if one identity is missing, duplicated or archived',()=>{
  const v=vault();
  assert.throws(()=>prepareAiBulkProductUpdate(v,[...entries(),{sku:'MISSING',patch:{sku:'X'}}]),/not found/);
  assert.throws(()=>prepareAiBulkProductUpdate(v,[entries()[0],entries()[0]]),/twice/);
  assert.throws(()=>prepareAiBulkProductUpdate(v,[{sku:'HIDDEN',patch:{category:'Wrong'}}]),/not found/);
  v.savedItems[0].archived=true;
  assert.throws(()=>prepareAiBulkProductUpdate(v,[entries()[0]]),/Archived/);
});
test('B05: rejects unauthorized fields, price errors, missing currency and duplicate final SKUs',()=>{
  const v=vault();
  assert.throws(()=>prepareAiBulkProductUpdate(v,[{sku:'OLD-1',patch:{inventory:99}}]),/unsupported/);
  assert.throws(()=>prepareAiBulkProductUpdate(v,[{sku:'OLD-1',patch:{lastUnitPrice:'-2'}}]),/non-negative/);
  assert.throws(()=>prepareAiBulkProductUpdate(v,[{sku:'OLD-1',patch:{lastUnitPrice:'abc'}}]),/non-negative/);
  assert.throws(()=>prepareAiBulkProductUpdate(v,[{sku:'OLD-1',patch:{sku:'OLD-2'}}]),/duplicate SKU/);
  v.savedItems[0].lastCurrency='';
  assert.throws(()=>prepareAiBulkProductUpdate(v,[{sku:'OLD-1',patch:{lastUnitPrice:'7'}}]),/currency/);
  assert.throws(()=>prepareAiBulkProductUpdate(v,[{sku:'OLD-1',patch:{category:''}}]),/Category/);
  assert.throws(()=>prepareAiBulkProductUpdate(v,[]),/1–40/);
  assert.equal(AI_BULK_PRODUCT_LIMIT,40);
});
test('B05: approvals are optimistic-concurrency checked atomically before any save',()=>{
  const v=vault(),batch=prepareAiBulkProductUpdate(v,entries());
  v.savedItems[1].updatedAt='2026-09-02T00:00:00.000Z';
  const before=JSON.stringify(v);
  assert.throws(()=>applyAiBulkProductUpdate(v,batch),/changed since preview/);
  assert.equal(JSON.stringify(v),before,'Not a single row is written on failure');
});
test('B05: switching companies, tampering with an approved patch or duplicate SKU at save time fails closed',()=>{
  const v=vault(),batch=prepareAiBulkProductUpdate(v,entries());
  const altered=structuredClone(batch);
  altered.rows[0].patch.lastUnitPrice='9.5';
  assert.throws(()=>applyAiBulkProductUpdate(v,altered),/since preview/);
  const changed=structuredClone(batch);
  changed.rows[0].patch.lastUnitPrice='not-money';
  assert.throws(()=>applyAiBulkProductUpdate(v,changed),/Invalid/);
  v.appSettings.activeWorkspaceId='other';
  assert.throws(()=>applyAiBulkProductUpdate(v,batch),/Active company changed/);
  v.appSettings.activeWorkspaceId='default';
  v.savedItems.push(product('third','NEW-1','Another', '6.00'));
  assert.throws(()=>applyAiBulkProductUpdate(v,batch),/Duplicate SKU detected at save time/);
});
test('B05: deterministic tool proposal stages a single approval; protected plan does not mutate',()=>{
  const v=vault(),before=JSON.stringify(v);
  const runtime=createAiToolRuntime(v,{assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null}});
  const plan={version:1,goal:'Update both products',calls:[{id:'a1',tool:'product.bulkUpdate',args:{updates:entries()},reason:'User asked for both edits'}]};
  const result=executeAiToolPlan(runtime,plan);
  assert.equal(result.proposal?.capability,'tool.execute');
  assert.equal(result.proposal?.tool,'product.bulkUpdate');
  assert.equal(result.proposal?.preview?.length,2);
  assert.equal(JSON.stringify(v),before);
  const missing=executeAiToolPlan(runtime,{...plan,calls:[{...plan.calls[0],args:{updates:[...entries(),{name:'not found',patch:{sku:'NO'}}]}}]});
  assert.equal(missing.proposal,null);
  assert.equal(missing.results[0].ok,false);
  assert.equal(JSON.stringify(v),before);
});
test('B05: bulk executor uses one real mutation bridge after approval',async()=>{
  let current=vault(),calls=0;
  registerVaultMutationBridge(async mutation=>{calls++;current=mutation(current);return current;});
  const batch=prepareAiBulkProductUpdate(current,entries());
  const result=await applyApprovedToolExecution({capability:'tool.execute',tool:'product.bulkUpdate',args:batch,label:'Review',rationale:'Requested'});
  assert.equal(calls,1);
  assert.match(result.summary,/2 product records updated/);
  assert.equal(current.savedItems[0].sku,'NEW-1');
  assert.equal(current.savedItems[1].lastUnitPrice,'7.20');
});
test('B05: planner and UI expose the bounded tool and complete review',async()=>{
  const api=await readFile('api/ai-inbox.js','utf8');
  const tool=await readFile('src/lib/ai-tool-orchestrator.ts','utf8');
  const ui=await readFile('scripts/ai-conversation-owner-stage4-tools.mjs','utf8');
  assert.match(api,/product\.bulkUpdate/);
  assert.match(api,/UNTRUSTED ATTACHMENT FACTS/);
  assert.match(tool,/runtime\.scope!=='business'/);
  assert.match(ui,/__lourexBulkProductPreview/);
  assert.match(ui,/row\.before/);
  assert.match(ui,/row\.after/);
  assert.match(ui,/lourex-ai-bulk-preview/);
});
