import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

function customer(id='customer-1'){
  return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-10-01T08:00:00.000Z',companyNameEn:'Acme Trading',companyNameAr:'أكمي للتجارة',contactPerson:'Ali',addressEn:'',addressAr:'',city:'Jeddah',country:'Saudi Arabia',phone:'+966500000000',email:'buyer@example.com',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'USD',paymentTermPresetId:'',paymentTerms:'30 days',paymentDueDays:'30',creditLimit:'',creditCurrency:'',notes:''};
}
function supplier(id='supplier-1'){
  return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-10-01T07:00:00.000Z',nameEn:'Source Co',nameAr:'شركة المصدر',contactPerson:'Sara',address:'',city:'Istanbul',country:'Türkiye',phone:'',email:'source@example.com',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'USD',paymentTerms:'30 days',notes:''};
}
function supplierSnapshot(source){return {sourceSupplierId:source.id,nameEn:source.nameEn,nameAr:source.nameAr,contactPerson:source.contactPerson,address:source.address,city:source.city,country:source.country,phone:source.phone,email:source.email,vatTaxNumber:source.vatTaxNumber,commercialRegistration:source.commercialRegistration};}
function purchase({id,number,currency,date,source,itemId='item-1',cost='10',quantity='2',status='posted'}){
  return {id,number,date,dueDate:date,supplierSnapshot:supplierSnapshot(source),currency,items:[{id:`line-${id}`,savedItemId:itemId,sku:'SKU-1',descriptionEn:'Product One',descriptionAr:'المنتج الأول',quantity,unit:'PCS',unitCost:cost,landedUnitCost:cost,previousUnitCost:'',previousCostCurrency:''}],freight:'0',duty:'0',otherCosts:'0',notes:'',status,postedAt:status==='posted'?`${date}T12:00:00.000Z`:'',reversedAt:'',reverseReason:'',createdAt:`${date}T09:00:00.000Z`,updatedAt:`${date}T12:00:00.000Z`};
}

test('Batch 2 Relationship 360 is derived-first and does not introduce a persistence silo',async()=>{
  const source=await read('src/lib/relationship-360.ts');
  assert.match(source,/buildCustomer360/);
  assert.match(source,/buildSupplier360/);
  assert.match(source,/receivablesByCurrency/);
  assert.match(source,/purchaseAccountingIsValid/);
  assert.match(source,/purchaseTotals/);
  assert.doesNotMatch(source,/schemaVersion|mutateVaultSafely|saveVault|localStorage|sessionStorage/);
  assert.doesNotMatch(source,/PaymentRecord.*supplier|SupplierPaymentRecord/);
});

test('Customer 360 derives documents, payments, receivables and activity without mixing currencies',async()=>{
  const { defaultCompany, customerSnapshotFrom }=await import('../dist/src/lib/defaults.js');
  const { createBlankDocument }=await import('../dist/src/lib/documents.js');
  const { buildCustomer360 }=await import('../dist/src/lib/relationship-360.js');
  const c=customer();const company=defaultCompany();
  const quote=createBlankDocument('proforma','QUO-2026-001',company);quote.customerSnapshot=customerSnapshotFrom(c);quote.status='final';quote.issueDate='2026-09-10';quote.dueDate='2026-10-10';quote.updatedAt='2026-09-10T10:00:00.000Z';quote.items=[{id:'q-line',descriptionEn:'Product One',descriptionAr:'المنتج الأول',hsCode:'',origin:'',packing:'',quantity:'1',unit:'PCS',unitPrice:'25',unitCost:'10'}];
  const invoice=createBlankDocument('invoice','INV-2026-001',company);invoice.customerSnapshot=customerSnapshotFrom(c);invoice.status='final';invoice.issueDate='2026-09-20';invoice.dueDate='2026-10-20';invoice.updatedAt='2026-09-20T10:00:00.000Z';invoice.items=[{id:'i-line',descriptionEn:'Product One',descriptionAr:'المنتج الأول',hsCode:'',origin:'',packing:'',quantity:'2',unit:'PCS',unitPrice:'25',unitCost:'10'}];
  const eurInvoice=createBlankDocument('invoice','INV-2026-002',company);eurInvoice.customerSnapshot=customerSnapshotFrom(c);eurInvoice.status='final';eurInvoice.currency='EUR';eurInvoice.issueDate='2026-09-21';eurInvoice.dueDate='2026-10-21';eurInvoice.updatedAt='2026-09-21T10:00:00.000Z';eurInvoice.items=[{id:'e-line',descriptionEn:'Second Product',descriptionAr:'منتج ثان',hsCode:'',origin:'',packing:'',quantity:'1',unit:'PCS',unitPrice:'40',unitCost:'20'}];
  const payment={id:'pay-1',invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:c.id,customerNameEn:c.companyNameEn,customerNameAr:c.companyNameAr,currency:'USD',amount:'10',date:'2026-09-25',method:'bank-transfer',reference:'BANK-1',notes:'',createdAt:'2026-09-25T10:00:00.000Z',updatedAt:'2026-09-25T10:00:00.000Z'};
  const event={id:'event-1',documentId:invoice.id,documentNumber:invoice.number,type:'issued',at:'2026-09-20T11:00:00.000Z',note:'',relatedDocumentId:'',relatedDocumentNumber:'',amount:'',currency:''};
  const result=buildCustomer360(c,[quote,invoice,eurInvoice],[payment],[event]);
  assert.equal(result.documentCount,3);
  assert.equal(result.quotationCount,1);
  assert.equal(result.invoiceCount,2);
  assert.equal(result.paymentCount,1);
  assert.deepEqual(result.financialPosition.map(row=>row.currency),['EUR','USD']);
  assert.equal(result.productMentions[0].label,'Product One');
  assert.equal(result.productMentions[0].appearances,2);
  assert.ok(result.recentActivity.some(row=>row.kind==='payment'&&row.reference==='BANK-1'));
});

