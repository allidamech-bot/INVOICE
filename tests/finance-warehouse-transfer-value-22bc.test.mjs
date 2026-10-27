import test from 'node:test';
import assert from 'node:assert/strict';
import {createWarehouseTransfer,movementLocationDelta} from '../dist/src/lib/warehouses.js';
import {calculateMovingWeightedAverage} from '../dist/src/lib/inventory-moving-average.js';
import {previewMovingAverageWarehouseTransfer} from '../dist/src/lib/inventory-transfer-valuation.js';

const base={workspaceId:'qa-workspace',branchId:'qa-branch',itemId:'qa-cartons',functionalCurrency:'USD'};
const fromScope={...base,warehouseId:'qa-east'};
const toScope={...base,warehouseId:'qa-west'};
const item={id:base.itemId,descriptionEn:'Synthetic cartons',descriptionAr:'',sku:'QA-22-T',
  lastUnitCost:'99.00',lastCostCurrency:'EUR'};
const event=(scope,id,sequence,kind,quantity,unitCost,date='2026-10-20')=>({
  id,sequence,kind,quantity,date,
  workspaceId:scope.workspaceId,branchId:scope.branchId,
  warehouseId:scope.warehouseId,itemId:scope.itemId,
  ...(unitCost===undefined?{}:{unitCost,costCurrency:'USD'})
});
const receipt=(scope,id,seq,qty,cost,date)=>event(scope,id,seq,'receipt',qty,cost,date);
const issue=(scope,id,seq,qty,date)=>event(scope,id,seq,'issue',qty,undefined,date);
const transfer=(quantity='3',date='2026-10-21')=>({
  ...createWarehouseTransfer(item,fromScope.warehouseId,toScope.warehouseId,quantity,date,
    'Synthetic warehouse-to-warehouse movement'),
  id:'qa-transfer-20261027',workspaceId:fromScope.workspaceId,branchId:fromScope.branchId
});
const purchaseHistory=()=>[
  receipt(fromScope,'supplier-1',1,'4','6.00','2026-10-19'),
  receipt(fromScope,'supplier-2',2,'2','10.00','2026-10-20')
];
const preview=(fromEvents=purchaseHistory(),toEvents=[],movement=transfer(),extra={})=>
  previewMovingAverageWarehouseTransfer({fromScope,toScope,fromEvents,toEvents,movement,...extra});

test('22 transfer: mixed landed costs move exact book value, not last-cost catalog price',()=>{
  const fromEvents=purchaseHistory(),toEvents=[],row=transfer(),before=JSON.stringify({fromEvents,toEvents,row,item});
  const out=preview(fromEvents,toEvents,row);
  assert.equal(out.transferredQuantity,'3.0000');
  assert.equal(out.transferredCarryingValue,'22.000000000000');
  assert.equal(out.from.quantity,'3.0000');
  assert.equal(out.from.carryingValue,'22.000000000000');
  assert.equal(out.to.quantity,'3.0000');
  assert.equal(out.to.carryingValue,'22.000000000000');
  assert.equal(out.from.preTransferCostOfGoodsSold,'0.000000000000');
  assert.equal(out.to.preTransferCostOfGoodsSold,'0.000000000000');
  assert.equal(out.combinedCarryingValueBefore,'44.000000000000');
  assert.equal(out.combinedCarryingValueAfter,'44.000000000000');
  assert.equal(movementLocationDelta(row,fromScope.warehouseId,fromScope.warehouseId),-30000n);
  assert.equal(movementLocationDelta(row,toScope.warehouseId,fromScope.warehouseId),30000n);
  assert.equal(JSON.stringify({fromEvents,toEvents,row,item}),before,'physical and accounting source remain immutable');
});

test('22 transfer: source and destination independently retain correct weighted average',()=>{
  const dest=[receipt(toScope,'west-prior',1,'2','12.00','2026-10-19')];
  const out=preview(purchaseHistory(),dest);
  assert.equal(out.from.averageUnitCost,'7.333333333333');
  assert.equal(out.to.carryingValue,'46.000000000000');
  assert.equal(out.to.quantity,'5.0000');
  assert.equal(out.to.averageUnitCost,'9.200000000000');
  assert.equal(out.combinedCarryingValueBefore,'68.000000000000');
  assert.equal(out.combinedCarryingValueAfter,'68.000000000000');
});

