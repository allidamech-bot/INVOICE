import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,reversePurchase} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
 const base=emptyVault(),at=new Date().toISOString();
 const supplier={...createSupplier(),id:'supplier-stock-valuation',nameEn:'Valuation Supplier'};
 const item={id:'item-stock-valuation',sku:'COST-VALID-1',descriptionEn:'Valuation goods',
  descriptionAr:'',unit:'Carton',lastUnitCost:'6.00',lastCostCurrency:'USD',createdAt:at,updatedAt:at};
 base.suppliers=[supplier];base.savedItems=[item];
 const purchase=createPurchase([],[supplier],'USD');
 purchase.id='purchase-valuation-1';
 purchase.items=[{...createPurchaseItem(item),id:'item-line-valuation-1',quantity:'4',unitCost:'6.00'}];
 purchase.freight='4.00';
 const posted=postPurchase(purchase,[item],[]);
 const receipt={...posted.movements[0],id:'valuation-receipt-1',workspaceId:'default',branchId:'main'};
 const saved={...base,purchases:[posted.purchase],inventoryMovements:[receipt]};
 const reversed=reversePurchase(posted.purchase,'Goods returned for supplier reconciliation',[receipt],[item]);
 const returnMovement={...reversed.movements[0],id:'valuation-reversal-1',workspaceId:'default',branchId:'main'};
 return{base,item,purchase:posted.purchase,receipt,saved,reversePurchase:reversed.purchase,returnMovement};
}
const unrelated=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('a local purchase stock receipt may not change the posted landed unit cost',()=>{
 const {base,saved,receipt}=fixture(),snapshot=JSON.stringify(base);
 assert.throws(()=>mergeVaultIntent(base,{...saved,inventoryMovements:[
   {...receipt,unitCost:'1.00'}]},base),/purchase (stock|inventory).*cost/i);
 assert.equal(JSON.stringify(base),snapshot);
});

test('a remote newly posted receipt cannot introduce false valuation during unrelated save',()=>{
 const {base,saved,receipt}=fixture();
 assert.throws(()=>mergeVaultIntent(base,unrelated(base),{...saved,inventoryMovements:[
   {...receipt,unitCost:'0.10'}]}),/purchase (stock|inventory).*cost/i);
});

test('a reversed purchase cannot offset the right quantity at an invented cost',()=>{
 const {base,saved,reversePurchase,returnMovement}=fixture();
 const recorded=mergeVaultIntent(base,saved,base);
 assert.throws(()=>mergeVaultIntent(recorded,{...recorded,purchases:[reversePurchase],
   inventoryMovements:[...recorded.inventoryMovements,
     {...returnMovement,unitCost:'0.25'}]},recorded),
   /purchase (stock|inventory).*cost/i);
});

test('valid landed-cost receipt and its exact reversal are accepted without changing ledger history',()=>{
 const {base,saved,reversePurchase,returnMovement,receipt}=fixture();
 assert.notEqual(receipt.unitCost,'6.00','freight changes landed stock cost');
 const posted=mergeVaultIntent(base,saved,base);
 assert.equal(posted.inventoryMovements[0].unitCost,receipt.unitCost);
 const reverted=mergeVaultIntent(posted,{...posted,purchases:[reversePurchase],
   inventoryMovements:[...posted.inventoryMovements,returnMovement]},posted);
 assert.equal(reverted.inventoryMovements[1].unitCost,receipt.unitCost);
 assert.equal(reverted.inventoryMovements.length,2);
});

test('two purchase lines for the same item with different costs retain their individual valuation',()=>{
 const {base,purchase,item}=fixture();
 const draft={...purchase,status:'draft',postedAt:'',freight:'0.00',items:[
   {...purchase.items[0],id:'cost-line-a',quantity:'2',unitCost:'5.00',landedUnitCost:''},
   {...purchase.items[0],id:'cost-line-b',quantity:'2',unitCost:'8.00',landedUnitCost:''}
 ]};
 const posted=postPurchase(draft,[item],[]);
 const saved={...base,purchases:[posted.purchase],inventoryMovements:posted.movements};
 const validated=mergeVaultIntent(base,saved,base);
 assert.equal(validated.inventoryMovements.length,2);
 const corrupted={...saved,inventoryMovements:posted.movements.map((row,index)=>index===1?{...row,unitCost:'5.00'}:row)};
 assert.throws(()=>mergeVaultIntent(base,corrupted,base),/purchase (stock|inventory).*cost/i);
});

test('unchanged historical purchase stock cost representation is preserved on unrelated save',()=>{
 const {saved}=fixture();
 const original={...saved,inventoryMovements:saved.inventoryMovements.map(m=>({...m,unitCost:'99.00'}))};
 const before=JSON.stringify(original);
 const after=mergeVaultIntent(original,unrelated(original),structuredClone(original));
 assert.equal(after.inventoryMovements[0].unitCost,'99.00');
 assert.equal(JSON.stringify(original),before);
});
