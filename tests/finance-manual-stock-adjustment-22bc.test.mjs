import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {previewManualStockAdjustment} from '../dist/src/lib/inventory-manual-adjustment-valuation.js';

const scope={workspaceId:'qa-company',branchId:'qa-branch',itemId:'qa-carton',
  warehouseId:'qa-warehouse',functionalCurrency:'USD'};
const item={id:scope.itemId,sku:'QA-CARTON',descriptionEn:'Carton',
  descriptionAr:'',lastUnitCost:'99',lastCostCurrency:'EUR'};
const prior=[
  {id:'p1',kind:'receipt',sequence:1,date:'2026-10-19',
    workspaceId:scope.workspaceId,branchId:scope.branchId,itemId:scope.itemId,
    warehouseId:scope.warehouseId,quantity:'4',unitCost:'6',costCurrency:'USD'},
  {id:'p2',kind:'receipt',sequence:2,date:'2026-10-20',
    workspaceId:scope.workspaceId,branchId:scope.branchId,itemId:scope.itemId,
    warehouseId:scope.warehouseId,quantity:'2',unitCost:'10',costCurrency:'USD'}
];
function adjustment(quantity,unitCost='10',options={}){
  const doc=Buffer.from('%PDF-1.4\n');
  const movement=createManualInventoryMovement(item,'adjustment',quantity,
    '2026-10-22','Physical count difference confirmed',unitCost,'USD');
  return {...movement,id:'qa-count-01',
    workspaceId:scope.workspaceId,branchId:scope.branchId,
    ...(quantity.startsWith('-')?{fromWarehouseId:scope.warehouseId}:
      {toWarehouseId:scope.warehouseId}),
    reasonCategory:'count',createdBy:'qa-operator',evidence:{
      id:'qa-evidence',name:'count.pdf',mimeType:'application/pdf',size:doc.length,
      dataUrl:'data:application/pdf;base64,'+doc.toString('base64'),
      createdAt:'2026-10-22T00:00:00Z'
    },...options};
}

test('22 adjustment: loss uses current average and never labels it new sales COGS',()=>{
  const row=adjustment('-2','99');
  const original=JSON.stringify({prior,row});
  const result=previewManualStockAdjustment(scope,prior,row);
  assert.equal(result.direction,'decrease');
  assert.equal(result.valueChange,'-14.666666666667');
  assert.equal(result.afterQuantity,'4.0000');
  assert.equal(result.afterValue,'29.333333333333');
  assert.equal(result.previousSalesCOGS,'0.000000000000');
  assert.equal(result.requiresSeparateJournal,true);
  assert.equal(JSON.stringify({prior,row}),original);
});

test('22 adjustment: documented increase includes its own cost, never the catalog latest cost',()=>{
  const row=adjustment('2','8');
  const out=previewManualStockAdjustment(scope,prior,row);
  assert.equal(out.direction,'increase');
  assert.equal(out.valueChange,'16.000000000000');
  assert.equal(out.afterValue,'60.000000000000');
  assert.equal(out.afterQuantity,'8.0000');
  assert.equal(out.previousSalesCOGS,'0.000000000000');
});

test('22 adjustment: fractional quantity value uses exact arithmetic',()=>{
  const out=previewManualStockAdjustment(scope,
    [{...prior[0],quantity:'0.0003',unitCost:'0.01'}],
    adjustment('-0.0001','100'));
  assert.equal(out.valueChange,'-0.000001000000');
  assert.equal(out.afterQuantity,'0.0002');
});

test('22 adjustment: insufficient stock cannot be adjusted into negative balance',()=>{
  assert.throws(()=>previewManualStockAdjustment(scope,prior,adjustment('-7')),
    /Insufficient stock/);
});

test('22 adjustment: invalid physical evidence, operator or reason always reject',()=>{
  const cases=[
    {evidence:undefined},{createdBy:''},{reasonCategory:''},{note:'X'},
    {evidence:{...adjustment('1').evidence,size:20}},
    {evidence:{...adjustment('1').evidence,dataUrl:'data:application/pdf;base64,Zm9yZ2Vk'}}
  ];
  for(const change of cases)
    assert.throws(()=>previewManualStockAdjustment(scope,prior,adjustment('1','8',change)),
      /Evidence, reason or operator missing/);
});

test('22 adjustment: new receiving units require an explicit cost and same currency',()=>{
  for(const cost of ['', '-5','bad','1.1234567890123'])
    assert.throws(()=>previewManualStockAdjustment(scope,prior,adjustment('1',cost)),
      /Positive adjustment needs/);
  assert.throws(()=>previewManualStockAdjustment(scope,prior,adjustment('1','8',
    {currency:'EUR'})),/Currency adjustment/);
});

test('22 adjustment: scope, chronology, replay, reverse-correction and precision fail closed',()=>{
  for(const change of [
    {workspaceId:'other'},{branchId:'other'},{itemId:'other'},
    {fromWarehouseId:'incorrect'},{toWarehouseId:'other-location'},
    {type:'issue'},{sourceId:'prior-adjustment'},
    {date:'2026-10-18'},{quantity:'0'},{quantity:'0.00001'}
  ])assert.throws(()=>previewManualStockAdjustment(scope,prior,
    adjustment('1','8',change)),/ALIF_22_ADJUSTMENT_NOT_READY/);
  assert.throws(()=>previewManualStockAdjustment(scope,
    [...prior,{...prior[0],id:'qa-count-01',sequence:3}],
    adjustment('1','8')),/Movement identity/);
});

test('22 adjustment: negative count uses historical WAC after a sale, but does not post new sales COGS',()=>{
  const sold=[...prior,{id:'real-sale',kind:'issue',sequence:3,date:'2026-10-21',
    workspaceId:scope.workspaceId,branchId:scope.branchId,itemId:scope.itemId,
    warehouseId:scope.warehouseId,quantity:'1'}];
  const result=previewManualStockAdjustment(scope,sold,adjustment('-2'));
  assert.equal(result.previousSalesCOGS,'7.333333333333');
  assert.equal(result.valueChange,'-14.666666666667');
  assert.equal(result.afterQuantity,'3.0000');
});
