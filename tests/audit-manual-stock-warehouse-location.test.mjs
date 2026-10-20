import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {createWarehouse,warehouseItemQuantity,defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
const bytes=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
function fixture(){
  const vault=emptyVault(),now=new Date().toISOString(),date=now.slice(0,10);
  const item={id:'manual-warehouse-item',sku:'MAN-WH-TEST',descriptionEn:'Inventory stock',
    descriptionAr:'',unit:'Carton',lastUnitCost:'4.00',lastCostCurrency:'USD',
    lastUnitPrice:'8.00',lastCurrency:'USD',usageCount:0,lastUsedAt:now,
    createdAt:now,updatedAt:now,workspaceId:'default'};
  const valid=createWarehouse('default','main','Auxiliary Bin','AUX');
  const outside=createWarehouse('outside-company','foreign-branch','Foreign Bin','FOREIGN');
  vault.savedItems=[item];vault.warehouses=[...vault.warehouses,valid,outside];
  const movement={...createManualInventoryMovement(item,'opening','4',date,
    'Documented count of cartons in warehouse'),id:'manual-location-opening',
    workspaceId:'default',branchId:'main',reasonCategory:'opening',createdBy:'owner',
    evidence:{id:'manual-location-proof',name:'inventory-proof.pdf',
      mimeType:'application/pdf',size:bytes.length,
      dataUrl:'data:application/pdf;base64,'+bytes.toString('base64'),createdAt:now}};
  return{vault,item,valid,outside,movement};
}
const unrelated=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('local manual opening cannot inflate a foreign-company warehouse',()=>{
  const {vault,movement,outside}=fixture(),before=JSON.stringify(vault);
  assert.throws(()=>mergeVaultIntent(vault,{...vault,inventoryMovements:[
    {...movement,toWarehouseId:outside.id}]},vault),
    /Manual inventory warehouse.*(company|branch|scope)/i);
  assert.equal(JSON.stringify(vault),before);
});
test('remote manual opening cannot credit a missing warehouse during unrelated local save',()=>{
  const {vault,movement}=fixture();
  assert.throws(()=>mergeVaultIntent(vault,unrelated(vault),{...vault,inventoryMovements:[
    {...movement,toWarehouseId:'missing-location'}]}),
    /Manual inventory warehouse.*(missing|invalid|exist|active)/i);
});
test('outgoing manual issue cannot debit another-company warehouse even if remote stock exists there',()=>{
  const {vault,movement,outside}=fixture();
  const opening={...movement,id:'opening-before-issue',toWarehouseId:outside.id};
  const baseline={...vault,inventoryMovements:[opening]};
  const outgoing={...movement,id:'outgoing-from-foreign',type:'issue',quantity:'-2',
    fromWarehouseId:outside.id,reasonCategory:'samples',
    evidence:{...movement.evidence,id:'manual-outgoing-proof'}};
  assert.throws(()=>mergeVaultIntent(baseline,{...baseline,inventoryMovements:[
    opening,outgoing]},baseline),
    /Manual inventory warehouse.*(company|branch|scope)/i);
});
test('valid explicit warehouse receipt is credited exactly once in its own branch',()=>{
  const {vault,item,valid,movement}=fixture();
  const next=mergeVaultIntent(vault,{...vault,inventoryMovements:[
    {...movement,toWarehouseId:valid.id}]},vault);
  assert.equal(warehouseItemQuantity(item.id,valid.id,next.inventoryMovements,defaultWarehouseId('main')),40000n);
  assert.equal(next.inventoryMovements.length,1);
});
test('unchanged earlier manual receipt with a foreign location stays untouched during unrelated save',()=>{
  const {vault,movement,outside}=fixture();
  const historical={...vault,inventoryMovements:[{...movement,toWarehouseId:outside.id}]};
  const before=JSON.stringify(historical);
  const next=mergeVaultIntent(historical,unrelated(historical),structuredClone(historical));
  assert.equal(next.inventoryMovements[0].toWarehouseId,outside.id);
  assert.equal(JSON.stringify(historical),before);
});