test('Supplier 360 derives valid posted spend by currency and keeps drafts/reversals descriptive',async()=>{
  const { buildSupplier360 }=await import('../dist/src/lib/relationship-360.js');
  const s=supplier();
  const usd=purchase({id:'p-usd',number:'PUR-USD',currency:'USD',date:'2026-09-01',source:s,cost:'10',quantity:'2'});
  const eur=purchase({id:'p-eur',number:'PUR-EUR',currency:'EUR',date:'2026-09-02',source:s,cost:'5',quantity:'3'});
  const draft=purchase({id:'p-draft',number:'PUR-DRAFT',currency:'USD',date:'2026-09-03',source:s,status:'draft'});
  const reversed=purchase({id:'p-reversed',number:'PUR-REV',currency:'USD',date:'2026-09-04',source:s,status:'reversed'});
  const expense={id:'exp-1',date:'2026-09-05',category:'Freight',description:'Courier',amount:'50',currency:'USD',supplierId:s.id,reference:'EXP-1',notes:'',createdAt:'2026-09-05T10:00:00.000Z',updatedAt:'2026-09-05T10:00:00.000Z'};
  const item={id:'item-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:'SKU-1',descriptionEn:'Product One',descriptionAr:'المنتج الأول',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:'10',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z'};
  const result=buildSupplier360(s,[usd,eur,draft,reversed],[expense],[item]);
  assert.equal(result.purchaseCount,4);
  assert.equal(result.postedPurchaseCount,2);
  assert.equal(result.draftPurchaseCount,1);
  assert.equal(result.reversedPurchaseCount,1);
  assert.equal(result.linkedExpenseCount,1);
  assert.deepEqual(result.spendByCurrency.map(row=>[row.currency,row.landedSpend]),[['EUR','15.00'],['USD','20.00']]);
  assert.equal(result.products[0].savedItemId,'item-1');
  assert.equal(result.products[0].purchaseCount,2);
  assert.ok(result.recentActivity.some(row=>row.kind==='expense'&&row.reference==='EXP-1'));
});

test('Customer 360 lives inside the canonical customer profile and reads the encrypted vault without mutation',async()=>{
  const [customers,live,styleLoader,index]=await Promise.all([
    read('src/components/CustomersPage.tsx'),read('src/components/Customer360LivePanel.tsx'),read('src/lib/relationship-360-style.ts'),read('index.html')
  ]);
  assert.match(customers,/Customer360LivePanel/);
  assert.match(customers,/<Customer360LivePanel customer=\{customer\}\/>/);
  assert.match(live,/resumeVaultSession/);
  assert.match(live,/buildCustomer360/);
  assert.match(live,/ensureRelationship360Styles/);
  assert.doesNotMatch(live,/mutateVaultSafely|saveVault/);
  assert.doesNotMatch(styleLoader,/createElement\(['"]link['"]\)|relationship-360-batch2\.css/);
  assert.match(index,/relationship-360-batch2\.css\?v=454-1/);
});

test('Supplier 360 stays inside Purchasing > Suppliers while AP context remains routed to Finance',async()=>{
  const [operations,supplierLive]=await Promise.all([read('src/components/OperationsPage.tsx'),read('src/components/Supplier360LivePanel.tsx')]);
  assert.match(operations,/Supplier360LivePanel/);
  assert.match(operations,/supplierProfileId:string/);
  assert.match(operations,/openSupplierProfile/);
  assert.match(operations,/View 360/);
  assert.match(operations,/<Supplier360LivePanel supplier=\{supplier\}\/>/);
  assert.match(operations,/newPurchaseForSupplier\(supplier\)/);
  assert.match(operations,/showSupplierPurchaseHistory/);
  assert.match(operations,/renderSupplierEditor/);
  assert.match(operations,/onPostPurchase/);
  assert.match(operations,/purchaseTotals/);
  assert.match(operations,/SupplierPaymentRecord/);
  assert.match(operations,/onOpenSupplierFinance/);
  assert.doesNotMatch(supplierLive,/SupplierPaymentRecord|supplierPayablesByCurrency|purchasePayableSummary|\.\/payables\.js/);
});

test('Relationship 360 presentation is mobile-first, RTL-aware and does not impersonate supplier payables',async()=>{
  const [panels,css,supplierLive]=await Promise.all([
    read('src/components/Relationship360Panels.tsx'),read('src/styles/relationship-360-batch2.css'),read('src/components/Supplier360LivePanel.tsx')
  ]);
  assert.match(panels,/Not Accounts Payable/);
  assert.match(panels,/Receivables by currency/);
  assert.match(panels,/Posted spend by currency/);
  assert.match(css,/@media \(max-width:900px\)/);
  assert.match(css,/@media \(max-width:390px\)/);
  assert.match(css,/\[dir="rtl"\]/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/lx-supplier-profile-facts/);
  assert.match(supplierLive,/buildSupplier360/);
  assert.match(supplierLive,/resumeVaultSession/);
  assert.doesNotMatch(supplierLive,/mutateVaultSafely|saveVault/);
});
