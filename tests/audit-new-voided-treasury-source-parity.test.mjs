import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance,treasuryProjection} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
 const invoice=createBlankDocument('invoice','INV-VOID-LINK-1',defaultCompany());
 invoice.status='final';invoice.lifecycleStatus='active';invoice.role='standard';
 invoice.issueDate='2026-09-01';invoice.dueDate='2026-12-01';invoice.currency='USD';
 invoice.customerSnapshot={sourceCustomerId:'buyer-void-link',companyNameEn:'Cash Ledger Buyer',
   companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
   phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 invoice.items[0].descriptionEn='Commercial service';invoice.items[0].quantity='1';
 invoice.items[0].unitPrice='100.00';
 const payment={id:'receipt-void-link',invoiceId:invoice.id,invoiceNumber:invoice.number,
   customerId:'buyer-void-link',customerNameEn:'Cash Ledger Buyer',customerNameAr:'',
   currency:'USD',amount:'100.00',date:'2026-09-02',method:'bank-transfer',
   reference:'BANK-100',notes:'',createdAt:'2026-09-02T10:00:00.000Z',
   updatedAt:'2026-09-02T10:00:00.000Z',workspaceId:'default',branchId:'main'};
 const bank={...createTreasuryAccount({label:'Customer Receipts Bank',kind:'bank',
   currency:'USD',workspaceId:'default',branchId:'main'}),id:'bank-void-link'};
 const base={...emptyVault(),documents:[invoice],payments:[payment],treasuryAccounts:[bank]};
 const active={...createTreasuryEntry('collection','USD'),id:'treasury-void-link',
   workspaceId:'default',branchId:'main',date:'2026-09-02',amount:'100.00',
   toAccountId:bank.id,sourceType:'customer-payment',sourceId:payment.id,
   createdAt:'2026-09-02T11:00:00.000Z',updatedAt:'2026-09-02T11:00:00.000Z'};
 const voided={...active,voidedAt:'2026-09-10T11:00:00.000Z',
   voidReason:'Correction after bank review',updatedAt:'2026-09-10T11:00:00.000Z'};
 return{base,bank,payment,active,voided};
}
const unrelated=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('local newly voided cash allocation cannot forge the earlier customer receipt amount',()=>{
 const {base,voided}=fixture(),before=JSON.stringify(base);
 assert.throws(()=>mergeVaultIntent(base,{...base,treasuryEntries:[{...voided,amount:'40.00'}]},base),
   /voided treasury.*payment|payment amount|linked payment/i);
 assert.equal(JSON.stringify(base),before);
});

test('remote voided linked entry cannot invent a customer receipt during unrelated local save',()=>{
 const {base,voided}=fixture(),before=JSON.stringify(base);
 assert.throws(()=>mergeVaultIntent(base,unrelated(base),{...base,treasuryEntries:[
   {...voided,sourceId:'missing-receipt'}]}),
   /voided treasury.*payment|linked payment/i);
 assert.equal(JSON.stringify(base),before);
});

test('a newly synchronized voided customer allocation retains its real historical bank position',()=>{
 const {base,bank,payment,voided}=fixture();
 const merged=mergeVaultIntent(base,unrelated(base),{...base,treasuryEntries:[voided]});
 assert.equal(merged.treasuryEntries.length,1);
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries,'2026-09-05'),'100.00');
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries,'2026-09-11'),'0.00');
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'0.00');
 const before=treasuryProjection([payment],[],[],merged.treasuryEntries,[],'USD','2026-09-05');
 const after=treasuryProjection([payment],[],[],merged.treasuryEntries,[],'USD','2026-09-11');
 assert.equal(before.filter(x=>x.source==='collection').length,1);
 assert.equal(after.filter(x=>x.source==='collection').length,1);
});

test('voided customer allocation permits a later independently validated replacement without double-counting',()=>{
 const {base,bank,active,voided}=fixture();
 const first=mergeVaultIntent(base,{...base,treasuryEntries:[voided]},base);
 const corrected={...active,id:'replacement-posted-collection',createdAt:'2026-09-11T11:00:00.000Z',
   updatedAt:'2026-09-11T11:00:00.000Z',date:'2026-09-11'};
 const second=mergeVaultIntent(first,{...first,treasuryEntries:[...first.treasuryEntries,corrected]},first);
 assert.equal(treasuryAccountBalance(bank.id,second.treasuryEntries),'100.00');
 assert.equal(second.treasuryEntries.length,2);
});

