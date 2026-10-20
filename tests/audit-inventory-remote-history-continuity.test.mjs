import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {createWarehouse,createWarehouseTransfer,defaultWarehouseId,warehouseItemQuantity} from '../dist/src/lib/warehouses.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault(),now=new Date().toISOString();
  const item={id:'synced-stock-audit-item',sku:'SYNC-STOCK',descriptionEn:'Stocked goods',descriptionAr:'',
    createdAt:now,updatedAt:now,hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'10',
    lastCurrency:'USD',lastUnitCost:'5',lastCostCurrency:'USD',usageCount:0,lastUsedAt:now,
    workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId};
  const opening={...createManualInventoryMovement(item,'opening','10','2026-10-01','Original recorded warehouse opening'),
    id:'historical-opening-stock'};
  const base={...vault,savedItems:[item],inventoryMovements:[opening]};
  return {base,item,opening};
}
const otherExpense=()=>({...createExpense('USD'),id:'independent-expense',description:'Business internet',amount:'25.00'});
const withExpense=(base)=>({...base,expenses:[otherExpense()]});

test('two-device merge cannot silently delete historical manual stock while applying an unrelated expense',()=>{
  const {base,item}=fixture(),original=JSON.stringify(base);
  assert.equal(inventoryBalances(base.savedItems,base.inventoryMovements)[0].quantity,'10');
  const remote={...base,inventoryMovements:[]};
  assert.throws(()=>mergeVaultIntent(base,withExpense(base),remote),
    /inventory ledger.*(append-only|cannot be deleted|history)/i);
  assert.equal(JSON.stringify(base),original,'rejected sync must leave local financial and inventory records unchanged');
  assert.equal(item.id,'synced-stock-audit-item');
});

test('two-device merge cannot silently rewrite saved stock movement quantity or warehouse identity',()=>{
  const {base,opening}=fixture(),before=JSON.stringify(base);
  for(const modified of [{...opening,quantity:'100'}, {...opening,fromWarehouseId:'other-warehouse'},
    {...opening,date:'2026-10-02'}]){
    assert.throws(()=>mergeVaultIntent(base,withExpense(base),{...base,inventoryMovements:[modified]}),
      /inventory ledger.*(immutable|editing history)/i);
    assert.equal(JSON.stringify(base),before,'no attempted remote rewrite can modify the original vault');
  }
});

test('remote append-only warehouse transfers still sync with a legitimate unrelated local expense',()=>{
  const {base,item}=fixture();
  const source=defaultWarehouseId(base.appSettings.activeBranchId);
  const destination=createWarehouse(base.appSettings.activeWorkspaceId,base.appSettings.activeBranchId,
    'Overflow storage','OVER');
  const transfer={...createWarehouseTransfer(item,source,destination.id,'3'),id:'remote-append-transfer'};
  const remote={...base,warehouses:[...base.warehouses,destination],
    inventoryMovements:[...base.inventoryMovements,transfer]};
  const merged=mergeVaultIntent(base,withExpense(base),remote);
  assert.equal(merged.inventoryMovements.length,2);
  assert.equal(merged.expenses.length,1);
  assert.equal(warehouseItemQuantity(item.id,source,merged.inventoryMovements,source),70000n);
  assert.equal(warehouseItemQuantity(item.id,destination.id,merged.inventoryMovements,source),30000n);
  assert.equal(inventoryBalances(merged.savedItems,merged.inventoryMovements)[0].quantity,'10');
});

test('existing historical stock quantity is preserved exactly by unchanged vault reconciliation',()=>{
  const {base}=fixture(),legacy={...base,inventoryMovements:[{...base.inventoryMovements[0],quantity:'1,2.00'}]};
  const before=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,legacy,legacy);
  assert.equal(merged.inventoryMovements[0].quantity,'1,2.00');
  assert.equal(JSON.stringify(legacy),before);
});
