import test from 'node:test';
import assert from 'node:assert/strict';
import {createPurchase,createPurchaseItem,createSupplier} from '../dist/src/lib/operations.js';
import {purchasePayableSummary,supplierPayablesByCurrency,supplierStatement,normalizeSupplierPayment} from '../dist/src/lib/payables.js';

function fixture(){
  const supplier={...createSupplier(),nameEn:'Synthetic vendor'};
  const purchase=createPurchase([],[supplier],'USD');
  purchase.id='synthetic-purchase';
  purchase.number='PUR-FINANCE-HISTORY';
  purchase.status='posted';
  purchase.date='2026-10-01';
  purchase.dueDate='2026-10-10';
  purchase.postedAt='2026-10-01T10:00:00.000Z';
  purchase.items=[{...createPurchaseItem(),quantity:'1',unitCost:'1000.00'}];
  const payment={
    id:'synthetic-supplier-payment',purchaseId:purchase.id,purchaseNumber:purchase.number,
    supplierId:supplier.id,supplierNameEn:supplier.nameEn,supplierNameAr:'',
    amount:'200.00',currency:'USD',date:'2026-10-05',
    method:'bank-transfer',reference:'REF',notes:'',
    createdAt:'2026-10-05T12:00:00.000Z',updatedAt:'2026-10-05T12:00:00.000Z'
  };
  return{purchase,supplier,payment};
}

test('a valid supplier payment is still counted once in summary, aging and statement',()=>{
  const {purchase,supplier,payment}=fixture();
  const summary=purchasePayableSummary(purchase,[payment],'2026-10-15');
  assert.deepEqual([summary.total,summary.paid,summary.remaining],['1000.00','200.00','800.00']);
  const aging=supplierPayablesByCurrency([purchase],[payment],'2026-10-15')[0];
  assert.deepEqual([aging.purchases,aging.paid,aging.remaining],['1000.00','200.00','800.00']);
  const statement=supplierStatement(supplier.id,[purchase],[payment],'2026-10-15')[0];
  assert.deepEqual([statement.paid,statement.remaining,statement.entries.at(-1).balance],['200.00','800.00','800.00']);
});

test('malformed stored supplier payment cannot silently become a zero credit in any payable report',()=>{
  for(const value of ['error','1e100','=1+1','0','0.00','-10.00']){
    const {purchase,supplier,payment}=fixture();
    payment.amount=value;
    const before=JSON.stringify([purchase,payment]);
    const calls=[
      ()=>purchasePayableSummary(purchase,[payment],'2026-10-15'),
      ()=>supplierPayablesByCurrency([purchase],[payment],'2026-10-15'),
      ()=>supplierStatement(supplier.id,[purchase],[payment],'2026-10-15')
    ];
    for(const calculate of calls)assert.throws(calculate,/supplier payment amount/i,value);
    assert.equal(JSON.stringify([purchase,payment]),before,'report has no mutation side effects');
  }
});

test('future corrupted payments do not contaminate earlier as-of supplier statements',()=>{
  const {purchase,supplier,payment}=fixture();
  payment.amount='invalid';
  payment.date='2026-11-05';
  assert.equal(purchasePayableSummary(purchase,[payment],'2026-10-15').paid,'0.00');
  assert.equal(supplierPayablesByCurrency([purchase],[payment],'2026-10-15')[0].remaining,'1000.00');
  assert.equal(supplierStatement(supplier.id,[purchase],[payment],'2026-10-15')[0].entries.length,1);
  assert.throws(()=>purchasePayableSummary(purchase,[payment],'2026-11-06'),/supplier payment amount/i);
});

test('already voided invalid payment is excluded at cutoff but not silently suppressed before void',()=>{
  const {purchase,supplier,payment}=fixture();
  payment.amount='broken';
  payment.voidedAt='2026-10-12T07:00:00.000Z';
  payment.voidReason='Synthetic error';
  assert.throws(()=>purchasePayableSummary(purchase,[payment],'2026-10-11'),/supplier payment amount/i);
  assert.equal(purchasePayableSummary(purchase,[payment],'2026-10-13').paid,'0.00');
  assert.equal(supplierStatement(supplier.id,[purchase],[payment],'2026-10-13')[0].entries.length,1);
});

test('a corrupted earlier stored settlement blocks a new payment instead of proposing duplicate settlement',()=>{
  const {purchase,supplier,payment}=fixture();
  payment.amount='invalid';
  const next={...payment,id:'new',amount:'100.00',date:'2026-10-15'};
  assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[payment],next),/supplier payment amount/i);
});