test('unchanged historical voided cash allocations remain byte-for-byte readable',()=>{
 const {base,voided}=fixture();
 const historical={...base,treasuryEntries:[{...voided,id:'legacy-voided-link',amount:'30.00'}]};
 const snapshot=JSON.stringify(historical);
 const accepted=mergeVaultIntent(historical,unrelated(historical),structuredClone(historical));
 assert.equal(accepted.treasuryEntries[0].amount,'30.00');
 assert.equal(JSON.stringify(historical),snapshot);
});


test('newly voided customer bank event may not predate its receipt even after cancellation and remote sync',()=>{
 const {base,voided}=fixture(),before=JSON.stringify(base);
 const changed={...voided,date:'2026-09-01'};
 assert.throws(()=>mergeVaultIntent(base,{...base,treasuryEntries:[changed]},base),
  /Voided treasury allocation date cannot precede/);
 assert.throws(()=>mergeVaultIntent(base,unrelated(base),{...base,treasuryEntries:[changed]}),
  /Voided treasury allocation date cannot precede/);
 assert.equal(JSON.stringify(base),before);
});

test('newly voided supplier bank event may not predate its supplier payment on either sync side',()=>{
 const {base,bank}=fixture();
 const supplier={...createSupplier(),id:'supplier-void-date',nameEn:'QA supplier'};
 const purchase=createPurchase([],[supplier],'USD');
 Object.assign(purchase,{id:'purchase-void-date',number:'PUR-VOID-DATE',status:'posted',
  workspaceId:'default',branchId:'main',date:'2026-09-01',dueDate:'2026-09-30',
  freight:'0.00',duty:'0.00',otherCosts:'0.00'});
 purchase.items=[{...createPurchaseItem(),id:'void-date-line',
  quantity:'1',unitCost:'100.00',descriptionEn:'QA'}];
 const supplierPayment={
  id:'supplier-payment-void-date',purchaseId:purchase.id,purchaseNumber:purchase.number,
  supplierId:supplier.id,supplierNameEn:supplier.nameEn,supplierNameAr:'',
  workspaceId:'default',branchId:'main',currency:'USD',amount:'100.00',
  date:'2026-09-03',method:'bank-transfer',reference:'QA-VOID',
  notes:'',createdAt:'2026-09-03T10:00:00.000Z',
  updatedAt:'2026-09-03T10:00:00.000Z',voidedAt:'',voidReason:''
 };
 const sources={...base,suppliers:[supplier],purchases:[purchase],
  supplierPayments:[supplierPayment]};
 const entry={...createTreasuryEntry('supplier-payment','USD'),
  id:'treasury-supplier-void-date',workspaceId:'default',branchId:'main',
  date:'2026-09-02',amount:'100.00',fromAccountId:bank.id,
  sourceType:'supplier-payment',sourceId:supplierPayment.id,
  createdAt:'2026-09-04T10:00:00.000Z',
  updatedAt:'2026-09-10T10:00:00.000Z',
  voidedAt:'2026-09-10T10:00:00.000Z',voidReason:'QA correction'
 };
 const unchanged=JSON.stringify(sources);
 assert.throws(()=>mergeVaultIntent(sources,{...sources,treasuryEntries:[entry]},sources),
  /Voided treasury allocation date cannot precede/);
 assert.throws(()=>mergeVaultIntent(sources,unrelated(sources),{...sources,treasuryEntries:[entry]}),
  /Voided treasury allocation date cannot precede/);
 assert.equal(JSON.stringify(sources),unchanged);
 // A valid history dated the same day as the original payment is preserved
 // as an immutable as-of bank event, even after a later cancellation.
 const allowed={...entry,date:supplierPayment.date};
 const merged=mergeVaultIntent(sources,unrelated(sources),{...sources,treasuryEntries:[allowed]});
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries,'2026-09-05'),'-100.00');
 assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries,'2026-09-11'),'0.00');
});
