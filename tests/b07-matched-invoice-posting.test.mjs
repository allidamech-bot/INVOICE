import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { createSupplier, supplierSnapshotFrom, purchaseTotals, reversePurchase } from '../dist/src/lib/operations.js';
import { acceptSupplierQuotation } from '../dist/src/lib/supplier-quotation-flow.js';
import { confirmGoodsReceipt } from '../dist/src/lib/goods-receipt-flow.js';
import { matchSupplierInvoice } from '../dist/src/lib/supplier-invoice-flow.js';
import { postMatchedSupplierInvoice, invoicePostingForMatch, assertMatchedSupplierInvoicePostingIntegrity } from '../dist/src/lib/supplier-invoice-posting.js';
import { purchasePayableSummary, createSupplierPayment, normalizeSupplierPayment } from '../dist/src/lib/payables.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { defaultOwnerMember, decideApprovalRequest } from '../dist/src/lib/governance.js';
import { todayIso } from '../dist/src/lib/id.js';

function fixture(){
  const first=emptyVault();
  const supplier={...createSupplier(),nameEn:'Istanbul Export',nameAr:'تصدير إسطنبول',defaultCurrency:'USD'};
  const now=new Date().toISOString();
  const products=[
    {id:'stock-cookies',createdAt:now,updatedAt:now,sku:'CK-200',descriptionEn:'Cookies 200g',descriptionAr:'بسكويت 200 غرام',
      hsCode:'',origin:'',packing:'',unit:'Carton',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:''},
    {id:'stock-candy',createdAt:now,updatedAt:now,sku:'CN-50',descriptionEn:'Candy 50g',descriptionAr:'حلوى 50 غرام',
      hsCode:'',origin:'',packing:'',unit:'Carton',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:''}
  ];
  first.suppliers=[supplier];first.savedItems=products;
  const rfq=createBlankDocument('rfq','RFQ-2026-111',first.company);
  rfq.status='final';rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
  rfq.items=[
    {...rfq.items[0],id:'rq-one',descriptionEn:'Cookies 200g',descriptionAr:'بسكويت 200 غرام',quantity:'12.5',unit:'Carton'},
    {...rfq.items[0],id:'rq-two',descriptionEn:'Candy 50g',descriptionAr:'حلوى 50 غرام',quantity:'6',unit:'Carton'}
  ];
  first.documents=[rfq];
  const accepted=acceptSupplierQuotation(first,{rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,
    expectedPurchaseOrderUpdatedAt:'',reference:'SQ-111',unitPrices:['10.5','25']});
  const order={...accepted.purchaseOrder,status:'final',dueDate:todayIso()};
  let vault={...accepted.vault,documents:accepted.vault.documents.map(doc=>doc.id===order.id?order:doc)};
  vault=confirmGoodsReceipt(vault,{purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
    reference:'GRN-111',receivedDate:todayIso(),quantities:['7.2','2']}).vault;
  const bill=matchSupplierInvoice(vault,{purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
    invoiceReference:'SUP-INV-111',invoiceDate:todayIso(),dueDate:todayIso(),
    quantities:['7.2','2'],unitPrices:['10.5','25'],statedTotal:'125.60'}).invoice;
  vault=matchSupplierInvoice(vault,{purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
    invoiceReference:'SUP-INV-111',invoiceDate:todayIso(),dueDate:todayIso(),
    quantities:['7.2','2'],unitPrices:['10.5','25'],statedTotal:'125.60'}).vault;
  const event=vault.documentEvents.at(-1);
  assert.equal(bill.invoiceReference,'SUP-INV-111');
  return {vault,order,supplier,products,event};
}
function input(order,event,ids=['stock-cookies','stock-candy']){
  return {purchaseOrderId:order.id,matchEventId:event.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
    savedItemIds:ids,confirmed:true};
}

