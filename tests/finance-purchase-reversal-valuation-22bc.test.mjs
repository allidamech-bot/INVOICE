import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,reversePurchase} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {previewMovingAveragePurchaseReversal} from '../dist/src/lib/inventory-purchase-reversal-valuation.js';

function fixture(){
  const vault=emptyVault();
  const item={id:'qa-item-reversal',sku:'REV-WAC-QA',descriptionEn:'Carton',
    descriptionAr:'',unit:'Carton',inventoryTracking:'tracked',lastUnitCost:'',
    lastCostCurrency:'',lastUnitPrice:'20.00',lastCurrency:'USD',
    createdAt:'2026-10-19T00:00:00.000Z',updatedAt:'2026-10-19T00:00:00.000Z',
    workspaceId:'default',branchId:'main'};
  const supplier={...createSupplier(),id:'qa-wac-supplier',nameEn:'Supplier QA'};
  vault.savedItems=[item];vault.suppliers=[supplier];
  const scope={workspaceId:'default',branchId:'main',warehouseId:defaultWarehouseId('main'),
    itemId:item.id,functionalCurrency:'USD'};
  return{vault,item,supplier,scope,previousEvents:[]};
}
function buy(state,id,quantity,unitCost,freight='0.00',date='2026-10-20'){
  const p=createPurchase(state.vault.purchases,[state.supplier],'USD');
  Object.assign(p,{id,number:'PUR-'+id,date,dueDate:date,currency:'USD',
    workspaceId:'default',branchId:'main',freight,duty:'0.00',otherCosts:'0.00'});
  p.items=[{...createPurchaseItem(state.item),id:'line-'+id,quantity,unitCost}];
  const posted=postPurchase(p,state.vault.savedItems,state.vault.inventoryMovements);
  assert.equal(posted.movements.length,1);
  const row={...posted.movements[0],workspaceId:'default',branchId:'main'};
  const event={id:row.id,kind:'receipt',sequence:state.previousEvents.length,
    date:row.date,workspaceId:'default',branchId:'main',warehouseId:state.scope.warehouseId,
    itemId:state.item.id,quantity:row.quantity,unitCost:row.unitCost,costCurrency:row.currency};
  return {...state,vault:{...state.vault,
    savedItems:posted.savedItems,
    purchases:[...state.vault.purchases,posted.purchase],
    inventoryMovements:[...state.vault.inventoryMovements,row]},
    previousEvents:[...state.previousEvents,event]};
}
function sale(state,quantity,id='qa-issued-invoice'){
  const invoice=createBlankDocument('invoice','INV-QA-REV',state.vault.company);
  Object.assign(invoice,{id,number:'INV-QA-REV',currency:'USD',
    issueDate:'2026-10-22',dueDate:'2026-10-23',status:'final',
    role:'standard',workspaceId:'default',branchId:'main'});
  invoice.customerSnapshot={sourceCustomerId:'qa-customer',companyNameEn:'QA Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],id:'qa-reversed-sale-line',
    descriptionEn:state.item.descriptionEn,unit:'Carton',stockTreatment:'tracked',
    savedItemId:state.item.id,skuSnapshot:state.item.sku,quantity,unitPrice:'20',unitCost:'10'}];
  const result=postIssuedInvoiceStock(state.vault,invoice);
  assert.equal(result.created,true);
  const row=result.vault.inventoryMovements.at(-1);
  assert.equal(row.type,'issue');
  return {...state,
    vault:{...result.vault,documents:[...state.vault.documents,invoice]},
    previousEvents:[...state.previousEvents,{
      id:row.id,kind:'issue',sequence:state.previousEvents.length,
      date:row.date,workspaceId:'default',branchId:'main',
      warehouseId:state.scope.warehouseId,itemId:state.item.id,
      quantity:quantity
    }]};
}
function reversal(state,purchaseId,reason='Returned to supplier after inspection'){
  const purchase=state.vault.purchases.find(p=>p.id===purchaseId);
  assert.ok(purchase);
  const result=reversePurchase(purchase,reason,state.vault.inventoryMovements,state.vault.savedItems);
  assert.equal(result.movements.length,1);
  const movement={...result.movements[0],workspaceId:'default',branchId:'main',
    fromWarehouseId:state.scope.warehouseId};
  const originalReceipt=state.vault.inventoryMovements.find(m=>m.sourceId===purchaseId&&m.type==='purchase');
  assert.ok(originalReceipt);
  return{scope:state.scope,previousEvents:state.previousEvents,
    purchase:result.purchase,originalReceipt,reversalMovement:movement};
}
const mixed=()=>buy(buy(fixture(),'first','4','5.00','4.00','2026-10-19'),
  'second','2','9.00','2.00','2026-10-20');

