import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {scopeVault} from '../dist/src/lib/workspaces.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {formatAiToolAnswer} from '../dist/src/lib/ai-tool-client.js';

const context=()=>({screen:'items',conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null}});
function fixture(total=25){
 const vault=emptyVault();
 const supplier={...createSupplier(),id:'qa-supplier',nameEn:'QA Supplier'};
 const product={id:'qa-product',workspaceId:'default',sku:'QA-COST-001',descriptionEn:'QA Product',descriptionAr:'صنف اختبار',unit:'PCS',origin:'',hsCode:'',packing:'',lastUnitCost:'17',lastCostCurrency:'USD',lastUnitPrice:'25',lastCurrency:'USD',usageCount:0,lastUsedAt:'',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'};
 vault.suppliers=[supplier];vault.savedItems=[product];
 for(let i=0;i<total;i++){
   const p=createPurchase(vault.purchases,[supplier],'USD');
   p.id='qa-purchase-'+i;p.number='QA-PUR-'+i;
   p.workspaceId='default';p.branchId='main';p.status='posted';
   p.postedAt='2026-10-18T09:00:00.000Z';
   p.date='2026-10-'+String((i%26)+1).padStart(2,'0');
   p.currency=i%2?'EUR':'USD';
   p.items=[{...createPurchaseItem(product),unitCost:String(i+10),landedUnitCost:String(i+11)}];
   vault.purchases.push(p);
 }
 return {vault,product,supplier};
}
function read(vault,tool){
 const plan={version:1,goal:'Read verified product cost evidence',calls:[{id:'product',tool,args:{itemId:'qa-product'},reason:'Exact-ID read-only historical prices'}]};
 const out=executeAiToolPlan(createAiToolRuntime(scopeVault(vault),context()),plan);
 assert.equal(out.results.length,1);
 assert.equal(out.results[0].ok,true,out.results[0].summary);
 assert.equal(out.proposal,null);
 return {plan,data:out.results[0].data,row:out.results[0]};
}
test('product summary shows 5 of 25 posted purchase price observations, with totals and original currencies',()=>{
 const {vault}=fixture(),external=structuredClone(vault.purchases[0]);
 external.id='foreign-price';external.branchId='foreign-branch';external.items[0].unitCost='99999';vault.purchases.push(external);
 const draft=structuredClone(vault.purchases[0]);draft.id='draft-price';draft.status='draft';vault.purchases.push(draft);
 const reversed=structuredClone(vault.purchases[0]);reversed.id='reversed-price';reversed.status='reversed';vault.purchases.push(reversed);
 const unchanged=structuredClone(vault),{plan,data,row}=read(vault,'product.getSummary');
 assert.equal(data.costHistoryTotal,25);
 assert.equal(data.costHistoryShown,5);
 assert.equal(data.costHistoryIncomplete,true);
 assert.equal(data.costHistory.length,5);
 assert.ok(data.costHistory.every(x=>['USD','EUR'].includes(x.currency)));
 assert.doesNotMatch(JSON.stringify(data),/99999/);
 assert.match(formatAiToolAnswer(plan,[row],'ar'),/سجل تكلفة الصنف جزئي/);
 assert.match(formatAiToolAnswer(plan,[row],'en'),/cost history is partial/);
 assert.deepEqual(vault,unchanged,'read-only facts must not mutate purchase ledger');
});
test('detailed cost history reports 20 of 25 without treating display cap as all recorded prices',()=>{
 const {vault}=fixture(),{plan,data,row}=read(vault,'product.getCostHistory');
 assert.equal(data.historyTotal,25);
 assert.equal(data.historyShown,20);
 assert.equal(data.historyIncomplete,true);
 assert.equal(data.history.length,20);
 assert.equal(data.history[0].date,'2026-10-25');
 assert.equal(data.history[0].currency,'USD');
 assert.equal(data.history[1].currency,'EUR');
 for(const language of ['ar','en']){
   const txt=formatAiToolAnswer(plan,[row],language);
   assert.match(txt,language==='ar'?/سجل تكلفة الصنف جزئي/:/cost history is partial/);
   assert.match(txt,/20/);assert.match(txt,/25/);
 }
});
test('small summary and standalone cost histories do not show false omission warnings',()=>{
 for(const [num,tool,key] of [[5,'product.getSummary','costHistory'],[20,'product.getCostHistory','history']]){
   const {vault}=fixture(num),{plan,data,row}=read(vault,tool);
   assert.equal(data[key+'Total'],num);
   assert.equal(data[key+'Shown'],num);
   assert.equal(data[key+'Incomplete'],false);
   assert.doesNotMatch(formatAiToolAnswer(plan,[row],'en'),/cost history is partial/);
 }
});