test('22 transfer: preceding customer sale remains COGS, transfer does not generate another sale',()=>{
  const stream=[...purchaseHistory(),issue(fromScope,'customer-sale',3,'1','2026-10-20')];
  const prior=calculateMovingWeightedAverage(fromScope,stream);
  const moved=preview(stream,[],transfer('3'));
  assert.equal(moved.from.preTransferCostOfGoodsSold,prior.costOfGoodsSold);
  assert.equal(moved.from.preTransferCostOfGoodsSold,'7.333333333333');
  assert.equal(moved.to.preTransferCostOfGoodsSold,'0.000000000000');
  assert.equal(moved.transferredCarryingValue,'22.000000000000');
  assert.equal(moved.from.carryingValue,'14.666666666667');
});

test('22 transfer: whole position depletion preserves exact residual carrying value',()=>{
  const out=preview(purchaseHistory(),[],transfer('6'));
  assert.equal(out.from.quantity,'0.0000');
  assert.equal(out.from.carryingValue,'0.000000000000');
  assert.equal(out.to.quantity,'6.0000');
  assert.equal(out.to.carryingValue,'44.000000000000');
});

test('22 transfer: 4dp fractions conserve even sub-cent values without floating-point arithmetic',()=>{
  const rows=[receipt(fromScope,'fraction',1,'0.0003','0.01')];
  const out=preview(rows,[],transfer('0.0001'));
  assert.equal(out.transferredCarryingValue,'0.000000001000');
  assert.equal(out.from.carryingValue,'0.000000002000');
  assert.equal(out.to.carryingValue,'0.000000001000');
  assert.equal(out.combinedCarryingValueBefore,out.combinedCarryingValueAfter);
});

test('22 transfer: documented zero-cost stock retains zero cost without fabricated value',()=>{
  const out=preview([receipt(fromScope,'complimentary',1,'5','0')],[],transfer('2'));
  assert.equal(out.transferredCarryingValue,'0.000000000000');
  assert.equal(out.from.quantity,'3.0000');
  assert.equal(out.to.quantity,'2.0000');
});

test('22 transfer: overdraw or zero/subprecision transfer never generates financial postings',()=>{
  const before=JSON.stringify(purchaseHistory());
  for(const qty of ['7','0','-1','0.00001']){
    const row=qty==='0.00001'?{...transfer(),quantity:qty}:qty==='-1'?{...transfer(),quantity:qty}:qty==='0'?{...transfer(),quantity:qty}:transfer(qty);
    assert.throws(()=>preview(purchaseHistory(),[],row),/ALIF_22_TRANSFER_NOT_READY/);
  }
  assert.equal(JSON.stringify(purchaseHistory()),before);
});

test('22 transfer: cross-company, cross-branch, cross-item or cross-currency transfer fails closed',()=>{
  for(const key of ['workspaceId','branchId','itemId','functionalCurrency']){
    const wrong={...toScope,[key]:key==='functionalCurrency'?'EUR':'other'};
    assert.throws(()=>previewMovingAverageWarehouseTransfer({fromScope,toScope:wrong,
      fromEvents:purchaseHistory(),toEvents:[],movement:transfer()}),/ALIF_22_TRANSFER_NOT_READY/);
  }
  for(const mod of [{fromWarehouseId:'nonexistent'},{toWarehouseId:'nonexistent'},
    {workspaceId:'other'},{branchId:'other'},{itemId:'other'},{type:'issue'},
    {date:'invalid'},{id:''}]){
    assert.throws(()=>preview(purchaseHistory(),[],{...transfer(),...mod}),/ALIF_22_TRANSFER_NOT_READY/);
  }
});

test('22 transfer: duplicate transfer, same-warehouse and chronology violations reject',()=>{
  assert.throws(()=>preview(purchaseHistory(),[],transfer(),{earlierTransferIds:['qa-transfer-20261027']}),
    /already applied/);
  assert.throws(()=>preview(purchaseHistory(),[],transfer('3','2026-10-19')),
    /predates an already recognized/);
  assert.throws(()=>preview(purchaseHistory(),[],transfer(),{toScope:fromScope}),
    /different warehouses/);
  assert.throws(()=>preview([...purchaseHistory(),{...receipt(fromScope,'qa-transfer-20261027',3,'1','1',
    '2026-10-20')}]),/cannot also occur/);
});

test('22 transfer: missing cost, cross-currency purchase without FX, and negative original stock are not excused',()=>{
  assert.throws(()=>preview([event(fromScope,'missing',1,'receipt','2',undefined)],[]),
    /ALIF_22_COST_EVIDENCE_REQUIRED/);
  assert.throws(()=>preview([{...receipt(fromScope,'eur',1,'5','12','2026-10-20'),
    costCurrency:'EUR'}],[]),/ALIF_22_COST_EVIDENCE_REQUIRED/);
  assert.throws(()=>preview([issue(fromScope,'unbacked',1,'2','2026-10-20')],[]),
    /Insufficient valued inventory/);
});
