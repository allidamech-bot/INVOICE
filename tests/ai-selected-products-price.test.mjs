import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {stageScopedRecordList,setExactRecordSelection} from '../dist/src/lib/ai-record-selection.js';
import {requestedSelectedProductRepricing,prepareSelectedProductRepricing} from '../dist/src/lib/ai-selected-products-price.js';
import {applyAiBulkProductUpdate} from '../dist/src/lib/ai-product-bulk-update.js';
const stamp='2026-10-01T10:00:00.000Z';
function product(id,price,workspaceId='default'){
 return{id,workspaceId,branchId:'main',sku:'SKU-'+id,descriptionEn:'Product '+id,descriptionAr:'',
  createdAt:stamp,updatedAt:stamp,unit:'CTN',lastUnitPrice:price,lastCurrency:'USD',
  lastCostCurrency:'USD',lastUnitCost:'1',category:'Food',tags:[],archived:false};
}
function fixture(){
 const vault=emptyVault();
 vault.savedItems=[product('one','4.00'),product('two','12.50'),product('three','10.00'),product('foreign','99.00','other')];
 const kernel=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'qa-products'});
 const selection=stageScopedRecordList(kernel,vault,'product');
 setExactRecordSelection(kernel,vault,selection.id,['one','two']);
 return{vault,kernel};
}
test('selected product price commands require explicit percentage with no inference',()=>{
 assert.equal(requestedSelectedProductRepricing('خفض أسعارها 5%'),'-5');
 assert.equal(requestedSelectedProductRepricing('خفض أسعار المنتجات المحددة 5%'),'-5');
 assert.equal(requestedSelectedProductRepricing('increase prices of these products by 10%'),null);
 assert.equal(requestedSelectedProductRepricing('ارفع أسعار هذه المنتجات بنسبة 10%'),'10');
 assert.equal(requestedSelectedProductRepricing('خفض أسعارها قليلاً'),null);
 assert.throws(()=>requestedSelectedProductRepricing('خفض أسعارها 120%'),/no greater/);
});
test('selected product IDs alone receive exact 5% preview and no business mutation',()=>{
 const {vault,kernel}=fixture(),before=structuredClone(vault);
 const batch=prepareSelectedProductRepricing(kernel,vault,'-5');
 assert.deepEqual(batch.rows.map(row=>row.itemId),['one','two']);
 assert.deepEqual(batch.rows.map(row=>row.preview.before.lastUnitPrice),['4.00','12.50']);
 assert.deepEqual(batch.rows.map(row=>row.preview.after.lastUnitPrice),['3.80','11.88']);
 assert.deepEqual(vault,before,'preparing an approval does not save any price');
 const applied=applyAiBulkProductUpdate(vault,batch,'2026-10-13T00:00:00.000Z');
 assert.deepEqual(applied.savedItems.map(row=>row.lastUnitPrice),['3.80','11.88','10.00','99.00']);
 assert.equal(vault.savedItems[0].lastUnitPrice,'4.00');
});
test('stale record, missing price, cross-company and over-limit selection all fail closed',()=>{
 const {vault,kernel}=fixture(),before=structuredClone(vault);
 vault.savedItems[1].archived=true;
 assert.throws(()=>prepareSelectedProductRepricing(kernel,vault,'-5'),/missing|outside/);
 vault.savedItems[1].archived=false;
 vault.savedItems[1].lastCurrency='';
 assert.throws(()=>prepareSelectedProductRepricing(kernel,vault,'-5'),/currency/);
 vault.savedItems[1].lastCurrency='USD';
 kernel.scope.branchId='other';
 assert.throws(()=>prepareSelectedProductRepricing(kernel,vault,'-5'),/Company or branch changed/);
 assert.deepEqual(vault.savedItems[0],before.savedItems[0]);
});
test('selected product writes remain behind the canonical stamped approval executor',async()=>{
 const runtime=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 assert.match(runtime,/prepareSelectedProductRepricing\(kernel,resumed\.vault,selectedPricePercent\)/);
 assert.match(runtime,/stampProposal\(host,p,resumed\.vault\);stageReviewedMission\(kernel,p\)/);
 assert.match(runtime,/capability:'tool\.execute',tool:'product\.bulkUpdate'/);
});