test('22 reversal: true posted 6 + 10 mixed receipt reports supplier-book valuation gap without booking it',()=>{
  const state=mixed(),before=JSON.stringify(state),input=reversal(state,'second');
  const result=previewMovingAveragePurchaseReversal(input);
  assert.equal(result.balanceQuantityBefore,'6.0000');
  assert.equal(result.carryingValueBefore,'44.000000000000');
  assert.equal(result.reversedQuantity,'2.0000');
  assert.equal(result.originalReceiptLandedValue,'20.000000000000');
  assert.equal(result.carryingValueRemoved,'14.666666666667');
  assert.equal(result.unresolvedReconciliationDifference,'5.333333333333');
  assert.equal(result.requiresSeparateFinancialReconciliation,true);
  assert.equal(result.balanceQuantityAfter,'4.0000');
  assert.equal(result.carryingValueAfter,'29.333333333333');
  assert.equal(result.priorSalesCostOfGoodsSold,'0.000000000000');
  assert.equal(JSON.stringify(state),before,'read-only calculation must never mutate source');
});

test('22 reversal: original supplier purchase can be below current WAC, signed difference reverses',()=>{
  const input=reversal(mixed(),'first'),value=previewMovingAveragePurchaseReversal(input);
  assert.equal(value.originalReceiptLandedValue,'24.000000000000');
  assert.equal(value.carryingValueRemoved,'29.333333333333');
  assert.equal(value.unresolvedReconciliationDifference,'-5.333333333333');
  assert.equal(value.balanceQuantityAfter,'2.0000');
  assert.equal(value.carryingValueAfter,'14.666666666667');
});

test('22 reversal: if original receipt is the entire remaining stock, supplier and book match',()=>{
  const state=buy(fixture(),'only','4','5.00','4.00','2026-10-19');
  const out=previewMovingAveragePurchaseReversal(reversal(state,'only'));
  assert.equal(out.carryingValueAfter,'0.000000000000');
  assert.equal(out.balanceQuantityAfter,'0.0000');
  assert.equal(out.unresolvedReconciliationDifference,'0.000000000000');
  assert.equal(out.requiresSeparateFinancialReconciliation,false);
});

test('22 reversal: prior actual invoice COGS stays unchanged and purchase return is not another sale',()=>{
  const state=sale(mixed(),'3');
  const value=previewMovingAveragePurchaseReversal(reversal(state,'second'));
  assert.equal(value.priorSalesCostOfGoodsSold,'22.000000000000');
  assert.equal(value.carryingValueBefore,'22.000000000000');
  assert.equal(value.carryingValueAfter,'7.333333333333');
  assert.equal(value.carryingValueRemoved,'14.666666666667');
  assert.equal(state.vault.documents[0].items[0].unitCost,'10');
});

test('22 reversal: returning more supplier units than remaining after customer sales refuses',()=>{
  const state=sale(mixed(),'5');
  assert.throws(()=>previewMovingAveragePurchaseReversal(reversal(state,'second')),
    /Cannot reverse more valued stock/);
});

test('22 reversal: source mismatch, duplicated receipt provenance and tampering fail closed',()=>{
  const input=reversal(mixed(),'second');
  const changes=[
    q=>{q.reversalMovement.quantity='-1';},
    q=>{q.reversalMovement.quantity='2';},
    q=>{q.reversalMovement.unitCost='9.00';},
    q=>{q.originalReceipt.unitCost='100';},
    q=>{q.reversalMovement.note='forged';},
    q=>{q.purchase.reverseReason='unknown';},
    q=>{q.purchase.status='posted';},
    q=>{q.purchase.items[0].landedUnitCost='500';},
    q=>{q.purchase.items.push({...q.purchase.items[0],id:'duplicate-line'});},
    q=>{q.originalReceipt.sourceId='wrong-purchase';},
    q=>{q.reversalMovement.sourceNumber='wrong-number';},
    q=>{q.reversalMovement.fromWarehouseId='other-location';},
    q=>{q.reversalMovement.branchId='other';},
    q=>{q.reversalMovement.currency='EUR';},
    q=>{q.reversalMovement.date='2026-10-18';},
    q=>{q.previousEvents=q.previousEvents.filter(e=>e.id!==q.originalReceipt.id);},
    q=>{q.previousEvents.push({...q.previousEvents[1],sequence:2});},
    q=>{q.previousEvents.push({...q.previousEvents[1],id:q.reversalMovement.id,sequence:2});}
  ];
  for(const change of changes){
    const candidate=structuredClone(input);change(candidate);
    assert.throws(()=>previewMovingAveragePurchaseReversal(candidate),
      /ALIF_22_PURCHASE_REVERSAL_NOT_READY|ALIF_22_COST_EVIDENCE_REQUIRED/,
      'tampered purchase valuation must reject');
  }
});

test('22 reversal: different company, functional currency or missing scope cannot be valued',()=>{
  const input=reversal(mixed(),'second');
  for(const [property,value] of [['workspaceId','other'],['branchId','other'],
    ['itemId','another-product'],['warehouseId',''],['functionalCurrency','EUR']]){
    const modified=structuredClone(input);modified.scope[property]=value;
    assert.throws(()=>previewMovingAveragePurchaseReversal(modified),/ALIF_22_PURCHASE_REVERSAL_NOT_READY/);
  }
});

test('22 reversal: negative stock is blocked without any mutation, no double-booked COGS',()=>{
  const state=sale(mixed(),'5'),draft=reversal(state,'second');
  const original=JSON.stringify(draft);
  for(let i=0;i<2;i++)assert.throws(()=>previewMovingAveragePurchaseReversal(draft),
    /Cannot reverse more valued stock/);
  assert.equal(JSON.stringify(draft),original);
});
