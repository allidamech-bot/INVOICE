import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {normalizeSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {customerPaymentVoucher,supplierPaymentVoucher} from '../dist/src/lib/payment-voucher.js';

const at='2026-10-10T10:00:00.000Z',date='2026-10-10';
function customer(){
  const invoice=createBlankDocument('invoice','INV-QA-001',defaultCompany());
  Object.assign(invoice,{id:'invoice-qa',kind:'invoice',role:'standard',status:'final',lifecycleStatus:'active',issueDate:'2026-10-01',currency:'USD',workspaceId:'company-a',branchId:'north'});
  invoice.companySnapshot.nameEn='LOUREX Trading at issue';
  invoice.customerSnapshot={sourceCustomerId:'customer-1',companyNameEn:'Synthetic Customer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],quantity:'1',unitPrice:'100.00'}];
  invoice.adjustments={...invoice.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  const payment={id:'receipt-pay-1',invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:'customer-1',customerNameEn:'Synthetic Customer',customerNameAr:'',workspaceId:'company-a',branchId:'north',currency:'USD',amount:'25.00',date,method:'bank-transfer',reference:'TRX-55',notes:'Part payment',createdAt:at,updatedAt:at};
  return {invoice,payment};
}
function supplier(){
  const company=defaultCompany(),s={...createSupplier(),id:'supplier-1',nameEn:'Synthetic Supplier'},purchase=createPurchase([],[s],'USD');
  Object.assign(purchase,{id:'purchase-qa',number:'PUR-QA-001',status:'posted',date:'2026-10-01',postedAt:'2026-10-02T00:00:00.000Z',workspaceId:'company-b',branchId:'south'});
  purchase.items=[{...createPurchaseItem(),descriptionEn:'Service',quantity:'1',unitCost:'90.00'}];
  const payment={id:'supplier-pay-1',purchaseId:purchase.id,purchaseNumber:purchase.number,supplierId:s.id,supplierNameEn:s.nameEn,supplierNameAr:'',workspaceId:'company-b',branchId:'south',currency:'USD',amount:'20.00',date,method:'cash',reference:'CASH-22',notes:'First payment',createdAt:at,updatedAt:at};
  return{company,s,purchase,payment};
}
test('customer voucher is produced only from one persisted invoice payment, with exact frozen issuer identity',()=>{
  const {invoice,payment}=customer(),snapshot=JSON.stringify({invoice,payment});
  const voucher=customerPaymentVoucher(invoice,payment.id,[payment]);
  assert.equal(voucher.kind,'customer-receipt');assert.equal(voucher.amount,'25.00');assert.equal(voucher.currency,'USD');
  assert.equal(voucher.date,date);assert.equal(voucher.paymentReference,'TRX-55');assert.equal(voucher.sourceNumber,'INV-QA-001');
  assert.equal(voucher.sourceId,invoice.id);assert.equal(voucher.recordId,payment.id);
  assert.equal(voucher.companyNameEn,'LOUREX Trading at issue');
  assert.equal(invoicePaymentSummary(invoice,[payment],date,[invoice]).paid,'25.00');
  assert.equal(JSON.stringify({invoice,payment}),snapshot,'rendering a voucher must be pure');
  assert.throws(()=>customerPaymentVoucher(invoice,'missing',[payment]),/persisted/);
  assert.throws(()=>customerPaymentVoucher(invoice,payment.id,[payment,payment]),/one persisted/);
  assert.throws(()=>customerPaymentVoucher(invoice,payment.id,[{...payment,invoiceId:'other'}]),/does not belong/);
  assert.throws(()=>customerPaymentVoucher(invoice,payment.id,[{...payment,currency:'EUR'}]),/does not belong/);
  assert.throws(()=>customerPaymentVoucher(invoice,payment.id,[{...payment,workspaceId:'company-b'}]),/does not belong/);
  assert.throws(()=>customerPaymentVoucher(invoice,payment.id,[{...payment,branchId:'south'}]),/does not belong/);
  assert.throws(()=>customerPaymentVoucher({...invoice,status:'draft'},payment.id,[payment]),/issued/);
  assert.throws(()=>customerPaymentVoucher({...invoice,lifecycleStatus:'voided'},payment.id,[payment]),/issued/);
});
test('supplier voucher is a separate real payment linked to its posted purchase, not the statement',()=>{
  const f=supplier(),before=JSON.stringify(f),normalized=normalizeSupplierPayment(f.purchase,f.s,[f.payment],f.payment,'stored-record');
  assert.equal(normalized.amount,'20.00');
  const voucher=supplierPaymentVoucher(f.purchase,f.payment.id,[f.payment],f.company);
  assert.equal(voucher.kind,'supplier-disbursement');assert.equal(voucher.amount,'20.00');
  assert.equal(voucher.sourceNumber,f.purchase.number);assert.equal(voucher.recordId,f.payment.id);
  assert.equal(voucher.currency,'USD');assert.equal(voucher.date,date);assert.equal(voucher.partyNameEn,'Synthetic Supplier');
  assert.equal(purchasePayableSummary(f.purchase,[f.payment],date).paid,'20.00');
  assert.equal(JSON.stringify(f),before);
  assert.throws(()=>supplierPaymentVoucher(f.purchase,f.payment.id,[f.payment,f.payment],f.company),/one persisted/);
  assert.throws(()=>supplierPaymentVoucher(f.purchase,f.payment.id,[{...f.payment,voidedAt:at}],f.company),/active linked/);
  assert.throws(()=>supplierPaymentVoucher({...f.purchase,status:'draft'},f.payment.id,[f.payment],f.company),/active linked/);
  assert.throws(()=>supplierPaymentVoucher(f.purchase,f.payment.id,[{...f.payment,purchaseId:'other'}],f.company),/purchase link/);
  assert.throws(()=>supplierPaymentVoucher(f.purchase,f.payment.id,[{...f.payment,supplierId:'other'}],f.company),/supplier does not match/);
  assert.throws(()=>supplierPaymentVoucher(f.purchase,f.payment.id,[{...f.payment,currency:'EUR'}],f.company),/currency/);
  assert.throws(()=>supplierPaymentVoucher(f.purchase,f.payment.id,[{...f.payment,workspaceId:'other'}],f.company),/active linked/);
  assert.throws(()=>supplierPaymentVoucher(f.purchase,f.payment.id,[{...f.payment,amount:'0'}],f.company),/active linked/);
});
test('voucher entry points select recorded IDs and suppress invalid or voided records',async()=>{
  const invoice=await readFile('src/components/InvoicePaymentsPanel.tsx','utf8');
  const supplier=await readFile('src/components/SupplierPayablesPage.tsx','utf8');
  const voucher=await readFile('src/components/PaymentVoucherModal.tsx','utf8');
  const css=await readFile('src/styles/payables-batch9.css','utf8');
  assert.match(invoice,/accountedIds\.has\(payment\.id\)/);
  assert.match(invoice,/customerPaymentVoucher\(this\.props\.document,paymentId,this\.props\.payments\)/);
  assert.match(supplier,/supplierPaymentVoucher\(purchase,paymentId,this\.props\.supplierPayments,this\.props\.company\)/);
  assert.match(supplier,/payment\.voidedAt\?<span>/);
  assert.match(voucher,/data-payment-voucher/);assert.match(voucher,/data-voucher-amount/);
  assert.match(voucher,/window\.print\(\)/);
  assert.match(css,/body\.printing-payment-voucher/);
  assert.match(css,/app-ui>:not\(\.modal-backdrop\)/);
});

test('voucher scope uses canonical legacy default/main, never a missing-field wildcard',()=>{
  for(const fields of [['workspaceId'],['branchId'],['workspaceId','branchId']]){
    for(const side of ['source','payment','both']){
      const {invoice,payment}=customer(),f=supplier();
      for(const key of fields){
        if(side!=='payment'){delete invoice[key];delete f.purchase[key];}
        if(side!=='source'){delete payment[key];delete f.payment[key];}
      }
      // Both omitted means the same legacy default scope; one omitted must
      // never match the fixture's explicit non-default company or branch.
      if(side==='both'){
        assert.equal(customerPaymentVoucher(invoice,payment.id,[payment]).amount,'25.00');
        assert.equal(supplierPaymentVoucher(f.purchase,f.payment.id,[f.payment],f.company).amount,'20.00');
      }else{
        assert.throws(()=>customerPaymentVoucher(invoice,payment.id,[payment]),/does not belong/);
        assert.throws(()=>supplierPaymentVoucher(f.purchase,f.payment.id,[f.payment],f.company),/active linked/);
      }
    }
  }
  const {invoice,payment}=customer(),f=supplier();
  Object.assign(invoice,{workspaceId:'default',branchId:'main'});
  Object.assign(f.purchase,{workspaceId:'default',branchId:'main'});
  for(const p of [payment,f.payment]){delete p.workspaceId;delete p.branchId;}
  assert.equal(customerPaymentVoucher(invoice,payment.id,[payment]).amount,'25.00');
  assert.equal(supplierPaymentVoucher(f.purchase,f.payment.id,[f.payment],f.company).amount,'20.00');
});
