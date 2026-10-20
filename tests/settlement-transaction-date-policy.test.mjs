import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {purchasePayableSummary,supplierPayablesByCurrency,supplierStatement} from '../dist/src/lib/payables.js';
import {createTreasuryEntry,treasuryProjection,treasuryAccountBalance} from '../dist/src/lib/treasury-ledger.js';

const entered='2026-10-20T12:00:00.000Z',cutoff='2026-10-10';
function fixture(){
  const invoice=createBlankDocument('invoice','INV-DATE-POLICY',defaultCompany());
  Object.assign(invoice,{id:'invoice-date-policy',status:'final',currency:'USD',
    issueDate:'2026-10-01',createdAt:'2026-10-01T09:00:00.000Z',
    customerSnapshot:{sourceCustomerId:'buyer-date-policy',companyNameEn:'Synthetic Buyer',companyNameAr:'',
      contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''}});
  invoice.items=[{...invoice.items[0],descriptionEn:'Service',quantity:'1',unitPrice:'1000.00'}];
  invoice.adjustments={...invoice.adjustments,discountEnabled:false,taxEnabled:false,shippingEnabled:false,otherChargesEnabled:false};
  const customer={id:'customer-payment-date-policy',invoiceId:invoice.id,invoiceNumber:invoice.number,
    customerId:'buyer-date-policy',customerNameEn:'Synthetic Buyer',customerNameAr:'',currency:'USD',
    amount:'200.00',date:'2026-10-05',method:'bank-transfer',reference:'C-200',notes:'',createdAt:entered,updatedAt:entered};
  const supplier={...createSupplier(),id:'supplier-date-policy',nameEn:'Synthetic Supplier'};
  const purchase=createPurchase([],[supplier],'USD');
  Object.assign(purchase,{id:'purchase-date-policy',number:'PUR-DATE-POLICY',status:'posted',
    date:'2026-10-01',postedAt:'2026-10-01T09:00:00.000Z',freight:'0.00',duty:'0.00',otherCosts:'0.00'});
  purchase.items=[{...createPurchaseItem(),descriptionEn:'Service',quantity:'1',unitCost:'1000.00'}];
  const payment={id:'supplier-payment-date-policy',purchaseId:purchase.id,purchaseNumber:purchase.number,
    supplierId:supplier.id,supplierNameEn:supplier.nameEn,supplierNameAr:'',currency:'USD',amount:'200.00',
    date:'2026-10-05',method:'bank-transfer',reference:'S-200',notes:'',createdAt:entered,updatedAt:entered};
  const allocation=(type,id,sourceType,sourceId,fromAccountId,toAccountId)=>({
    ...createTreasuryEntry(type,'USD'),id,workspaceId:'default',branchId:'main',
    date:'2026-10-05',amount:'200.00',sourceType,sourceId,fromAccountId,toAccountId,
    createdAt:entered,updatedAt:entered});
  const collection=allocation('collection','collection-date-policy','customer-payment',customer.id,'','bank');
  const outgoing=allocation('supplier-payment','outgoing-date-policy','supplier-payment',payment.id,'bank','');
  return{invoice,customer,supplier,purchase,payment,collection,outgoing};
}

test('late-entered receipts and supplier payments use the same transaction-date cutoff without rewriting audit fields',()=>{
  const f=fixture(),before=JSON.stringify(f);
  assert.equal(invoicePaymentSummary(f.invoice,[f.customer],cutoff,[f.invoice]).paid,'200.00');
  assert.equal(purchasePayableSummary(f.purchase,[f.payment],cutoff).paid,'200.00');
  assert.equal(purchasePayableSummary(f.purchase,[f.payment],cutoff).remaining,'800.00');
  assert.equal(supplierPayablesByCurrency([f.purchase],[f.payment],cutoff)[0].paid,'200.00');
  const statement=supplierStatement(f.supplier.id,[f.purchase],[f.payment],cutoff)[0];
  assert.equal(statement.entries.length,2);assert.equal(statement.remaining,'800.00');
  assert.equal(JSON.stringify(f),before);
});

test('treasury projection and bank balances include backdated cash once even when allocation was entered later',()=>{
  const f=fixture(),before=JSON.stringify(f);
  const unallocated=treasuryProjection([f.customer],[f.payment],[],[],[],'USD',cutoff);
  assert.equal(unallocated.length,2);
  const linked=treasuryProjection([f.customer],[f.payment],[],[f.collection,f.outgoing],[],'USD',cutoff);
  assert.equal(linked.length,2);
  assert.deepEqual(linked.map(row=>row.key).sort(),['treasury:collection-date-policy','treasury:outgoing-date-policy']);
  assert.equal(treasuryAccountBalance('bank',[f.collection],cutoff),'200.00');
  assert.equal(treasuryAccountBalance('bank',[f.outgoing],cutoff),'-200.00');
  assert.equal(treasuryAccountBalance('bank',[f.collection,f.outgoing],cutoff),'0.00');
  const reconcile={id:'late-date-policy-reconciliation',movementKey:'treasury:'+f.collection.id,
    action:'reconcile',reconciledAt:'2026-10-06T09:00:00.000Z',createdAt:entered,updatedAt:entered};
  assert.equal(treasuryProjection([f.customer],[],[],[f.collection],[reconcile],'USD',cutoff)[0].reconciled,false,
    'reconciliation audit events retain their recorded-time cutoff');
  assert.equal(JSON.stringify(f),before);
});

test('future-dated settlements remain excluded even when entered before the reporting date',()=>{
  const f=fixture(),future='2026-10-25',early='2026-10-02T09:00:00.000Z';
  const customer={...f.customer,date:future,createdAt:early};
  const payment={...f.payment,date:future,createdAt:early};
  const entry={...f.outgoing,date:future,createdAt:early};
  assert.equal(invoicePaymentSummary(f.invoice,[customer],cutoff,[f.invoice]).paid,'0.00');
  assert.equal(purchasePayableSummary(f.purchase,[payment],cutoff).paid,'0.00');
  assert.equal(treasuryProjection([customer],[payment],[],[entry],[],'USD',cutoff).length,0);
  assert.equal(treasuryAccountBalance('bank',[entry],cutoff),'0.00');
});

test('later cancellation preserves transaction-date history and removes the payment from cancellation day onward',()=>{
  const f=fixture(),voidedAt='2026-10-22T09:00:00.000Z';
  const payment={...f.payment,voidedAt,voidReason:'Synthetic correction',updatedAt:voidedAt};
  const entry={...f.outgoing,voidedAt,voidReason:'Synthetic correction',updatedAt:voidedAt};
  assert.equal(purchasePayableSummary(f.purchase,[payment],cutoff).paid,'200.00');
  assert.equal(treasuryProjection([],[payment],[],[entry],[],'USD',cutoff).length,1);
  assert.equal(treasuryAccountBalance('bank',[entry],cutoff),'-200.00');
  assert.equal(purchasePayableSummary(f.purchase,[payment],'2026-10-22').paid,'0.00');
  assert.equal(treasuryProjection([],[payment],[],[entry],[],'USD','2026-10-22').length,0);
  assert.equal(treasuryAccountBalance('bank',[entry],'2026-10-22'),'0.00');
});
