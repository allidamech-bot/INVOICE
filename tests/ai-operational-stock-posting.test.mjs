import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {createLinkedDeliveryDraft} from '../dist/src/lib/delivery-flow.js';
import {confirmSalesDelivery} from '../dist/src/lib/sales-delivery-flow.js';
import {salesDeliveryStockIssues} from '../dist/src/lib/sales-delivery-stock.js';
import {warehouseItemQuantity,defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {todayIso} from '../dist/src/lib/id.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {foundationActionAllowed,prepareFoundationApproval,assertFoundationApproval} from '../dist/src/lib/ai-foundation-approval.js';
import {isAiStockIssueIntent,parseAiStockIssueRequest,prepareAiSalesStockIssue,applyAiSalesStockIssue} from '../dist/src/lib/ai-operational-stock-issue.js';
function fixture(){
 const v=emptyVault(),now=new Date().toISOString();
 const customer={id:'cust',companyNameEn:'Verified Buyer',companyNameAr:'عميل',
   contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
   vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
 v.customers=[customer];
 const make=(id,sku,name)=>({id,sku,createdAt:now,updatedAt:now,
  descriptionEn:name,descriptionAr:name==='Item A'?'صنف أ':'صنف ب',hsCode:'',origin:'',packing:'',
  unit:'Carton',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',
  usageCount:0,lastUsedAt:'',workspaceId:'default',branchId:'main'});
 v.savedItems=[make('item-a','SKU-A','Item A'),make('item-b','SKU-B','Item B')];
 const supplier={...createSupplier(),nameEn:'Supplier',nameAr:'مورد'};
 v.suppliers=[supplier];
 const purchase=createPurchase([],v.suppliers);
 purchase.items=[{...createPurchaseItem(v.savedItems[0]),quantity:'10',unitCost:'2'},
  {...createPurchaseItem(v.savedItems[1]),quantity:'7',unitCost:'3'}];
 const posted=postPurchase(purchase,v.savedItems);v.purchases=[posted.purchase];v.inventoryMovements=posted.movements;v.savedItems=posted.savedItems;
 const quote=createBlankDocument('proforma','QUO-2026-0045',v.company);
 quote.status='final';quote.customerSnapshot=customerSnapshotFrom(customer);
 quote.items=[{...quote.items[0],id:'q1',descriptionEn:'Item A',descriptionAr:'صنف أ',quantity:'8',unit:'Carton',unitPrice:'10'},
  {...quote.items[0],id:'q2',descriptionEn:'Item B',descriptionAr:'صنف ب',quantity:'5',unit:'Carton',unitPrice:'20'}];
 assert.deepEqual(validateDocument(quote),{});
 v.documents=[quote];v.documentEvents.push(validatedCommercialTrackingEvent(v,quote.id,'accepted'));
 const accepted=acceptSalesOrder(v,{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
  orderDate:todayIso(),requestedDeliveryDate:todayIso(),customerReference:'SO-PO-45'});
 const draft=createLinkedDeliveryDraft(accepted.vault,quote.id);
 const issued={...draft.document,status:'final',items:draft.document.items.map((x,i)=>({...x,quantity:i===0?'4':'2'}))};
 assert.deepEqual(validateDocument(issued),{});
 const prepared={...draft.vault,documents:draft.vault.documents.map(x=>x.id===issued.id?issued:x)};
 const confirmed=confirmSalesDelivery(prepared,{deliveryNoteId:issued.id,expectedDeliveryNoteUpdatedAt:issued.updatedAt,
  deliveredDate:todayIso(),reference:'POD-STOCK-45',confirmed:true}).vault;
 const warehouseId=defaultWarehouseId(confirmed.appSettings.activeBranchId);
 const warehouse=confirmed.warehouses.find(w=>w.id===warehouseId);
 assert.ok(warehouse);
 return{vault:confirmed,note:issued,warehouse,warehouseId};
}
const cmd=(note,warehouse,skus='SKU-A,SKU-B')=>
 'جهّز صرف المخزون لسند التسليم '+note.number+'، المستودع '+warehouse.code+'، الأصناف '+skus;
const ctx=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Physical inventory issue parser cannot combine stock with documents or silently guess SKUs',()=>{
 const f=fixture(),m=cmd(f.note,f.warehouse);
 assert.equal(isAiStockIssueIntent(m),true);
 assert.deepEqual(parseAiStockIssueRequest(m),{
  deliveryNoteNumber:f.note.number,warehouseCode:f.warehouse.code,skus:['SKU-A','SKU-B']});
 for(const q of [m+' واصدر الفاتورة',m+' ثم اعتمد دفع المورد'])
  assert.throws(()=>parseAiStockIssueRequest(q),/cannot be bundled/);
 assert.equal(parseAiStockIssueRequest('جهّز صرف المخزون لسند '+f.note.number),null);
 assert.throws(()=>parseAiStockIssueRequest(cmd(f.note,f.warehouse,'SKU-A,SKU-A')),/distinct SKU/);
});
test('Controller and Advisor do not stage retired direct Delivery Note stock deductions',async()=>{
 const f=fixture(),before=structuredClone(f.vault),request=cmd(f.note,f.warehouse);
 for(const mode of ['controller','advisor']){
  const response=await orchestrateAiToolRequest({message:request,vault:f.vault,context:ctx(mode),language:'ar'});
  assert.notEqual(response?.proposal?.tool,'sales.issueConfirmedStock');
  assert.equal(response?.proposal??null,null);
  if(mode==='controller')assert.match(response?.answer||'',/إيقاف الصرف المنفصل|فاتورة البيع النهائية/);
 }
 assert.deepEqual(f.vault,before,'Retired commands must never mutate stock, documents or payments');
});
test('One authorized stock issue deducts only confirmed quantities and no invoice/payment',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const review=prepareAiSalesStockIssue(f.vault,parseAiStockIssueRequest(cmd(f.note,f.warehouse)));
 assert.equal(review.lineCount,2);
 const res=applyAiSalesStockIssue(f.vault,review);
 assert.equal(salesDeliveryStockIssues(f.note.id,res.vault.inventoryMovements).length,2);
 assert.equal(Number(warehouseItemQuantity('item-a',f.warehouseId,res.vault.inventoryMovements,f.warehouseId))/10000,6);
 assert.equal(Number(warehouseItemQuantity('item-b',f.warehouseId,res.vault.inventoryMovements,f.warehouseId))/10000,5);
 for(const k of ['documents','documentEvents','payments','supplierPayments','treasuryEntries','purchases'])
  assert.deepEqual(res.vault[k],before[k]);
 assert.deepEqual(f.vault,before);
 assert.throws(()=>applyAiSalesStockIssue(res.vault,review),/already has stock issue/);
});
test('Stale balance, missing SKU, incorrect warehouse and excess stock requests fail closed',()=>{
 const f=fixture(),review=prepareAiSalesStockIssue(f.vault,parseAiStockIssueRequest(cmd(f.note,f.warehouse)));
 for(const altered of [
  {...f.vault,inventoryMovements:f.vault.inventoryMovements.filter(x=>x.itemId!=='item-a')},
  {...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}},
  {...f.vault,documents:f.vault.documents.map(d=>d.id===f.note.id?{...d,updatedAt:'2099-01-01T00:00:00.000Z'}:d)}
 ])assert.throws(()=>applyAiSalesStockIssue(altered,review));
 assert.throws(()=>prepareAiSalesStockIssue(f.vault,{deliveryNoteNumber:f.note.number,warehouseCode:f.warehouse.code,skus:['SKU-A','NOT-FOUND']}));
 assert.throws(()=>prepareAiSalesStockIssue(f.vault,{deliveryNoteNumber:f.note.number,warehouseCode:'OTHER',skus:['SKU-A','SKU-B']}));
});
test('Retired direct DN stock deductions are unapprovable for every role and rejected by executor',async()=>{
 const f=fixture(),review=prepareAiSalesStockIssue(f.vault,parseAiStockIssueRequest(cmd(f.note,f.warehouse)));
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'inventory-issue'};
 const proposal={capability:'tool.execute',tool:'sales.issueConfirmedStock',args:review,
  label:'Retired direct warehouse stock issue',rationale:'Historical delivery note'};
 for(const role of ['owner','admin','finance','sales','viewer','purchasing']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),false);
  assert.throws(()=>prepareFoundationApproval(vault,proposal,scope),/cannot approve/);
 }
 const permissions=await readFile(new URL('../src/lib/ai-foundation-approval.ts',import.meta.url),'utf8');
 assert.match(permissions,/proposal.tool==='sales.issueConfirmedStock'\\)return false/);
 const executor=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(executor,/Separate Delivery Note stock deduction is retired/);
 assert.doesNotMatch(executor,/applyAiSalesStockIssue\\(vault,review\\)/);
});
test('Wrong same-unit SKU cannot deduct a different delivered product',()=>{
 const f=fixture(),before=structuredClone(f.vault),request=parseAiStockIssueRequest(cmd(f.note,f.warehouse,'SKU-B,SKU-A'));
 assert.deepEqual(request.skus,['SKU-B','SKU-A']);
 assert.throws(()=>prepareAiSalesStockIssue(f.vault,request),/describes a different product/);
 assert.deepEqual(f.vault,before);
});
test('Ambiguous duplicate catalog names fail closed even when requested SKU has enough stock',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const duplicate={...f.vault.savedItems[0],id:'duplicate-a',sku:'SKU-SECOND-A'};
 const conflicted={...f.vault,savedItems:[...f.vault.savedItems,duplicate]};
 assert.throws(()=>prepareAiSalesStockIssue(conflicted,parseAiStockIssueRequest(cmd(f.note,f.warehouse))),
  /Multiple inventory SKUs match/);
 assert.deepEqual(f.vault,before);
});
test('Changed bilingual descriptions cannot silently relink a saved stock issue',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const changed={...f.vault,savedItems:f.vault.savedItems.map((row,i)=>i===0?
  {...row,descriptionAr:'Different brand'}:row)};
 assert.throws(()=>prepareAiSalesStockIssue(changed,parseAiStockIssueRequest(cmd(f.note,f.warehouse))),
  /describes a different product/);
 assert.deepEqual(f.vault,before);
});
