import test from 'node:test';
import assert from 'node:assert/strict';
import {
  treasuryProjection,treasuryTotals,treasuryAccountBalance
} from '../dist/src/lib/treasury-ledger.js';
import {treasuryPeriodReport} from '../dist/src/lib/treasury-report.js';

// Regression for Alif cash/bank KPI: unallocated receipts, supplier payments
// and expenses are workflow items, not actual cash/bank movements.
// All records are synthetic and in-memory; no Firebase, UI login or live ledger.
const date='2026-10-12',createdAt='2026-10-12T10:00:00.000Z';
const scope={workspaceId:'default',branchId:'main'};
const payment={...scope,id:'customer-50',invoiceId:'synthetic-invoice',
  invoiceNumber:'INV-QA',customerNameEn:'Synthetic Customer',
  date,createdAt,currency:'USD',amount:'50.00',reference:'REC-QA',method:'bank-transfer'};
const supplier={...scope,id:'supplier-30',purchaseId:'synthetic-purchase',
  purchaseNumber:'PUR-QA',supplierNameEn:'Synthetic Supplier',
  date,createdAt,currency:'USD',amount:'30.00',reference:'PAY-QA',method:'bank-transfer'};
const expense={...scope,id:'expense-7',description:'Unallocated petty cash',
  date,createdAt,currency:'USD',amount:'7.00',reference:'EXP-QA'};
const account={...scope,id:'bank',label:'QA Bank',kind:'bank',
  currency:'USD',active:true,createdAt,updatedAt:createdAt};
const opening={...scope,id:'open-100',type:'opening-balance',
  sourceType:'manual',sourceId:'',date:'2026-10-01',
  currency:'USD',amount:'100.00',fromAccountId:'',toAccountId:'bank',
  reference:'Opening',notes:'',createdAt,updatedAt:createdAt,voidedAt:'',reconciledAt:''};
const transfer={...opening,id:'transfer-5',type:'transfer',sourceType:'manual',
  date,amount:'5.00',fromAccountId:'bank',toAccountId:'cash'};
function move(id,type,sourceType,sourceId,amount,toAccountId,fromAccountId=''){
  return{...opening,id,type,sourceType,sourceId,date,amount,toAccountId,
    fromAccountId,reference:id};
}
function view(entries,extra={}){
  return treasuryProjection([payment], [supplier], [expense], entries,
    extra.reconciliations||[],'USD',extra.asOf||'');
}
function totals(entries,extra={}){return treasuryTotals(view(entries,extra),'USD');}
function report(entries){
  return treasuryPeriodReport({...scope,from:'2026-10-01',to:'2026-10-31',
    accounts:[account],entries,payments:[payment],
    supplierPayments:[supplier],expenses:[expense],
    reconciliations:[],defaultCurrency:'USD'});
}
test('unallocated receipts, supplier payments and expenses never create bank movement',()=>{
  const entries=[opening],before=JSON.stringify({entries,payment,supplier,expense});
  const projected=view(entries);
  assert.equal(projected.filter(row=>!row.fromAccountId&&!row.toAccountId).length,3,
    'unallocated items must remain visible in movement queue');
  assert.deepEqual(totals(entries),{
    inflow:'0.00',outflow:'0.00',net:'0.00',internalTransfers:'0.00',
    reconciled:0,unreconciled:1
  });
  assert.equal(treasuryAccountBalance('bank',entries),'100.00');
  assert.equal(report(entries).accounts[0].closing,'100.00');
  assert.equal(report(entries).unallocated.length,3);
  assert.equal(JSON.stringify({entries,payment,supplier,expense}),before,
    'read-only KPI computation cannot mutate sources');
});
test('explicit payment allocations count once in ledger movement and match report balance',()=>{
  const collection=move('collection-50','collection','customer-payment',payment.id,'50.00','bank');
  const disbursement=move('supplier-30','supplier-payment','supplier-payment',supplier.id,'30.00','', 'bank');
  const entries=[opening,collection,disbursement],result=totals(entries);
  assert.deepEqual([result.inflow,result.outflow,result.net],
    ['50.00','30.00','20.00']);
  assert.equal(treasuryAccountBalance('bank',entries),'120.00');
  assert.equal(report(entries).accounts[0].closing,'120.00');
  assert.deepEqual(view(entries).filter(row=>!row.fromAccountId&&!row.toAccountId).map(row=>row.source),['expense'],
    'the unallocated expense remains separately visible without inflating KPI');
  assert.equal(report(entries).unallocated.length,1);
});
test('voided collection restores unallocated list and removes its cash movement, without erasing supplier disbursement',()=>{
  const collection=move('collection-50','collection','customer-payment',payment.id,'50.00','bank');
  collection.voidedAt='2026-10-20T09:00:00.000Z';
  const disbursement=move('supplier-30','supplier-payment','supplier-payment',supplier.id,'30.00','','bank');
  const entries=[opening,collection,disbursement];
  const x=totals(entries,{asOf:'2026-10-31'});
  assert.deepEqual([x.inflow,x.outflow,x.net],['0.00','30.00','-30.00']);
  assert.equal(treasuryAccountBalance('bank',entries,'2026-10-31'),'70.00');
  assert.equal(report(entries).accounts[0].closing,'70.00');
  assert.equal(view(entries,{asOf:'2026-10-31'}).filter(row=>!row.fromAccountId&&!row.toAccountId).length,2);
});
test('internal bank-to-cash transfer is not income or expense; unallocated reconciliation does not count',()=>{
  const reconciliations=[{id:'unallocated-reviewed',movementKey:'collection:customer-50',
    action:'reconcile',createdAt,reconciledAt:createdAt}];
  const entries=[opening,transfer];
  const rows=view(entries,{reconciliations});
  assert.equal(rows.find(row=>row.id===payment.id).reconciled,true);
  const summary=treasuryTotals(rows,'USD');
  assert.deepEqual([summary.inflow,summary.outflow,summary.net,summary.internalTransfers],
    ['0.00','0.00','0.00','5.00']);
  assert.equal(summary.reconciled,0,'unallocated workflow acknowledgements cannot count as bank reconciliations');
  assert.equal(treasuryAccountBalance('bank',entries),'95.00');
  assert.equal(treasuryAccountBalance('cash',entries),'5.00');
});
