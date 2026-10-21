import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createPurchase,createPurchaseItem,createSupplier} from '../dist/src/lib/operations.js';
import {closedPeriodState,assertClosedPeriodUnchanged} from '../dist/src/lib/period-close.js';

const boundary={workspaceId:'default',through:'2026-10-31'};
const scope={workspaceId:'default',branchId:'main'};
const at='2026-10-01T12:00:00.000Z';
function fixture(){
  const v=emptyVault();
  v.branches.push({...v.branches[0],id:'east'});
  v.workspaces.push({...structuredClone(v.workspaces[0]),id:'other'});
  v.branches.push({...v.branches[0],id:'other-main',workspaceId:'other'});
  const doc=createBlankDocument('invoice','QA-PERIOD',v.company);
  Object.assign(doc,scope,{id:'invoice',status:'final',issueDate:'2026-10-01',dueDate:'2026-11-01',currency:'USD',createdAt:at,updatedAt:at});
  doc.customerSnapshot={sourceCustomerId:'buyer',companyNameEn:'QA Buyer',companyNameAr:'',email:'',phone:''};
  Object.assign(doc.items[0],{quantity:'1',unitPrice:'100.00',unitCost:'20.00'});
  Object.assign(doc.adjustments,{discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:true,taxPercent:'20'});
  v.documents=[doc];
  v.payments=[{...scope,id:'receipt',invoiceId:'invoice',invoiceNumber:doc.number,customerId:'buyer',customerNameEn:'QA Buyer',customerNameAr:'',currency:'USD',amount:'20.00',date:'2026-10-15',method:'bank-transfer',reference:'',notes:'',createdAt:at,updatedAt:at}];
  const supplier={...createSupplier(),...scope,id:'supplier',nameEn:'QA Supplier'};
  v.suppliers=[supplier];
  const purchase=createPurchase([],[supplier],'USD');
  Object.assign(purchase,scope,{id:'purchase',status:'posted',date:'2026-10-01',postedAt:at});
  purchase.items=[{...createPurchaseItem(),descriptionEn:'QA Item',quantity:'1',unitCost:'100.00'}];
  v.purchases=[purchase];
  v.supplierPayments=[{...scope,id:'supplier-pay',purchaseId:'purchase',purchaseNumber:purchase.number,supplierId:'supplier',supplierNameEn:'QA Supplier',supplierNameAr:'',currency:'USD',amount:'10.00',date:'2026-10-15',method:'cash',reference:'',notes:'',createdAt:at,updatedAt:at}];
  v.expenses=[{...scope,id:'expense',date:'2026-10-15',category:'other',description:'QA Expense',amount:'5.00',currency:'USD',supplierId:'',reference:'',notes:'',createdAt:at,updatedAt:at}];
  v.inventoryMovements=[{...scope,id:'opening',itemId:'item',itemNameEn:'QA Item',itemNameAr:'',sku:'QA',date:'2026-10-01',type:'opening',quantity:'2',unitCost:'10',currency:'USD',sourceId:'',sourceNumber:'',note:'',createdAt:at}];
  v.treasuryAccounts=[{...scope,id:'bank',label:'QA Bank',kind:'bank',currency:'USD',bankAccountId:'',active:true,createdAt:at,updatedAt:at}];
  v.treasuryEntries=[{...scope,id:'opening-bank',type:'opening-balance',date:'2026-10-01',currency:'USD',amount:'100',fromAccountId:'',toAccountId:'bank',sourceType:'manual',sourceId:'',reference:'',notes:'',reconciledAt:'',voidedAt:'',voidReason:'',createdAt:at,updatedAt:at}];
  return v;
}
function rejectChange(change){const before=fixture(),after=structuredClone(before);change(after);assert.throws(()=>assertClosedPeriodUnchanged(before,after,[boundary]),/closed period/i);}

test('retains deterministic all-branch source data and real financial/VAT results',()=>{
  const v=fixture(),original=JSON.stringify(v),state=closedPeriodState(v,boundary);
  assert.equal(state.version,1);assert.equal(state.workspaceId,'default');assert.equal(state.through,boundary.through);
  const main=state.branches.find(b=>b.branchId==='main');
  assert.equal(main.sales[0].invoiced,'120.00');assert.equal(main.sales[0].collected,'20.00');
  assert.equal(main.vat.currencies[0].outputVat,'20.00');
  assert.equal(main.receivables[0].outstanding,'100.00');assert.equal(main.payables[0].remaining,'90.00');
  assert.equal(main.accounts[0].balance,'100.00');assert.equal(main.inventory[0].quantity,'2.0000');
  assert.equal(state.sources.inventoryMovements[0].unitCost,'10');
  assert.equal(JSON.stringify(v),original);
  assert.deepEqual(JSON.parse(JSON.stringify(state)),state);
  const reorder=structuredClone(v);reorder.documents.reverse();reorder.branches.reverse();
  assert.deepEqual(closedPeriodState(reorder,boundary),state);
});