test('Batch7: approved invoice posts precisely matched quantities, stock and one payable without double-counting GRN',()=>{
  const {vault,order,event,products,supplier}=fixture(),baseline=structuredClone(vault);
  const result=postMatchedSupplierInvoice(vault,input(order,event));
  assert.equal(result.posted,true);
  assert.equal(result.approvalPending,false);
  const purchase=result.purchase;
  assert.equal(purchase.status,'posted');
  assert.equal(purchase.sourceSupplierInvoiceEventId,event.id);
  assert.equal(purchase.sourcePurchaseOrderId,order.id);
  assert.deepEqual(purchase.items.map(line=>line.quantity),['7.2','2']);
  assert.deepEqual(purchase.items.map(line=>line.savedItemId),products.map(item=>item.id));
  assert.equal(purchaseTotals(purchase).landedTotal,'125.60');
  assert.equal(result.vault.purchases.length,1);
  assert.deepEqual(result.vault.inventoryMovements.map(move=>move.quantity),['7.2','2']);
  assert.equal(result.vault.inventoryMovements.length,2,'GRN was evidence, not a stock movement');
  assert.equal(purchasePayableSummary(purchase,result.vault.supplierPayments).remaining,'125.60');
  assert.equal(result.vault.supplierPayments.length,0,'posting opens liability, not a payment');
  assert.equal(result.vault.documents.length,vault.documents.length);
  assert.deepEqual(vault,baseline,'pure operation; no mutation of caller');
  assert.ok(invoicePostingForMatch(event.id,result.vault.documentEvents));
  assert.doesNotThrow(()=>assertMatchedSupplierInvoicePostingIntegrity(result.vault));
  const payment=createSupplierPayment(purchase,supplier,result.vault.supplierPayments);
  assert.equal(payment.amount,'125.60');
  assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[],{...payment,amount:'125.61'}),/cannot exceed/);
  assert.throws(()=>postMatchedSupplierInvoice(result.vault,input(order,event)),/already been posted/);
});

test('Batch7: catalog mappings require unique active products with exact units and explicit confirmation',()=>{
  const {vault,order,event}=fixture();
  assert.throws(()=>postMatchedSupplierInvoice(vault,{...input(order,event),confirmed:false}),/Confirm/);
  assert.throws(()=>postMatchedSupplierInvoice(vault,input(order,event,[])),/Select a catalog/);
  assert.throws(()=>postMatchedSupplierInvoice(vault,input(order,event,['stock-cookies','stock-cookies'])),/cannot be mapped twice/);
  assert.throws(()=>postMatchedSupplierInvoice(vault,input(order,event,['missing','stock-candy'])),/active catalog/);
  const mismatch={...vault,savedItems:vault.savedItems.map(x=>x.id==='stock-cookies'?{...x,unit:'PCS'}:x)};
  assert.throws(()=>postMatchedSupplierInvoice(mismatch,input(order,event)),/unit differs/);
  const archived={...vault,savedItems:vault.savedItems.map(x=>x.id==='stock-cookies'?{...x,archived:true}:x)};
  assert.throws(()=>postMatchedSupplierInvoice(archived,input(order,event)),/active catalog/);
});

test('Batch7: stale PO and invalid source never create financial effects',()=>{
  const {vault,order,event}=fixture();
  const bad=[{...input(order,event),expectedPurchaseOrderUpdatedAt:'old'},{...input(order,event),matchEventId:'not-found'}];
  assert.throws(()=>postMatchedSupplierInvoice(vault,bad[0]),/changed/);
  assert.throws(()=>postMatchedSupplierInvoice(vault,bad[1]),/not found/);
  const draft={...vault,documents:vault.documents.map(d=>d.id===order.id?{...d,status:'draft'}:d)};
  assert.throws(()=>postMatchedSupplierInvoice(draft,input(order,event)),/active issued/);
  const voided={...vault,documents:vault.documents.map(d=>d.id===order.id?{...d,lifecycleStatus:'voided'}:d)};
  assert.throws(()=>postMatchedSupplierInvoice(voided,input(order,event)),/active issued/);
  assert.equal(vault.purchases.length,0);
  assert.equal(vault.inventoryMovements.length,0);
});

test('Batch7: post-purchase governance approval creates pending request, then allows one posting',()=>{
  const {vault,order,event}=fixture();
  const gated={...vault,approvalPolicies:vault.approvalPolicies.map(x=>x.action==='post-purchase'?{...x,enabled:true}:x)};
  const first=postMatchedSupplierInvoice(gated,input(order,event));
  assert.equal(first.posted,false);
  assert.equal(first.approvalPending,true);
  assert.equal(first.vault.purchases.length,0);
  assert.equal(first.vault.inventoryMovements.length,0);
  assert.equal(first.vault.approvalRequests.filter(x=>x.status==='pending').length,1);
  const req=first.vault.approvalRequests[0];
  const approved=decideApprovalRequest(first.vault,req.id,'approved','Reviewed invoice and catalog mappings');
  const second=postMatchedSupplierInvoice(approved,input(order,event));
  assert.equal(second.posted,true);
  assert.equal(second.vault.purchases.length,1);
  assert.throws(()=>postMatchedSupplierInvoice(second.vault,input(order,event)),/already been posted/);
});

