import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {createWarehouse,createWarehouseTransfer,defaultWarehouseId,warehouseItemQuantity} from '../dist/src/lib/warehouses.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const pdf=Buffer.from('%PDF-1.4\nOne signed source count\n');
const proof={id:'signed-stock-proof',name:'signed-count.pdf',mimeType:'application/pdf',
  size:pdf.length,dataUrl:'data:application/pdf;base64,'+pdf.toString('base64'),
  createdAt:'2026-10-20T09:00:00.000Z'};

function fixture(){
  const vault=emptyVault(),now=new Date().toISOString();
  const item={id:'remote-stock-validation-item',sku:'REMOTE-200',
    descriptionEn:'Tracked stock units',descriptionAr:'',createdAt:now,updatedAt:now,
    hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'12.00',lastCurrency:'USD',
    lastUnitCost:'4.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:now,
    workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId};
  const source=defaultWarehouseId(vault.appSettings.activeBranchId);
  const destination=createWarehouse(vault.appSettings.activeWorkspaceId,
    vault.appSettings.activeBranchId,'Remote Warehouse','REM');
  const historical=createManualInventoryMovement(item,'opening','10','2026-10-01',
    'Documented legacy opening stock');
  const base={...vault,savedItems:[item],warehouses:[...vault.warehouses,destination],
    inventoryMovements:[historical]};
  return {base,item,source,destination,historical};
}
const otherExpense=base=>({...base,expenses:[{...createExpense('USD'),
  id:'independent-stock-sync-expense',description:'Business internet',amount:'9.00'}]});
function legitimateManual(item,type,quantity,id){
  return {...createManualInventoryMovement(item,type,quantity,'2026-10-20',
    'Signed and verified physical inventory count'),id,reasonCategory:'count',
    createdBy:'stock-controller',evidence:proof};
}

test('remote new manual opening without evidence cannot inflate inventory on unrelated finance save',()=>{
  const {base,item}=fixture(),before=JSON.stringify(base);
  const forged={...createManualInventoryMovement(item,'opening','250','2026-10-20',
    'Unverified new stock'),id:'remote-unverified-opening'};
  assert.throws(()=>mergeVaultIntent(base,otherExpense(base),
    {...base,inventoryMovements:[...base.inventoryMovements,forged]}),
    /movement reason category|operator identity|evidence attachment|inventory movement reason/i);
  assert.equal(JSON.stringify(base),before,'rejected remote inventory must not mutate original data');
});

test('remote issue cannot debit stock beyond available quantity in its warehouse',()=>{
  const {base,item,source}=fixture();
  const issue={...legitimateManual(item,'issue','15','remote-excessive-issue'),
    fromWarehouseId:source};
  assert.throws(()=>mergeVaultIntent(base,otherExpense(base),
    {...base,inventoryMovements:[...base.inventoryMovements,issue]}),
    /insufficient stock|available stock/i);
});

test('remote transfer from empty location cannot borrow the company-wide stock balance',()=>{
  const {base,item,source,destination}=fixture();
  const forged=createWarehouseTransfer(item,destination.id,source,'1','2026-10-20');
  assert.throws(()=>mergeVaultIntent(base,otherExpense(base),
    {...base,inventoryMovements:[...base.inventoryMovements,forged]}),
    /transfer quantity exceeds.*source/i);
});

test('remote new stock rejects quantities that would be rounded from a fifth decimal',()=>{
  const {base,item}=fixture();
  const manual={...legitimateManual(item,'opening','1','remote-precision-opening'),
    quantity:'1.00009'};
  assert.throws(()=>mergeVaultIntent(base,otherExpense(base),
    {...base,inventoryMovements:[...base.inventoryMovements,manual]}),
    /new inventory movement quantity.*four decimal places/i);
});

test('valid remote evidenced opening and subsequent warehouse transfer keep exact balances',()=>{
  const {base,item,source,destination}=fixture();
  const opening={...legitimateManual(item,'opening','3','remote-evidenced-opening'),
    toWarehouseId:source};
  const transfer={...createWarehouseTransfer(item,source,destination.id,'4','2026-10-20'),
    id:'remote-valid-transfer'};
  const merged=mergeVaultIntent(base,otherExpense(base),{
    ...base,inventoryMovements:[...base.inventoryMovements,opening,transfer]});
  assert.equal(merged.inventoryMovements.length,3);
  assert.equal(merged.expenses.length,1);
  assert.equal(inventoryBalances(merged.savedItems,merged.inventoryMovements)[0].quantity,'13');
  assert.equal(warehouseItemQuantity(item.id,source,merged.inventoryMovements,source),90000n);
  assert.equal(warehouseItemQuantity(item.id,destination.id,merged.inventoryMovements,source),40000n);
});

test('unchanged legacy stock opening without modern evidence is not retroactively rejected',()=>{
  const {base,historical}=fixture(),prior=JSON.stringify(base);
  const merged=mergeVaultIntent(base,otherExpense(base),structuredClone(base));
  assert.equal(merged.inventoryMovements[0].id,historical.id);
  assert.equal(merged.inventoryMovements[0].quantity,'10');
  assert.equal(merged.expenses.length,1);
  assert.equal(JSON.stringify(base),prior);
});