for(const field of ['amount','date','branchId','workspaceId','invoiceId','customerId','currency','id'])test(`rejects moving or changing a closed receipt: ${field}`,()=>{
  rejectChange(v=>{v.payments[0][field]=({amount:'21',date:'2026-11-01',branchId:'east',workspaceId:'other',invoiceId:'missing',customerId:'another',currency:'EUR',id:'new-id'})[field];});
});
for(const key of ['documents','payments','purchases','supplierPayments','expenses','inventoryMovements','treasuryEntries'])test(`rejects closed source deletion: ${key}`,()=>rejectChange(v=>{v[key]=[];}));
test('rejects backdated insertion at the inclusive boundary',()=>rejectChange(v=>v.payments.push({...v.payments[0],id:'late',date:'2026-10-31'})));
test('allows November payment against the original October invoice',()=>{
  const v=fixture(),after=structuredClone(v);after.payments.push({...after.payments[0],id:'november',date:'2026-11-01'});
  assert.doesNotThrow(()=>assertClosedPeriodUnchanged(v,after,[boundary]));
});
test('permits future transactions and changes in another company',()=>{
  const v=fixture(),after=structuredClone(v);after.expenses.push({...v.expenses[0],id:'future',date:'2026-11-01'});
  after.payments.push({...v.payments[0],id:'other-pay',workspaceId:'other',branchId:'other-main'});
  assert.doesNotThrow(()=>assertClosedPeriodUnchanged(v,after,[boundary]));
});
test('permits draft and document appearance edits without accounting changes',()=>{
  const v=fixture(),after=structuredClone(v),draft=structuredClone(v.documents[0]);
  draft.id='draft';draft.status='draft';draft.items[0].unitPrice='500';after.documents.push(draft);
  after.documents[0].notes='Review';after.documents[0].appearance.accentColor='#ffffff';
  assert.doesNotThrow(()=>assertClosedPeriodUnchanged(v,after,[boundary]));
});
test('rejects November void of October invoice because current sales and VAT engines remove it historically',()=>rejectChange(v=>{v.documents[0].lifecycleStatus='voided';v.documents[0].voidedAt='2026-11-02T12:00:00.000Z';}));
test('allows later supplier/treasury voids that preserve the existing as-of engines',()=>{
  const v=fixture(),after=structuredClone(v);
  for(const record of [after.supplierPayments[0],after.treasuryEntries[0]])Object.assign(record,{voidedAt:'2026-11-02T12:00:00.000Z',voidReason:'QA later cancellation',updatedAt:'2026-11-02T12:00:00.000Z'});
  assert.doesNotThrow(()=>assertClosedPeriodUnchanged(v,after,[boundary]));
});
test('rejects an in-period supplier cancellation',()=>rejectChange(v=>{v.supplierPayments[0].voidedAt='2026-10-31T12:00:00.000Z';}));
test('rejects equal-total redistribution across branches',()=>rejectChange(v=>{v.payments[0].branchId='east';}));
test('rejects closed VAT, stock cost and opening balance changes',()=>{
  rejectChange(v=>{v.documents[0].adjustments.taxPercent='10';});
  rejectChange(v=>{v.inventoryMovements[0].unitCost='11';});
  rejectChange(v=>{v.treasuryEntries[0].amount='101';});
});
for(const through of ['2026-02-29','2026-10-32','2026-1-01','2026-10-31T00:00:00Z',''])test(`rejects invalid close date ${through}`,()=>assert.throws(()=>closedPeriodState(fixture(),{...boundary,through}),/date/i));
test('accepts an actual leap day without timezone conversion',()=>assert.equal(closedPeriodState(fixture(),{...boundary,through:'2028-02-29'}).through,'2028-02-29'));
test('fails closed on unknown company, missing record scope, duplicate identity and invalid transaction dates',()=>{
  assert.throws(()=>closedPeriodState(fixture(),{...boundary,workspaceId:'missing'}),/workspace/i);
  for(const change of [v=>delete v.payments[0].branchId,v=>v.payments.push({...v.payments[0]}),v=>v.payments[0].date='invalid']){
    const v=fixture();change(v);assert.throws(()=>closedPeriodState(v,boundary),/scope|duplicate|date/i);
  }
});
test('different row order or object key order does not change the snapshot',()=>{
  const v=fixture(),after=structuredClone(v);
  after.payments[0]=Object.fromEntries(Object.entries(after.payments[0]).reverse());
  assert.doesNotThrow(()=>assertClosedPeriodUnchanged(v,after,[boundary]));
});
test('taxable credit notes retain their own source identity and actual VAT effect',()=>{
  const v=fixture(),credit=structuredClone(v.documents[0]);
  Object.assign(credit,{id:'credit',number:'QA-CREDIT',role:'credit-note',creditForId:'invoice',creditForNumber:v.documents[0].number,issueDate:'2026-10-20'});
  credit.items[0].unitPrice='25.00';v.documents.push(credit);
  const main=closedPeriodState(v,boundary).branches.find(b=>b.branchId==='main');
  assert.equal(main.vat.currencies[0].outputVat,'15.00');assert.equal(main.receivables[0].outstanding,'70.00');
  const after=structuredClone(v);after.documents[1].creditForId='another-invoice';
  assert.throws(()=>assertClosedPeriodUnchanged(v,after,[boundary]),/closed period/i);
});
test('later purchase reversal and stock reversal preserve the closed supplier and stock results',()=>{
  const v=fixture(),after=structuredClone(v);
  Object.assign(after.purchases[0],{status:'reversed',reversedAt:'2026-11-02T12:00:00.000Z',reverseReason:'QA',updatedAt:'2026-11-02T12:00:00.000Z'});
  after.inventoryMovements.push({...after.inventoryMovements[0],id:'later-stock',date:'2026-11-02',type:'adjustment',quantity:'-2'});
  assert.doesNotThrow(()=>assertClosedPeriodUnchanged(v,after,[boundary]));
});
test('multiple branches retain separate USD and EUR source and balance groups',()=>{
  const v=fixture(),second=structuredClone(v.documents[0]);
  Object.assign(second,{id:'east-invoice',number:'EAST',branchId:'east',currency:'EUR'});v.documents.push(second);
  const state=closedPeriodState(v,boundary);
  assert.equal(state.branches.find(b=>b.branchId==='east').sales[0].currency,'EUR');
  assert.equal(state.branches.find(b=>b.branchId==='main').sales[0].currency,'USD');
  const after=structuredClone(v);after.documents[1].branchId='main';
  assert.throws(()=>assertClosedPeriodUnchanged(v,after,[boundary]),/closed period/i);
});
test('source and report snapshots are detached from later source edits',()=>{
  const v=fixture(),state=closedPeriodState(v,boundary),saved=JSON.stringify(state);
  v.documents[0].items[0].unitPrice='999';v.inventoryMovements[0].unitCost='999';
  assert.equal(JSON.stringify(state),saved);
});
test('preserves historical FX rate inputs and excludes future rates',()=>{
  const v=fixture();v.fxRates=[{id:'fx',workspaceId:'default',date:'2026-10-01',fromCurrency:'USD',toCurrency:'EUR',rate:'0.9',sourceLabel:'QA',notes:'',createdAt:at,updatedAt:at}];
  const after=structuredClone(v);after.fxRates[0].rate='0.8';
  assert.throws(()=>assertClosedPeriodUnchanged(v,after,[boundary]),/closed period/i);
  const future=structuredClone(v);future.fxRates.push({...v.fxRates[0],id:'next',date:'2026-11-01'});
  assert.doesNotThrow(()=>assertClosedPeriodUnchanged(v,future,[boundary]));
});
test('retains a purchase reversed inside the closed interval even when the closing liability is zero',()=>{
  const v=fixture();Object.assign(v.purchases[0],{status:'reversed',reversedAt:'2026-10-20T12:00:00.000Z',reverseReason:'QA'});
  const state=closedPeriodState(v,boundary);
  assert.equal(state.sources.purchases.length,1);
  const after=structuredClone(v);after.purchases=[];
  assert.throws(()=>assertClosedPeriodUnchanged(v,after,[boundary]),/closed period/i);
});
test('rejects ambiguous historical currencies instead of falling back to USD',()=>{
  for(const key of ['documents','payments','purchases','supplierPayments','expenses','inventoryMovements','treasuryEntries']){
    const v=fixture();v.workspaces[0].smartDefaults.currency='EUR';v[key][0].currency='';
    assert.throws(()=>closedPeriodState(v,boundary),/currency/i,key);
  }
});
test('rejects account branch or currency mismatch instead of losing the historical bank balance',()=>{
  for(const change of [v=>v.treasuryAccounts[0].branchId='east',v=>v.treasuryAccounts[0].currency='EUR']){
    const v=fixture();change(v);assert.throws(()=>closedPeriodState(v,boundary),/account.*scope|account.*currency/i);
  }
});
test('rejects dangling historical receipts and credits before publishing plausible totals',()=>{
  for(const change of [v=>v.payments[0].invoiceId='missing',v=>v.supplierPayments[0].purchaseId='missing']){
    const v=fixture();change(v);assert.throws(()=>closedPeriodState(v,boundary),/source|reference/i);
  }
});