test('Batch7: only post-purchase authorized roles may create supplier payables and stock movements',()=>{
  const {vault,order,event}=fixture();
  const owner=defaultOwnerMember();
  for(const role of ['sales','finance','viewer']){
    const actor={...owner,id:role,role,displayName:role};
    const scoped={...vault,teamMembers:[owner,actor],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.throws(()=>postMatchedSupplierInvoice(scoped,input(order,event)),/does not have permission/);
  }
  for(const role of ['owner','admin','purchasing']){
    const actor={...owner,id:role,role,displayName:role};
    const scoped={...vault,teamMembers:[owner,actor],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.equal(postMatchedSupplierInvoice(scoped,input(order,event)).posted,true);
  }
});

test('Batch7: no more than one stock receipt or payable is accepted for one matched invoice after offline merge',()=>{
  const {vault,order,event}=fixture();
  const left=postMatchedSupplierInvoice(vault,input(order,event)).vault;
  const right=postMatchedSupplierInvoice(vault,input(order,event)).vault;
  assert.equal(left.purchases.length,1);
  assert.equal(right.purchases.length,1);
  // The existing purchase merge guard rejects the concurrent write first.
  assert.throws(()=>mergeVaultIntent(vault,left,right),/Purchase changed on another device/);
  // Also exercise the new independent ledger integrity guard, even if a
  // future sync strategy bypasses the early purchase conflict guard.
  const duplicatePostedEvents=right.documentEvents.filter(event=>
    event.note.startsWith('@lourex:supplier-invoice:purchase-posted:v1:'));
  const duplicateAudit={...left,documentEvents:[...left.documentEvents,...duplicatePostedEvents]};
  assert.throws(()=>assertMatchedSupplierInvoicePostingIntegrity(duplicateAudit),
    /Duplicate or invalid supplier invoice posting evidence/);
  const duplicateStock={...left,inventoryMovements:[...left.inventoryMovements,...right.inventoryMovements]};
  assert.throws(()=>assertMatchedSupplierInvoicePostingIntegrity(duplicateStock),
    /Duplicate, missing or inconsistent supplier invoice inventory posting/);
  const tampered={...left,purchases:left.purchases.map(x=>({...x,items:x.items.map((item,i)=>i===0?{...item,unitCost:'11'}:item)}))};
  assert.throws(()=>assertMatchedSupplierInvoicePostingIntegrity(tampered),/differs from the reviewed supplier invoice|differs from the approved invoice/);
  const missingAudit={...left,documentEvents:left.documentEvents.filter(e=>!e.note.startsWith('@lourex:supplier-invoice:purchase-posted:v1:'))};
  assert.throws(()=>assertMatchedSupplierInvoicePostingIntegrity(missingAudit),/lacks its posting audit evidence/);
  const missingStock={...left,inventoryMovements:left.inventoryMovements.slice(1)};
  assert.throws(()=>assertMatchedSupplierInvoicePostingIntegrity(missingStock),/Duplicate, missing or inconsistent/);
});

test('Batch7: manual reversal of a supplier invoice posting preserves audit trail and prevents re-posting',()=>{
  const {vault,order,event}=fixture();
  const first=postMatchedSupplierInvoice(vault,input(order,event)).vault;
  const purchase=first.purchases[0];
  const reversed=reversePurchase(purchase,'Supplier invoice correction',first.inventoryMovements,first.savedItems);
  const next={...first,purchases:[reversed.purchase],savedItems:reversed.savedItems,
    inventoryMovements:[...first.inventoryMovements,...reversed.movements]};
  assert.doesNotThrow(()=>assertMatchedSupplierInvoicePostingIntegrity(next));
  assert.throws(()=>postMatchedSupplierInvoice(next,input(order,event)),/already been posted/);
});

test('Batch7: one serialized encrypted bridge powers posting; UI does not automatically map SKUs',async()=>{
  const docs=await readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8');
  const screen=await readFile(new URL('../src/components/SupplierInvoicePostingReview.tsx',import.meta.url),'utf8');
  const merge=await readFile(new URL('../src/storage/vault-merge.ts',import.meta.url),'utf8');
  assert.match(docs,/mutateVaultSafely\(vault=>\{/);
  assert.match(docs,/postMatchedSupplierInvoice\(vault,input\)/);
  assert.match(docs,/SupplierInvoicePostingReview order=\{doc\}/);
  assert.match(screen,/savedItemIds:\[\.\.\.this\.state\.mappedIds\]/);
  assert.match(screen,/this\.state\.confirmed/);
  assert.match(merge,/assertMatchedSupplierInvoicePostingIntegrity\(\{documents,documentEvents,purchases,inventoryMovements\}\)/);
});
