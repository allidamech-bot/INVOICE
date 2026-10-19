import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {createWarehouse,createWarehouseTransfer,defaultWarehouseId,warehouseItemQuantity} from '../dist/src/lib/warehouses.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault(),now=new Date().toISOString();
  const item={id:'stock-id-collision-fixture',sku:'STOCK-COLLIDE',descriptionEn:'Tracked cartons',
    descriptionAr:'',createdAt:now,updatedAt:now,hsCode:'',origin:'',packing:'',unit:'PCS',
    lastUnitPrice:'10.00',lastCurrency:'USD',lastUnitCost:'5.00',lastCostCurrency:'USD',
    usageCount:0,lastUsedAt:now,workspaceId:vault.appSettings.activeWorkspaceId,
    branchId:vault.appSettings.activeBranchId};
  const source=defaultWarehouseId(vault.appSettings.activeBranchId);
  const destination=createWarehouse(vault.appSettings.activeWorkspaceId,vault.appSettings.activeBranchId,'Receiving Shelf','RECV');
  const opening=createManualInventoryMovement(item,'opening','20',undefined,'Opening recorded stock from historical audit');
  const base={...vault,savedItems:[item],warehouses:[...vault.warehouses,destination],inventoryMovements:[opening]};
  const first={...createWarehouseTransfer(item,source,destination.id,'4'),id:'new-shared-transfer-id'};
  const second={...createWarehouseTransfer(item,source,destination.id,'5'),id:'new-shared-transfer-id'};
  return {base,item,source,destination,first,second};
}

test('two new warehouse transfers cannot lose the earlier movement because of an ID collision',()=>{
  const {base,first,second}=fixture(),original=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,inventoryMovements:[...base.inventoryMovements,first,second]},base),
    /inventory movement.*(unique|duplicate)/i);
  assert.equal(JSON.stringify(base),original,'rejected transfer batch must not mutate authoritative stock history');
});

test('distinct stock movement IDs preserve both transfers and exact source/destination balances',()=>{
  const {base,item,source,destination,first,second}=fixture();
  const distinct={...second,id:'another-transfer-id'};
  const result=mergeVaultIntent(base,{...base,inventoryMovements:[...base.inventoryMovements,first,distinct]},base);
  assert.equal(result.inventoryMovements.length,3);
  assert.equal(warehouseItemQuantity(item.id,source,result.inventoryMovements,source),'11');
  assert.equal(warehouseItemQuantity(item.id,destination.id,result.inventoryMovements,source),'9');
  assert.equal(inventoryBalances(result.savedItems,result.inventoryMovements)[0].quantity,'20',
    'same-currency internal transfers do not create or destroy stock');
});

test('existing historical inventory movement IDs remain valid without rewriting source records',()=>{
  const {base}=fixture(),before=JSON.stringify(base);
  const unchanged=mergeVaultIntent(base,base,base);
  assert.deepEqual(unchanged.inventoryMovements,base.inventoryMovements);
  assert.equal(JSON.stringify(base),before);
});
