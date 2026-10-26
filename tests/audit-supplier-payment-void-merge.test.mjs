import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,voidSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {appendTreasuryEntry,createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance,voidTreasuryEntry} from '../dist/src/lib/treasury-ledger.js';

function fixture(){
  const base=emptyVault();
  const supplier=createSupplier();
  supplier.id='supplier-void-fixture';
  supplier.nameEn='Audit Supplier';
  supplier.defaultCurrency='USD';
  const purchase=createPurchase([],[supplier],'USD');
  purchase.status='posted';
  purchase.postedAt='2026-10-01T09:00:00.000Z';
  purchase.date='2026-10-01';
  purchase.dueDate='2026-10-31';
  purchase.items=[{...createPurchaseItem(),quantity:'1',unitCost:'100.00'}];
  const payment=normalizeSupplierPayment(purchase,supplier,[],createSupplierPayment(purchase,supplier,[]));
  return {...base,suppliers:[supplier],purchases:[purchase],supplierPayments:[payment]};
}

test('void is an append-only merge; same payment stays in the encrypted vault',()=>{
  const base=fixture(),original=base.supplierPayments[0];
  const intended={...base,supplierPayments:[voidSupplierPayment(original,'Incorrect payment')]};
  const merged=mergeVaultIntent(base,intended,base);
  assert.equal(merged.supplierPayments.length,1);
  assert.equal(merged.supplierPayments[0].id,original.id);
  assert.ok(merged.supplierPayments[0].voidedAt);
  assert.equal(purchasePayableSummary(merged.purchases[0],merged.supplierPayments).paid,'0.00');
});

test('merge rejects destruction and rewriting of previously recorded supplier payments',()=>{
  const base=fixture(),payment=base.supplierPayments[0];
  assert.throws(()=>mergeVaultIntent(base,{...base,supplierPayments:[]},base),/history cannot be deleted/);
  assert.throws(()=>mergeVaultIntent(base,{...base,supplierPayments:[{...payment,amount:'30.00'}]},base),/immutable/);
  const voided=voidSupplierPayment(payment,'Incorrect payment'),asVoided={...base,supplierPayments:[voided]};
  assert.throws(()=>mergeVaultIntent(asVoided,{...asVoided,supplierPayments:[{...voided,voidedAt:'',voidReason:''}]},asVoided),/cannot be restored/);
});

test('new supplier settlements reject malformed grouped amounts through both entry and vault merge',()=>{
  const existing=fixture();
  const unpaid={...existing,supplierPayments:[]};
  const purchase=unpaid.purchases[0],supplier=unpaid.suppliers[0];
  const original=JSON.stringify(unpaid);
  for(const [i,amount] of ['1,2.00','0,1.00','١,٢.٠٠'].entries()){
    const proposed={...existing.supplierPayments[0],id:'unsafe-'+i,amount};
    assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[],proposed),/payment amount|invalid monetary/i,
      'do not silently reinterpret a new supplier payment');
    assert.throws(()=>mergeVaultIntent(unpaid,{...unpaid,supplierPayments:[proposed]},unpaid),/supplier payment amount|invalid monetary/i,
      'saved payment collection must reject helper bypass');
    assert.equal(JSON.stringify(unpaid),original,'failed save must not mutate historical records');
  }
  const proper={...existing.supplierPayments[0],id:'proper-grouping',amount:'1,200.00'};
  assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[],proper),/remaining purchase balance/,
    'correct grouping is parsed to its actual value, not truncated into an acceptable payment');
});

