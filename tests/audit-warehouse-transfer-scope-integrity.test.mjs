import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {createWarehouse,createWarehouseTransfer,defaultWarehouseId,warehouseItemQuantity} from '../dist/src/lib/warehouses.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault(),date=new Date().toISOString().slice(0,10),at=new Date().toISOString();
  const item={id:'warehouse-transfer-scope-item',sku:'WH-XFER-SCOPE',
    descriptionEn:'Stock parcel',descriptionAr:'',unit:'Carton',
    lastUnitCost:'2.00',lastCostCurrency:'USD',lastUnitPrice:'5.00',
    lastCurrency:'USD',usageCount:0,lastUsedAt:at,createdAt:at,updatedAt:at,
    workspaceId:'default'};
  const from=defaultWarehouseId('main');
  const to=createWarehouse('default','main','Overflow Warehouse','OVERFLOW');
  vault.savedItems=[item];vault.warehouses=[...vault.warehouses,to];
  vault.inventoryMovements=[createManualInventoryMovement(item,'opening','8',date,'Documented initial stock')];
  const transfer={...createWarehouseTransfer(item,from,to.id,'3',date,'Documented relocation'),
    id:'transfer-scope-1',workspaceId:'default',branchId:'main'};
  return {base:vault,from,to:to.id,item,transfer};
}
const unrelatedChange=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('local transfer explicitly claiming another company cannot move stock between this company warehouses',()=>{
  const {base,transfer}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,inventoryMovements:[
    ...base.inventoryMovements,{...transfer,workspaceId:'other-company'}]},base),
    /warehouse transfer.*(workspace|company|scope)/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote transfer explicitly claiming another branch cannot be admitted by unrelated local save',()=>{
  const {base,transfer}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,unrelatedChange(base),{...base,inventoryMovements:[
    ...base.inventoryMovements,{...transfer,branchId:'different-branch'}]}),
    /warehouse transfer.*(branch|scope)/i);
  assert.equal(JSON.stringify(base),before);
});

test('transfer of an item registered to another company is rejected even if its warehouse locations match',()=>{
  const {base,transfer,item}=fixture();
  const foreign={...item,workspaceId:'other-company'};
  const changed={...base,savedItems:[foreign]};
  assert.throws(()=>mergeVaultIntent(changed,{...changed,inventoryMovements:[
    ...changed.inventoryMovements,transfer]},changed),
    /warehouse transfer.*(item|company|workspace|scope)/i);
});

test('two distinct legitimate transfers preserve quantity within one company and branch',()=>{
  const {base,from,to,transfer,item}=fixture();
  const remote={...transfer,id:'transfer-scope-2',quantity:'2'};
  const merged=mergeVaultIntent(base,{...base,inventoryMovements:[...base.inventoryMovements,transfer]},
    {...base,inventoryMovements:[...base.inventoryMovements,remote]});
  const source=warehouseItemQuantity(item.id,from,merged.inventoryMovements,from);
  const dest=warehouseItemQuantity(item.id,to,merged.inventoryMovements,from);
  assert.equal(source,30000n);
  assert.equal(dest,50000n);
  assert.equal(source+dest,80000n);
});

test('unchanged previously stored transfer scope is not rewritten during unrelated saves',()=>{
  const {base,transfer}=fixture();
  const old={...base,inventoryMovements:[...base.inventoryMovements,transfer]};
  const before=JSON.stringify(old);
  const merged=mergeVaultIntent(old,unrelatedChange(old),structuredClone(old));
  assert.equal(merged.inventoryMovements.find(m=>m.id===transfer.id).workspaceId,'default');
  assert.equal(JSON.stringify(old),before);
});
