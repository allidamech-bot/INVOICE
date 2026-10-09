import test from 'node:test';
import assert from 'node:assert/strict';
import {treasuryAccountBalance,treasuryProjection} from '../dist/src/lib/treasury-ledger.js';

const supplierPayment={
  id:'supplier-payment-history',purchaseId:'purchase-history',purchaseNumber:'PUR-HISTORY',
  supplierId:'supplier-history',supplierNameEn:'History Supplier',supplierNameAr:'',
  currency:'USD',amount:'200.00',date:'2026-10-02',method:'bank-transfer',
  reference:'PAY-HISTORY',notes:'',createdAt:'2026-10-02T09:00:00.000Z',
  updatedAt:'2026-10-20T10:00:00.000Z',voidedAt:'2026-10-20T10:00:00.000Z',
  voidReason:'Incorrect payment'
};
const treasuryEntry={
  id:'treasury-history',type:'supplier-payment',sourceType:'supplier-payment',sourceId:supplierPayment.id,
  workspaceId:'default',branchId:'main',date:'2026-10-02',currency:'USD',amount:'200.00',
  fromAccountId:'bank-history',toAccountId:'',reference:'PAY-HISTORY',notes:'',
  createdAt:'2026-10-02T10:00:00.000Z',updatedAt:'2026-10-20T10:00:00.000Z',
  reconciledAt:'2026-10-15T09:00:00.000Z',voidedAt:'2026-10-20T10:00:00.000Z',
  voidReason:'Incorrect payment'
};

test('historical treasury keeps a subsequently voided linked supplier payment once, with original bank effect',()=>{
  const before=treasuryProjection([],[supplierPayment],[],[treasuryEntry],[],'USD','2026-10-09');
  assert.equal(before.length,1,'linked payment must not be double counted');
  assert.equal(before[0].key,'treasury:treasury-history');
  assert.equal(before[0].amount,'200.00');
  assert.equal(before[0].reconciled,false,'reconciliation happened after historical cutoff');
  assert.equal(treasuryAccountBalance('bank-history',[treasuryEntry],'2026-10-09'),'-200.00');
  const reconciled=treasuryProjection([],[supplierPayment],[],[treasuryEntry],[],'USD','2026-10-16');
  assert.equal(reconciled[0].reconciled,true);
  assert.equal(treasuryProjection([],[supplierPayment],[],[treasuryEntry],[],'USD','2026-10-21').length,0);
  assert.equal(treasuryAccountBalance('bank-history',[treasuryEntry],'2026-10-21'),'0.00');
  assert.equal(treasuryProjection([],[supplierPayment],[],[treasuryEntry],[]).length,0);
});

test('unallocated supplier payments remain visible before void and not after, with entered-later exclusion',()=>{
  const before=treasuryProjection([],[supplierPayment],[],[],[],'USD','2026-10-09');
  assert.equal(before.length,1);
  assert.equal(before[0].key,'supplier-payment:supplier-payment-history');
  assert.equal(treasuryProjection([],[supplierPayment],[],[],[],'USD','2026-10-21').length,0);
  const later={...supplierPayment,id:'late-entered',date:'2026-10-02',createdAt:'2026-10-17T10:00:00.000Z',voidedAt:''};
  assert.equal(treasuryProjection([],[later],[],[],[],'USD','2026-10-09').length,0);
});

test('historical treasury filters later collections and later-entered expenses',()=>{
  const collection={id:'customer-late',date:'2026-10-20',createdAt:'2026-10-20T09:00:00.000Z',
    currency:'USD',amount:'50.00',method:'bank-transfer',customerNameEn:'Customer'};
  const expense={id:'expense-late',date:'2026-10-01',createdAt:'2026-10-20T09:00:00.000Z',
    currency:'USD',amount:'60.00',description:'Late bill'};
  assert.equal(treasuryProjection([collection],[],[expense],[],[],'USD','2026-10-09').length,0);
});
