import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { invoicePaymentSummary, normalizePaymentRecord } from '../dist/src/lib/payments.js';
import { createCreditNoteDraft, assertDocumentLifecycleInvariant } from '../dist/src/lib/document-lifecycle.js';
import { receivablesByCurrency, customerStatement } from '../dist/src/lib/receivables.js';
import { calculateProfitability } from '../dist/src/lib/profitability.js';
import { financialReportByCurrency } from '../dist/src/lib/reports.js';
import { createSupplier, createPurchase, createPurchaseItem, postPurchase, reversePurchase, inventoryBalances, createExpense, spendByCurrency } from '../dist/src/lib/operations.js';

function customer(){return {id:'cust-e2e',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',companyNameEn:'E2E Customer',companyNameAr:'',contactPerson:'',addressEn:'Damascus',addressAr:'',city:'Damascus',country:'Syria',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',notes:'',preferredCurrency:'USD',paymentTermsPresetId:'',creditLimit:''};}
function savedItem(){return {id:'item-e2e',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',descriptionEn:'Test Product',descriptionAr:'',sku:'E2E-001',unit:'PCS',hsCode:'',origin:'',packing:'',defaultUnitPrice:'',currency:'USD',lastUnitCost:'',lastCostCurrency:'',notes:'',useCount:0,lastUsedAt:''};}
function invoice(){
  const c=customer();
  const doc=createBlankDocument('invoice','INV-2026-0001',defaultCompany(),{defaultCurrency:'USD',defaultLanguage:'en',defaultTemplate:'executive',defaultPaymentTerms:'',defaultIncoterm:'',defaultDeliveryTime:'',defaultValidityDays:7,defaultFooter:'',defaultNotes:'',autoLockMinutes:15,uiLanguage:'en'});
  doc.id='inv-e2e'; doc.issueDate='2026-01-10'; doc.dueDate='2026-01-20'; doc.status='final'; doc.lifecycleStatus='active'; doc.currency='USD';
  doc.customerSnapshot={sourceCustomerId:c.id,companyNameEn:c.companyNameEn,companyNameAr:'',contactPerson:'',addressEn:c.addressEn,addressAr:'',city:c.city,country:c.country,phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items=[{id:'line-1',descriptionEn:'Test Product',descriptionAr:'',hsCode:'',origin:'',packing:'',quantity:'10',unit:'PCS',unitPrice:'100.00',unitCost:'60.00'}];
  doc.adjustments={discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:true,shipping:'50.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:true,taxPercent:'10'};
  doc.internalCosts={shippingCost:'20.00',otherCost:'10.00'};
  return doc;
}

test('v145 full financial cycle ties sales, collections, AR, credit note and profitability',()=>{
  const inv=invoice();
  const p1=normalizePaymentRecord(inv,[],{id:'pay-1',invoiceId:inv.id,invoiceNumber:inv.number,customerId:'cust-e2e',customerNameEn:'E2E Customer',customerNameAr:'',currency:'USD',amount:'400.00',date:'2026-01-15',method:'bank-transfer',reference:'TRX-1',notes:'',createdAt:'',updatedAt:''},[]);
  let docs=[inv]; let pays=[p1];
  let summary=invoicePaymentSummary(inv,pays,'2026-01-25',docs);
  assert.equal(summary.total,'1155.00'); assert.equal(summary.paid,'400.00'); assert.equal(summary.remaining,'755.00'); assert.equal(summary.status,'overdue');
  const credit=createCreditNoteDraft(inv,'CN-2026-0001','155.00'); credit.id='cn-e2e'; credit.issueDate='2026-01-22'; credit.status='final'; credit.items[0].unitPrice='155.00'; docs=[inv,credit];
  assert.doesNotThrow(()=>assertDocumentLifecycleInvariant(credit,docs,pays));
  summary=invoicePaymentSummary(inv,pays,'2026-01-25',docs); assert.equal(summary.credits,'155.00'); assert.equal(summary.netTotal,'1000.00'); assert.equal(summary.remaining,'600.00');
  const p2=normalizePaymentRecord(inv,pays,{...p1,id:'pay-2',amount:'600.00',date:'2026-01-25',reference:'TRX-2',createdAt:'',updatedAt:''},docs); pays=[p1,p2];
  summary=invoicePaymentSummary(inv,pays,'2026-01-25',docs); assert.equal(summary.paid,'1000.00'); assert.equal(summary.remaining,'0.00'); assert.equal(summary.status,'paid');
  const ar=receivablesByCurrency(docs,pays,'2026-01-25'); assert.equal(ar[0].billed,'1155.00'); assert.equal(ar[0].credits,'155.00'); assert.equal(ar[0].paid,'1000.00'); assert.equal(ar[0].outstanding,'0.00'); assert.equal(ar[0].overdue,'0.00');
  const statement=customerStatement('cust-e2e',docs,pays,'2026-01-25')[0]; assert.equal(statement.entries.at(-1).balance,'0.00');
  const profit=calculateProfitability(inv); assert.equal(profit.netRevenue,'1050.00'); assert.equal(profit.totalCost,'630.00'); assert.equal(profit.grossProfit,'420.00'); assert.equal(profit.complete,true);
  const report=financialReportByCurrency(docs,pays,'2026-01-01','2026-01-31')[0]; assert.equal(report.invoiced,'1000.00'); assert.equal(report.collected,'1000.00'); assert.equal(report.outstanding,'0.00'); assert.equal(report.creditNotes,1); assert.equal(report.issuedInvoices,1);
});

test('v145 purchase posting, landed cost, inventory reversal and spend tie out',()=>{
  const item=savedItem(); const supplier={...createSupplier(),id:'supplier-e2e',nameEn:'E2E Supplier',defaultCurrency:'USD'}; let purchase=createPurchase([], [supplier], 'USD');
  purchase.id='purchase-e2e'; purchase.number='PUR-2026-0001'; purchase.date='2026-01-05'; const line={...createPurchaseItem(item),id:'purchase-line-e2e',quantity:'10',unitCost:'50.00'}; purchase={...purchase,items:[line],freight:'100.00',duty:'50.00',otherCosts:'0.00'};
  const posted=postPurchase(purchase,[item],[]); assert.equal(posted.purchase.status,'posted'); assert.equal(posted.purchase.items[0].landedUnitCost,'65.0000'); assert.equal(inventoryBalances(posted.savedItems,posted.movements)[0].quantity,'10');
  const expense={...createExpense('USD'),id:'expense-e2e',date:'2026-01-06',description:'Warehouse handling',amount:'25.00'}; const spend=spendByCurrency([posted.purchase],[expense])[0]; assert.equal(spend.purchases,'650.00'); assert.equal(spend.expenses,'25.00'); assert.equal(spend.total,'675.00');
  const reversed=reversePurchase(posted.purchase,'Supplier return',posted.movements,posted.savedItems); const movements=[...posted.movements,...reversed.movements]; assert.equal(inventoryBalances(reversed.savedItems,movements)[0].quantity,'0'); assert.equal(reversed.purchase.status,'reversed');
});
