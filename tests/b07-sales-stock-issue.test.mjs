import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {createLinkedDeliveryDraft} from '../dist/src/lib/delivery-flow.js';
import {confirmSalesDelivery} from '../dist/src/lib/sales-delivery-flow.js';
import {postSalesDeliveryStock,assertSalesDeliveryStockIntegrity,assertSalesStockLedgerContinuity} from '../dist/src/lib/sales-delivery-stock.js';
import {createConfirmedDeliveryInvoiceDraft} from '../dist/src/lib/sales-delivery-invoice.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {warehouseItemQuantity,defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {todayIso} from '../dist/src/lib/id.js';

function setup(){
 const v=emptyVault(),now=new Date().toISOString();
 const customer={id:'b07-customer',companyNameEn:'Buyer',companyNameAr:'المشتري',
  contactPerson:'Buyer',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',phone:'',email:'',
  vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
 v.customers=[customer];
 const make=(id,sku,name)=>({id,sku,createdAt:now,updatedAt:now,descriptionEn:name,descriptionAr:name,
  hsCode:'',origin:'',packing:'',unit:'Carton',lastUnitPrice:'',lastCurrency:'USD',
  lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:'',workspaceId:'default',branchId:'main'});
 v.savedItems=[make('cookies','SKU-COOKIE','Cookies'),make('candy','SKU-CANDY','Candy')];
 const supplier={...createSupplier(),nameEn:'Supplier',nameAr:'المورد',defaultCurrency:'USD'};
 v.suppliers=[supplier];
 const purchase=createPurchase([],v.suppliers);
 purchase.items=[{...createPurchaseItem(v.savedItems[0]),quantity:'10',unitCost:'2.00'},
  {...createPurchaseItem(v.savedItems[1]),quantity:'6',unitCost:'3.00'}];
 const posted=postPurchase(purchase,v.savedItems);
 v.purchases=[posted.purchase];v.inventoryMovements=posted.movements;v.savedItems=posted.savedItems;
 const quote=createBlankDocument('proforma','QUO-B07-STOCK',v.company);
 quote.status='final';quote.currency='USD';quote.customerSnapshot=customerSnapshotFrom(customer);
 quote.items=[{...quote.items[0],id:'cookie-line',descriptionEn:'Cookies',descriptionAr:'كوكيز',unit:'Carton',quantity:'8',unitPrice:'10'},
  {...quote.items[0],id:'candy-line',descriptionEn:'Candy',descriptionAr:'حلوى',unit:'Carton',quantity:'5',unitPrice:'20'}];
 assert.deepEqual(validateDocument(quote),{});
 v.documents=[quote];v.documentEvents.push(validatedCommercialTrackingEvent(v,quote.id,'accepted'));
 const accepted=acceptSalesOrder(v,{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
  customerReference:'SO-2026-01',orderDate:todayIso(),requestedDeliveryDate:todayIso()});
 const draft=createLinkedDeliveryDraft(accepted.vault,quote.id);
 const note={...draft.document,status:'final',items:draft.document.items.map((line,i)=>({...line,quantity:i===0?'4':'2'}))};
 assert.deepEqual(validateDocument(note),{});
 const staged={...draft.vault,documents:draft.vault.documents.map(doc=>doc.id===note.id?note:doc)};
 const delivered=confirmSalesDelivery(staged,{deliveryNoteId:note.id,expectedDeliveryNoteUpdatedAt:note.updatedAt,
  deliveredDate:todayIso(),reference:'POD-STOCK-1',confirmed:true}).vault;
 const warehouseId=defaultWarehouseId(delivered.appSettings.activeBranchId);
 const input={deliveryNoteId:note.id,expectedDeliveryNoteUpdatedAt:note.updatedAt,warehouseId,
  savedItemIds:['cookies','candy'],confirmed:true};
 return{delivered,note,input,warehouseId};
}
function stock(v,item,w){return Number(warehouseItemQuantity(item,w,v.inventoryMovements,w))/10000;}
test('B07 stock: purchase receipts -> confirmed partial delivery -> one explicit inventory issue',()=>{
 const {delivered,note,input,warehouseId}=setup();
 assert.equal(stock(delivered,'cookies',warehouseId),10);
 assert.equal(stock(delivered,'candy',warehouseId),6);
 const issued=postSalesDeliveryStock(delivered,input);
 assert.equal(issued.created,true);
 assert.equal(stock(issued.vault,'cookies',warehouseId),6);
 assert.equal(stock(issued.vault,'candy',warehouseId),4);
 assert.equal(issued.vault.inventoryMovements.filter(m=>m.type==='issue').length,2);
 assert.doesNotThrow(()=>assertSalesDeliveryStockIntegrity(issued.vault));
 const again=postSalesDeliveryStock(issued.vault,input);
 assert.equal(again.created,false);assert.equal(again.vault.inventoryMovements.length,issued.vault.inventoryMovements.length);
});
test('B07 stock: reject unconfirmed, wrong warehouse, missing SKU, insufficient stock and stale revision',()=>{
 const {delivered,input}=setup();
 const invalid=[
  [{...input,confirmed:false},/Confirm the warehouse/],
  [{...input,warehouseId:'warehouse-unknown'},/active warehouse/],
  [{...input,savedItemIds:['missing','candy']},/distinct active catalog/],
  [{...input,savedItemIds:['cookies']},/Select one catalog item/],
  [{...input,expectedDeliveryNoteUpdatedAt:'old'},/Delivery Note changed/]
 ];
 for(const [option,re] of invalid)assert.throws(()=>postSalesDeliveryStock(delivered,option),re);
 const zero={...delivered,inventoryMovements:delivered.inventoryMovements.filter(m=>m.itemId!=='cookies')};
 assert.throws(()=>postSalesDeliveryStock(zero,input),/Insufficient available stock/);
 const sku={...delivered,savedItems:delivered.savedItems.map(x=>x.id==='cookies'?{...x,sku:''}:x)};
 assert.throws(()=>postSalesDeliveryStock(sku,input),/Assign a SKU/);
});
test('B07 stock: new movement cannot be deleted, rewritten or duplicated across concurrent devices',()=>{
 const {delivered,input}=setup();const a=postSalesDeliveryStock(delivered,input).vault;
 assert.doesNotThrow(()=>mergeVaultIntent(delivered,a,delivered));
 assert.throws(()=>mergeVaultIntent(a,{...a,inventoryMovements:a.inventoryMovements.filter(m=>m.type!=='issue')},a),/append-only/);
 const other={...a,inventoryMovements:a.inventoryMovements.map(m=>m.type==='issue'?{...m,quantity:'-9.0000'}:m)};
 assert.throws(()=>mergeVaultIntent(delivered,a,other),/Concurrent stock issue conflict/);
 const forged={...a,inventoryMovements:a.inventoryMovements.map(m=>m.type==='issue'?{...m,itemId:'candy'}:m)};
 assert.throws(()=>assertSalesDeliveryStockIntegrity(forged),/Issued stock diverges/);
 assert.throws(()=>assertSalesStockLedgerContinuity(delivered.inventoryMovements,[...a.inventoryMovements,...a.inventoryMovements.filter(m=>m.type==='issue')],delivered.inventoryMovements),/Duplicate stock issue/);
});
test('B07 closeout: posted supplier purchase, physical stock issue, invoice issuance and canonical payment remain isolated',()=>{
 const {delivered,note,input,warehouseId}=setup();const out=postSalesDeliveryStock(delivered,input).vault;
 const draft=createConfirmedDeliveryInvoiceDraft(out,note.id);
 assert.equal(draft.invoice.status,'draft');
 assert.equal(stock(draft.vault,'cookies',warehouseId),6);
 const final={...draft.invoice,status:'final'};
 const docs=draft.vault.documents.map(d=>d.id===final.id?final:d);
 const at=todayIso();
 assert.equal(invoicePaymentSummary(final,[],at,docs).status,'unpaid');
 const payment=normalizePaymentRecord(final,[],{
  id:'payment-full',invoiceId:final.id,invoiceNumber:final.number,customerId:final.customerSnapshot.sourceCustomerId,
  customerNameEn:'Buyer',customerNameAr:'',currency:final.currency,amount:invoicePaymentSummary(final,[],at,docs).remaining,
  date:at,method:'bank-transfer',reference:'BANK-FULL',notes:'',
  createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
 },docs);
 assert.equal(invoicePaymentSummary(final,[payment],at,docs).status,'paid');
 assert.equal(stock(draft.vault,'cookies',warehouseId),6,'collecting invoice must not change inventory twice');
});