test('unchanged legacy supplier settlements keep their historical amount and accounting interpretation',()=>{
  const legacy=fixture();
  legacy.supplierPayments[0]={...legacy.supplierPayments[0],amount:'1,2.00'};
  const baseline=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,legacy,legacy);
  assert.equal(merged.supplierPayments[0].amount,'1,2.00');
  assert.equal(purchasePayableSummary(merged.purchases[0],merged.supplierPayments).paid,'12.00');
  assert.equal(JSON.stringify(legacy),baseline,'no repair rewrites the legacy record');
  const scope=legacy.appSettings;
  const account=createTreasuryAccount({label:'Legacy Supplier Cash',kind:'cash',currency:'USD',
    workspaceId:scope.activeWorkspaceId,branchId:scope.activeBranchId});
  const treasury=createTreasuryEntry('supplier-payment','USD');
  const allocated=appendTreasuryEntry({...legacy,treasuryAccounts:[account]},
    {...treasury,workspaceId:scope.activeWorkspaceId,branchId:scope.activeBranchId,
      amount:'12.00',fromAccountId:account.id,sourceType:'supplier-payment',
      sourceId:legacy.supplierPayments[0].id});
  assert.equal(allocated.treasuryEntries.length,1,'historical settlement can still be allocated to cash/bank');
  assert.equal(allocated.supplierPayments[0].amount,'1,2.00','treasury linking never rewrites source payment');
});

test('new supplier-payment treasury links cannot forge amount or allocate a supplier payment twice',()=>{
  const base=fixture(),scope=base.appSettings,payment=base.supplierPayments[0];
  const bank=createTreasuryAccount({label:'Supplier Payments Bank',kind:'bank',currency:'USD',
    workspaceId:scope.activeWorkspaceId,branchId:scope.activeBranchId});
  const source={...base,treasuryAccounts:[bank]};
  const entry={...createTreasuryEntry('supplier-payment','USD'),workspaceId:scope.activeWorkspaceId,
    branchId:scope.activeBranchId,amount:payment.amount,fromAccountId:bank.id,
    sourceType:'supplier-payment',sourceId:payment.id};
  const before=JSON.stringify(source);
  const forged={...entry,id:'forged-supplier-amount',amount:'10.00'};
  assert.throws(()=>mergeVaultIntent(source,{...source,treasuryEntries:[forged]},source),/payment amount|linked payment/i);
  const fake={...entry,id:'forged-supplier-source',sourceId:'missing-supplier-payment'};
  assert.throws(()=>mergeVaultIntent(source,{...source,treasuryEntries:[fake]},source),/linked payment/i);
  assert.throws(()=>mergeVaultIntent(source,{...source,treasuryEntries:[entry,{...entry,id:'duplicate-supplier-allocation'}]},source),
    /already allocated/i);
  const valid=mergeVaultIntent(source,{...source,treasuryEntries:[entry]},source);
  assert.equal(treasuryAccountBalance(bank.id,valid.treasuryEntries),'-100.00');
  assert.equal(JSON.stringify(source),before,'rejected supplier cash mutations never rewrite source accounting');
});


function allocatedSupplierBankFixture(){
  const supplied=fixture(),payment=supplied.supplierPayments[0];
  const {activeWorkspaceId:workspaceId,activeBranchId:branchId}=supplied.appSettings;
  const bank={...createTreasuryAccount({label:'Synthetic USD Supplier Bank',
    kind:'bank',currency:'USD',workspaceId,branchId}),id:'two-device-supplier-bank'};
  const withoutEntry={...supplied,treasuryAccounts:[bank]};
  const entry={...createTreasuryEntry('supplier-payment','USD'),
    id:'two-device-supplier-bank-outflow',workspaceId,branchId,
    amount:payment.amount,date:payment.date,fromAccountId:bank.id,
    sourceType:'supplier-payment',sourceId:payment.id};
  const allocated=appendTreasuryEntry(withoutEntry,entry);
  return{withoutEntry,allocated,payment,entry,bank};
}

