import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {createLinkedDeliveryDraft} from '../dist/src/lib/delivery-flow.js';
import {confirmSalesDelivery} from '../dist/src/lib/sales-delivery-flow.js';
import {postSalesDeliveryStock,assertSalesDeliveryStockIntegrity} from '../dist/src/lib/sales-delivery-stock.js';
import {createConfirmedDeliveryInvoiceDraft,assertDeliveryInvoiceIntegrity} from '../dist/src/lib/sales-delivery-invoice.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {warehouseItemQuantity,defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {financialReportByCurrency} from '../dist/src/lib/reports.js';
import {buildAiFinanceContext} from '../dist/src/lib/ai-finance.js';
import {todayIso} from '../dist/src/lib/id.js';

function setup(){
  const v=emptyVault(),now=new Date().toISOString();
  const customer={id:'b09-buyer',companyNameEn:'Riyadh FMCG Buyer',companyNameAr:'مشتري الرياض',
    contactPerson:'Buyer',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
  v.customers=[customer];
  const make=(id,sku,name)=>({id,sku,createdAt:now,updatedAt:now,
    descriptionEn:name,descriptionAr:name,hsCode:'',origin:'',packing:'',unit:'Carton',
    lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',
    usageCount:0,lastUsedAt:'',workspaceId:'default',branchId:'main'});
  v.savedItems=[make('b09-cookies','B09-COOKIE','Cookies'),make('b09-candy','B09-CANDY','Candy')];
  v.suppliers=[{...createSupplier(),nameEn:'Supplier',nameAr:'المورد',defaultCurrency:'USD'}];
  const purchase=createPurchase([],v.suppliers);
  purchase.items=[
    {...createPurchaseItem(v.savedItems[0]),quantity:'10',unitCost:'2.00'},
    {...createPurchaseItem(v.savedItems[1]),quantity:'6',unitCost:'3.00'}
  ];
  const posted=postPurchase(purchase,v.savedItems);
  v.purchases=[posted.purchase];
  v.inventoryMovements=posted.movements;
  v.savedItems=posted.savedItems;
  const quote=createBlankDocument('proforma','QUO-B09-BRIDGE',v.company);
  quote.status='final';
  quote.currency='USD';
  quote.customerSnapshot=customerSnapshotFrom(customer);
  quote.adjustments={...quote.adjustments,discountEnabled:false,shippingEnabled:false,
    otherChargesEnabled:false,taxEnabled:false};
  quote.items=[
    {...quote.items[0],id:'b09-cookie-line',descriptionEn:'Cookies',descriptionAr:'كوكيز',
      unit:'Carton',quantity:'8',unitPrice:'10.00',unitCost:'2.00'},
    {...quote.items[0],id:'b09-candy-line',descriptionEn:'Candy',descriptionAr:'حلوى',
      unit:'Carton',quantity:'5',unitPrice:'20.00',unitCost:'3.00'}
  ];
  assert.deepEqual(validateDocument(quote),{});
  v.documents=[quote];
  v.documentEvents.push(validatedCommercialTrackingEvent(v,quote.id,'accepted'));
  const accepted=acceptSalesOrder(v,{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
    customerReference:'CUSTOMER-PO-B09',orderDate:todayIso(),requestedDeliveryDate:todayIso()});
  const draft=createLinkedDeliveryDraft(accepted.vault,quote.id);
  const note={...draft.document,status:'final',items:draft.document.items.map((item,i)=>({
    ...item,quantity:i===0?'4':'2'
  }))};
  assert.deepEqual(validateDocument(note),{});
  const issued={...draft.vault,documents:draft.vault.documents.map(doc=>doc.id===note.id?note:doc)};
  const confirmed=confirmSalesDelivery(issued,{deliveryNoteId:note.id,
    expectedDeliveryNoteUpdatedAt:note.updatedAt,deliveredDate:todayIso(),
    reference:'POD-B09',confirmed:true}).vault;
  const warehouseId=defaultWarehouseId(confirmed.appSettings.activeBranchId);
  const input={deliveryNoteId:note.id,expectedDeliveryNoteUpdatedAt:note.updatedAt,
    warehouseId,savedItemIds:['b09-cookies','b09-candy'],confirmed:true};
  return{confirmed,note,input,warehouseId,customer};
}
function quantity(vault,id,warehouseId){
  return warehouseItemQuantity(id,warehouseId,vault.inventoryMovements,warehouseId);
}
function report(vault){
  return financialReportByCurrency(vault.documents,vault.payments,todayIso(),todayIso())
    .find(row=>row.currency==='USD');
}
function context(vault){
  return buildAiFinanceContext({documents:vault.documents,payments:vault.payments,
    customers:vault.customers,activeDocument:null},'financial health',todayIso())
    .today.find(row=>row.currency==='USD');
}

test('B09 end-to-end: draft never books revenue; final partial invoice books once and stock issues once',()=>{
  const {confirmed,note,input,warehouseId}=setup();
  const stockPosted=postSalesDeliveryStock(confirmed,input);
  assert.equal(stockPosted.created,true);
  const issued=stockPosted.vault;
  assert.equal(quantity(issued,'b09-cookies',warehouseId),60000n);
  assert.equal(quantity(issued,'b09-candy',warehouseId),40000n);
  const prepared=createConfirmedDeliveryInvoiceDraft(issued,note.id);
  assert.equal(prepared.created,true);
  assert.equal(prepared.invoice.status,'draft');
  assert.equal(report(prepared.vault),undefined,'draft, quotation and delivery must not book revenue');
  assert.equal(context(prepared.vault),undefined,'AI must not infer draft revenue');
  const again=createConfirmedDeliveryInvoiceDraft(prepared.vault,note.id);
  assert.equal(again.created,false);
  assert.equal(again.invoice.id,prepared.invoice.id);
  assert.equal(again.vault.documentEvents.length,prepared.vault.documentEvents.length);
  const finalized={...prepared.invoice,status:'final'};
  const finalVault={...prepared.vault,documents:prepared.vault.documents.map(doc=>
    doc.id===finalized.id?finalized:doc)};
  assert.doesNotThrow(()=>assertDeliveryInvoiceIntegrity(finalVault.documents,finalVault.documentEvents));
  assert.doesNotThrow(()=>assertSalesDeliveryStockIntegrity(finalVault));
  const financial=report(finalVault);
  assert.equal(financial.issuedInvoices,1);
  assert.equal(financial.netSales,'80.00');
  assert.equal(financial.collected,'0.00');
  assert.equal(financial.outstanding,'80.00');
  assert.equal(financial.grossProfit,'66.00');
  assert.equal(financial.profitComplete,true);
  assert.equal(context(finalVault).netSales,'80.00');
  assert.equal(context(finalVault).grossProfit,'66.00');
  assert.equal(postSalesDeliveryStock(finalVault,input).created,false);
  assert.equal(quantity(finalVault,'b09-cookies',warehouseId),60000n);
});

test('B09 duplicate SKU mapping: one catalog item cannot silently fulfill two different delivery lines',()=>{
  const {confirmed,input}=setup();
  const baseline=structuredClone(confirmed.inventoryMovements);
  const mappedToSameSku={...input,savedItemIds:['b09-cookies','b09-cookies']};
  assert.throws(()=>postSalesDeliveryStock(confirmed,mappedToSameSku),/distinct catalog item/);
  assert.deepEqual(confirmed.inventoryMovements,baseline,'rejected mappings cannot issue stock');
  const accepted=postSalesDeliveryStock(confirmed,input);
  assert.equal(accepted.created,true,'valid explicit distinct mappings still work');
  assert.equal(accepted.vault.inventoryMovements.filter(m=>m.type==='issue').length,2);
});

test('B09 collection: partial bank payment updates reports and AI without changing stock or duplicating sales',()=>{
  const {confirmed,note,input,warehouseId,customer}=setup();
  const stocked=postSalesDeliveryStock(confirmed,input).vault;
  const prepared=createConfirmedDeliveryInvoiceDraft(stocked,note.id);
  const invoice={...prepared.invoice,status:'final'};
  const docs=prepared.vault.documents.map(doc=>doc.id===invoice.id?invoice:doc);
  const before={...prepared.vault,documents:docs};
  const payment=normalizePaymentRecord(invoice,[],{
    id:'b09-partial-bank',invoiceId:invoice.id,invoiceNumber:invoice.number,
    customerId:customer.id,customerNameEn:customer.companyNameEn,customerNameAr:'',
    currency:'USD',amount:'30.00',date:todayIso(),method:'bank-transfer',
    reference:'BANK-B09',notes:'',createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  },docs);
  const settled={...before,payments:[payment]};
  assert.equal(invoicePaymentSummary(invoice,settled.payments,todayIso(),docs).status,'partially-paid');
  assert.equal(invoicePaymentSummary(invoice,settled.payments,todayIso(),docs).remaining,'50.00');
  const financial=report(settled),ai=context(settled);
  assert.equal(financial.issuedInvoices,1);
  assert.equal(financial.netSales,'80.00');
  assert.equal(financial.collected,'30.00');
  assert.equal(financial.outstanding,'50.00');
  assert.equal(ai.netSales,financial.netSales);
  assert.equal(ai.collected,financial.collected);
  assert.equal(ai.outstanding,financial.outstanding);
  assert.deepEqual(settled.inventoryMovements,before.inventoryMovements);
  assert.equal(quantity(settled,'b09-cookies',warehouseId),60000n);
  const wrongCurrency={...payment,id:'b09-wrong-currency',currency:'EUR',reference:'INVALID'};
  const contaminated={...settled,payments:[...settled.payments,wrongCurrency]};
  assert.equal(report(contaminated).collected,'30.00','foreign-currency payment is never counted');
  assert.equal(context(contaminated).collected,'30.00');
});

test('B09 missing-cost boundary: AI and finance withhold profitability without withholding revenue',()=>{
  const {confirmed,note,input}=setup();
  const prepared=createConfirmedDeliveryInvoiceDraft(postSalesDeliveryStock(confirmed,input).vault,note.id);
  const invoice={...prepared.invoice,status:'final',items:prepared.invoice.items.map((line,i)=>
    i===0?{...line,unitCost:''}:line)};
  const vault={...prepared.vault,documents:prepared.vault.documents.map(doc=>
    doc.id===invoice.id?invoice:doc)};
  const financial=report(vault),ai=context(vault);
  assert.equal(financial.netSales,'80.00');
  assert.equal(financial.profitComplete,false);
  assert.equal(financial.grossProfit,'');
  assert.equal(financial.marginPercent,'');
  assert.equal(ai.profitComplete,false);
  assert.equal(ai.grossProfit,'');
  assert.equal(ai.marginPercent,'');
});
