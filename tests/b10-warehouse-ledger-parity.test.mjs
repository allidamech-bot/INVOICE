import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryBalances,operationsIntegritySummary} from '../dist/src/lib/operations.js';
import {warehouseItemQuantity,warehouseBalances,movementLocationDelta,defaultWarehouseId} from '../dist/src/lib/warehouses.js';

const d='2026-10-09',createdAt=d+'T07:00:00.000Z';
const item={id:'b10-item',sku:'B10-ITEM',descriptionEn:'Snack Carton',descriptionAr:'كرتون',
  lastUnitCost:'2',lastCostCurrency:'USD'};
const main=defaultWarehouseId('main'),extra='warehouse-extra';
const warehouses=[
  {id:main,workspaceId:'default',branchId:'main',name:'Main',code:'MAIN',active:true},
  {id:extra,workspaceId:'default',branchId:'main',name:'Extra',code:'EXTRA',active:true}
];
function movement(id,type,quantity,extraFields={}){
  return {id,itemId:item.id,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,sku:item.sku,
    date:d,type,quantity,unitCost:'2',currency:'USD',sourceId:'source-'+id,sourceNumber:'',
    note:'',createdAt,...extraFields};
}
test('B10: warehouse balances and global inventory use identical valid-ledger evidence',()=>{
  const valid=[
    movement('opening','opening','10'),
    movement('issue','issue','-2',{fromWarehouseId:main}),
    movement('purchase','purchase','3',{toWarehouseId:main}),
    movement('transfer','transfer','4',{fromWarehouseId:main,toWarehouseId:extra})
  ];
  const invalid=[
    movement('bad-receipt','purchase','100',{sourceId:''}),
    movement('bad-issue','issue','40',{fromWarehouseId:main}),
    movement('bad-opening','opening','-20'),
    movement('bad-transfer','transfer','50',{fromWarehouseId:main,toWarehouseId:main}),
    movement('bad-adjustment','adjustment','not-a-quantity'),
    movement('bad-date','adjustment','90',{date:'2026-02-31'}),
    movement('bad-cost','purchase','25',{unitCost:'-4'}),
    movement('bad-zero','adjustment','0')
  ];
  const all=[...valid,...invalid];
  assert.equal(inventoryBalances([item],all)[0].quantity,'11');
  assert.equal(operationsIntegritySummary([],[],all).invalidMovements,invalid.length);
  assert.equal(warehouseItemQuantity(item.id,main,all,main),70000n);
  assert.equal(warehouseItemQuantity(item.id,extra,all,main),40000n);
  const balances=warehouseBalances([item],all,warehouses,main);
  assert.deepEqual(balances.map(row=>row.quantity),['7','4']);
  assert.equal(balances.reduce((total,row)=>total+row.quantityScaled,0n),
    inventoryBalances([item],all)[0].quantityScaled);
  assert.equal(warehouseItemQuantity(item.id,main,valid,main),
    warehouseItemQuantity(item.id,main,all,main),'invalid entries cannot inflate available stock');
});
test('B10: unsafe warehouse entries fail closed instead of raising number parser errors',()=>{
  const invalid=[
    movement('unknown-number','adjustment','broken'),
    movement('invalid-negative-purchase','purchase','-5'),
    movement('negative-transfer','transfer','-7',{fromWarehouseId:main,toWarehouseId:extra}),
    movement('zero','issue','0')
  ];
  for(const row of invalid){
    assert.equal(movementLocationDelta(row,main,main),0n);
    assert.equal(movementLocationDelta(row,extra,main),0n);
  }
  assert.doesNotThrow(()=>warehouseItemQuantity(item.id,main,invalid,main));
  assert.equal(warehouseItemQuantity(item.id,main,invalid,main),0n);
});
test('B10: valid transfers relocate stock without changing total on-hand or manufacturing a receipt',()=>{
  const movements=[
    movement('opening','opening','8',{toWarehouseId:main}),
    movement('transfer','transfer','3',{fromWarehouseId:main,toWarehouseId:extra}),
    movement('return','transfer','1',{fromWarehouseId:extra,toWarehouseId:main})
  ];
  assert.equal(warehouseItemQuantity(item.id,main,movements,main),60000n);
  assert.equal(warehouseItemQuantity(item.id,extra,movements,main),20000n);
  assert.equal(inventoryBalances([item],movements)[0].quantityScaled,80000n);
});