test('two devices cannot void a supplier settlement while keeping its bank payout active',()=>{
  const {allocated,payment,bank}=allocatedSupplierBankFixture();
  const cancelled=voidSupplierPayment(payment,'Recorded incorrect supplier payment');
  const changed={...allocated,supplierPayments:[cancelled]};
  const frozen=JSON.stringify(allocated);
  for(const [intended,latest] of [
    [changed,allocated],
    [{...allocated,appSettings:{...allocated.appSettings,uiLanguage:'ar'}},changed]
  ]){
    assert.throws(()=>mergeVaultIntent(allocated,intended,latest),
      /active linked treasury entry|active cash\/bank entry references a voided supplier payment/i);
    assert.equal(JSON.stringify(allocated),frozen,'failed merge must not rewrite bank or AP');
    assert.equal(treasuryAccountBalance(bank.id,allocated.treasuryEntries),'-100.00');
  }
});

test('coordinated supplier payment void and linked bank void converge from both device orders',()=>{
  const {allocated,payment,entry,bank}=allocatedSupplierBankFixture();
  const voidedPayment=voidSupplierPayment(payment,'Source payment correction');
  const voidedBank=voidTreasuryEntry(entry,'Linked bank correction');
  const paymentDevice={...allocated,supplierPayments:[voidedPayment]};
  const bankDevice={...allocated,treasuryEntries:[voidedBank]};
  const frozen=JSON.stringify(allocated);
  for(const [intended,latest] of [[paymentDevice,bankDevice],[bankDevice,paymentDevice]]){
    const merged=mergeVaultIntent(allocated,intended,latest);
    assert.equal(merged.supplierPayments.length,1);
    assert.equal(merged.supplierPayments[0].voidedAt,voidedPayment.voidedAt);
    assert.equal(merged.treasuryEntries.length,1);
    assert.equal(merged.treasuryEntries[0].voidedAt,voidedBank.voidedAt);
    assert.equal(purchasePayableSummary(merged.purchases[0],merged.supplierPayments).paid,'0.00');
    assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'0.00');
    assert.equal(JSON.stringify(allocated),frozen,'original posted financial evidence remains intact');
  }
});

test('independent device allocations of one supplier payment cannot cause a double bank debit',()=>{
  const {withoutEntry,entry,bank}=allocatedSupplierBankFixture();
  const first={...entry,id:'device-a-bank-debit'};
  const second={...entry,id:'device-b-bank-debit'};
  const frozen=JSON.stringify(withoutEntry);
  for(const [intended,latest] of [
    [{...withoutEntry,treasuryEntries:[first]},{...withoutEntry,treasuryEntries:[second]}],
    [{...withoutEntry,treasuryEntries:[second]},{...withoutEntry,treasuryEntries:[first]}]
  ]){
    assert.throws(()=>mergeVaultIntent(withoutEntry,intended,latest),/already allocated/i);
    assert.equal(JSON.stringify(withoutEntry),frozen);
  }
  assert.equal(treasuryAccountBalance(bank.id,withoutEntry.treasuryEntries),'0.00');
});

test('independent supplier settlements respect the final combined purchase liability',()=>{
  const source=fixture(),original=source.supplierPayments[0],
    unpaid={...source,supplierPayments:[]};
  const first={...original,id:'device-a-vendor-payment',amount:'70.00'};
  const second={...original,id:'device-b-vendor-payment',amount:'70.00'};
  const snapshot=JSON.stringify(unpaid);
  assert.throws(()=>mergeVaultIntent(unpaid,{...unpaid,supplierPayments:[first]},
    {...unpaid,supplierPayments:[second]}),/remaining purchase balance/i,
    'two independent acceptable 70-dollar payments must not settle a 100-dollar purchase for 140');
  assert.equal(JSON.stringify(unpaid),snapshot);
  const safeA={...first,amount:'40.00'},safeB={...second,amount:'40.00'};
  const merged=mergeVaultIntent(unpaid,{...unpaid,supplierPayments:[safeA]},
    {...unpaid,supplierPayments:[safeB]});
  assert.deepEqual(merged.supplierPayments.map(row=>row.id).sort(),
    [safeA.id,safeB.id].sort());
  assert.equal(purchasePayableSummary(merged.purchases[0],merged.supplierPayments).paid,'80.00');
  assert.equal(purchasePayableSummary(merged.purchases[0],merged.supplierPayments).remaining,'20.00');
});
