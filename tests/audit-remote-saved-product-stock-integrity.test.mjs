import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault(),now='2026-10-01T08:00:00.000Z';
  const item={id:'catalog-stock-history-item',sku:'CAT-100',descriptionEn:'Stock cartons',
    descriptionAr:'',unit:'PCS',origin:'',hsCode:'',packing:'',
    lastUnitPrice:'20.00',lastCurrency:'USD',lastUnitCost:'8.00',
    lastCostCurrency:'USD',inventoryTracking:'tracked',
    createdAt:now,updatedAt:now,usageCount:0,lastUsedAt:now,
    workspaceId:vault.appSettings.activeWorkspaceId,
    branchId:vault.appSettings.activeBranchId};
  const opening={...createManualInventoryMovement(item,'opening','10','2026-10-01',
    'Recorded opening inventory'),id:'old-catalog-opening'};
  return {base:{...vault,savedItems:[item],inventoryMovements:[opening]},item};
}
function expense(base){
  return {...base,expenses:[{...createExpense('USD'),
    id:'unrelated-catalog-expense',description:'Workspace cost',amount:'6.00'}]};
}

test('remote changes to a product unit with posted physical inventory are rejected on independent save',()=>{
  const {base,item}=fixture(),snapshot=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,expense(base),
    {...base,savedItems:[{...item,unit:'BOX'}]}),
    /cannot change unit or inventory classification/i);
  assert.equal(JSON.stringify(base),snapshot);
});

test('remote change from tracked inventory to non-stock cannot orphan past warehouse movements',()=>{
  const {base,item}=fixture();
  assert.throws(()=>mergeVaultIntent(base,expense(base),
    {...base,savedItems:[{...item,inventoryTracking:'non-stock'}]}),
    /cannot change unit or inventory classification/i);
});

test('remote duplicate SKU or invalid new reusable item cannot enter catalog history',()=>{
  const {base,item}=fixture();
  const other={...item,id:'new-remote-catalog-item',sku:item.sku,
    descriptionEn:'Different boxes'};
  assert.throws(()=>mergeVaultIntent(base,expense(base),
    {...base,savedItems:[item,other]}));
  for(const changed of [
    {...other,sku:'NEW-002',unit:''},
    {...other,sku:'NEW-003',descriptionEn:'',descriptionAr:''},
    {...other,sku:'NEW-004',lastUnitCost:'-5.00'},
    {...other,sku:'NEW-005',lastUnitPrice:'-20.00'},
    {...other,sku:'NEW-006',inventoryTracking:'unknown'}
  ]){
    assert.throws(()=>mergeVaultIntent(base,expense(base),
      {...base,savedItems:[item,changed]}));
  }
});

test('two newly created remote products cannot share a record ID and silently collapse',()=>{
  const {base,item}=fixture();
  const first={...item,id:'reused-remote-product-id',sku:'NEW-ONE',
    descriptionEn:'New goods one'};
  const second={...item,id:'reused-remote-product-id',sku:'NEW-TWO',
    descriptionEn:'New goods two'};
  assert.throws(()=>mergeVaultIntent(base,expense(base),
    {...base,savedItems:[item,first,second]}),
    /new saved item IDs must be unique/i);
  assert.throws(()=>mergeVaultIntent(base,
    {...base,savedItems:[item,first,second]},base),
    /new saved item IDs must be unique/i);
});

test('valid remote product introduction and price refresh preserve existing physical quantities',()=>{
  const {base,item}=fixture();
  const newProduct={...item,id:'valid-remote-item',sku:'VALID-200',
    descriptionEn:'Secondary product',lastUnitPrice:'15.00'};
  const updated={...item,lastUnitPrice:'22.00'};
  const saved=mergeVaultIntent(base,expense(base),{
    ...base,savedItems:[updated,newProduct]});
  assert.equal(saved.savedItems.length,2);
  assert.equal(saved.savedItems.find(x=>x.id===item.id).lastUnitPrice,'22.00');
  assert.equal(inventoryBalances(saved.savedItems,saved.inventoryMovements)
    .find(x=>x.item.id===item.id).quantity,'10');
  assert.equal(saved.expenses.length,1);
});

test('unchanged historical catalog price spelling remains intact across remote replay',()=>{
  const {base,item}=fixture();
  const legacy={...base,savedItems:[{...item,lastUnitPrice:'1,2.00'}]};
  const snapshot=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,expense(legacy),structuredClone(legacy));
  assert.equal(merged.savedItems[0].lastUnitPrice,'1,2.00');
  assert.equal(merged.expenses.length,1);
  assert.equal(JSON.stringify(legacy),snapshot);
});
