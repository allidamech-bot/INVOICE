import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';
import { createSupplier, supplierSnapshotFrom } from '../dist/src/lib/operations.js';
import { createLinkedPurchaseOrderDraft, linkedPurchaseOrders } from '../dist/src/lib/procurement-flow.js';
import { acceptSupplierQuotation, acceptedSupplierQuotationEvents } from '../dist/src/lib/supplier-quotation-flow.js';
import { defaultOwnerMember } from '../dist/src/lib/governance.js';
import { calculateTotals } from '../dist/src/lib/money.js';

function scenario(language='bilingual'){
  const vault=emptyVault();
  const supplier={...createSupplier(),nameEn:'Istanbul Export',nameAr:'اسطنبول للتصدير',defaultCurrency:'USD'};
  vault.suppliers=[supplier];
  const rfq=createBlankDocument('rfq','RFQ-2026-0011',vault.company);
  rfq.status='final';rfq.language=language;rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
  rfq.items=[
    {...rfq.items[0],id:'rfq-line-a',descriptionEn:'12-carton packs',descriptionAr:'عبوات 12 كرتون',quantity:'12.5',unit:'Carton'},
    {...rfq.items[0],id:'rfq-line-b',descriptionEn:'24-carton packs',descriptionAr:'عبوات 24 كرتون',quantity:'6',unit:'Carton'}
  ];
  vault.documents=[rfq];
  assert.deepEqual(validateDocument(rfq),{});
  return{vault,rfq,supplier};
}
function request(rfq,extra={}){
  return{rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,expectedPurchaseOrderUpdatedAt:'',
    reference:'SQ-8872',unitPrices:['١٢٫٥','25.0000'],validUntil:'',notes:'Supplier offer received',...extra};
}
test('Batch 7: approved supplier quote links RFQ and PO, preserves quantities and does not post',()=>{
  const {vault,rfq}=scenario();
  const baseline=structuredClone(vault);
  const r=acceptSupplierQuotation(vault,request(rfq));
  const po=r.purchaseOrder,history=acceptedSupplierQuotationEvents(rfq.id,r.vault.documentEvents);
  assert.equal(po.kind,'purchase-order');
  assert.equal(po.status,'draft');
  assert.equal(po.lifecycleStatus,'active');
  assert.equal(po.items[0].quantity,rfq.items[0].quantity);
  assert.equal(po.items[1].quantity,rfq.items[1].quantity);
  assert.equal(po.items[0].unitPrice,'12.5','Arabic decimal input must be normalized');
  assert.equal(po.items[1].unitPrice,'25.0000');
  assert.equal(po.supplierSnapshot.sourceSupplierId,rfq.supplierSnapshot.sourceSupplierId);
  assert.equal(po.currency,rfq.currency);
  assert.equal(po.dueDate,'','Requested delivery date still needs human review');
  assert.equal(calculateTotals(po.items,po.adjustments).grandTotal,'306.25');
  assert.equal(history.length,1);
  assert.equal(history[0].reference,'SQ-8872');
  assert.equal(history[0].currency,'USD');
  assert.equal(history[0].purchaseOrderId,po.id);
  assert.deepEqual(history[0].lines.map(l=>l.rfqItemId),rfq.items.map(l=>l.id));
  assert.equal(history[0].acceptedByMemberId,'owner');
  assert.deepEqual(linkedPurchaseOrders(rfq,r.vault.documents,r.vault.documentEvents).map(x=>x.id),[po.id]);
  for(const key of ['purchases','supplierPayments','payments','inventoryMovements','savedItems','expenses']){
    assert.deepEqual(r.vault[key],baseline[key],`no changes to ${key}`);
  }
  assert.deepEqual(vault,baseline,'pure deterministic operation must not mutate caller vault');
});

test('Batch 7: existing draft PO accepts supplier quote only with matching version and blank prices',()=>{
  const {vault,rfq}=scenario('ar');
  const first=createLinkedPurchaseOrderDraft(vault,rfq.id);
  const r=acceptSupplierQuotation(first.vault,request(rfq,{expectedPurchaseOrderUpdatedAt:first.document.updatedAt}));
  assert.equal(r.vault.documents.length,2);
  assert.equal(r.purchaseOrder.id,first.document.id);
  assert.equal(r.purchaseOrder.language,'ar');
  assert.equal(acceptedSupplierQuotationEvents(rfq.id,r.vault.documentEvents).length,1);
  assert.throws(()=>acceptSupplierQuotation(r.vault,request(rfq,{expectedPurchaseOrderUpdatedAt:r.purchaseOrder.updatedAt})),/already been accepted/);
});

test('Batch 7: approval is restricted to purchasing, owner and admin, without financial posting permission changes',()=>{
  const {vault,rfq}=scenario();
  const owner=defaultOwnerMember();
  const viewer={...owner,id:'viewer',role:'viewer',displayName:'Viewer'};
  const sales={...owner,id:'sales',role:'sales',displayName:'Sales'};
  for(const member of [viewer,sales]){
    const scoped={...vault,teamMembers:[owner,member],appSettings:{...vault.appSettings,activeTeamMemberId:member.id}};
    assert.throws(()=>acceptSupplierQuotation(scoped,request(rfq)),/does not have permission/);
  }
  const purchasing={...owner,id:'buyer',role:'purchasing',displayName:'Buyer'};
  const allowed={...vault,teamMembers:[owner,purchasing],appSettings:{...vault.appSettings,activeTeamMemberId:'buyer'}};
  assert.equal(acceptSupplierQuotation(allowed,request(rfq)).quotation.acceptedByMemberId,'buyer');
});

test('Batch 7: stale RFQ, stale PO, currency and supplier drift fail closed',()=>{
  const {vault,rfq}=scenario();
  assert.throws(()=>acceptSupplierQuotation(vault,request(rfq,{expectedRfqUpdatedAt:'stale'})),/RFQ changed/);
  const first=createLinkedPurchaseOrderDraft(vault,rfq.id);
  assert.throws(()=>acceptSupplierQuotation(first.vault,request(rfq)),/Purchase order changed/);
  const mismatch={...first.vault,documents:first.vault.documents.map(x=>x.id===first.document.id?{...x,currency:'EUR'}:x)};
  assert.throws(()=>acceptSupplierQuotation(mismatch,request(rfq,{expectedPurchaseOrderUpdatedAt:first.document.updatedAt})),/Supplier or currency/);
  const altered={...first.vault,documents:first.vault.documents.map(x=>x.id===first.document.id?{...x,items:x.items.map((line,i)=>i===0?{...line,quantity:'15'}:line)}:x)};
  assert.throws(()=>acceptSupplierQuotation(altered,request(rfq,{expectedPurchaseOrderUpdatedAt:first.document.updatedAt})),/PO item quantities/);
  const priced={...first.vault,documents:first.vault.documents.map(x=>x.id===first.document.id?{...x,items:x.items.map((line,i)=>i===0?{...line,unitPrice:'10'}:line)}:x)};
  assert.throws(()=>acceptSupplierQuotation(priced,request(rfq,{expectedPurchaseOrderUpdatedAt:first.document.updatedAt})),/already has prices/);
  const missingSupplier={...vault,suppliers:[]};
  assert.throws(()=>acceptSupplierQuotation(missingSupplier,request(rfq)),/registered supplier/);
});

test('Batch 7: all quoted lines and valid prices are mandatory; no silent rounding',()=>{
  const {vault,rfq}=scenario();
  for(const [prices,pattern] of [
    [['5'],/Quote all RFQ lines/],
    [['0.00001','3'],/at most 4 decimals/],
    [['-1','3'],/at most 4 decimals/],
    [['','3'],/at most 4 decimals/],
    [['NaN','3'],/at most 4 decimals/]
  ]){
    assert.throws(()=>acceptSupplierQuotation(vault,request(rfq,{unitPrices:prices})),pattern);
  }
  assert.throws(()=>acceptSupplierQuotation(vault,request(rfq,{reference:'   '})),/supplier quotation reference/);
  assert.throws(()=>acceptSupplierQuotation(vault,request(rfq,{validUntil:'2000-01-01'})),/expiry/);
  assert.equal(acceptSupplierQuotation(vault,request(rfq,{unitPrices:['1','0']})).purchaseOrder.status,'draft');
});

test('Batch 7: voided PO permits a new quote while preserving immutable earlier evidence',()=>{
  const {vault,rfq}=scenario();
  const first=acceptSupplierQuotation(vault,request(rfq));
  const cancelled={...first.vault,documents:first.vault.documents.map(doc=>doc.id===first.purchaseOrder.id?{...doc,lifecycleStatus:'voided'}:doc)};
  const renewed=acceptSupplierQuotation(cancelled,request(rfq,{reference:'SQ-NEW',unitPrices:['10','20']}));
  assert.notEqual(renewed.purchaseOrder.id,first.purchaseOrder.id);
  assert.equal(acceptedSupplierQuotationEvents(rfq.id,renewed.vault.documentEvents).length,2);
  assert.equal(renewed.purchaseOrder.status,'draft');
});

test('Batch 7: UI must integrate via serialized bridge without new accounting actions',async()=>{
  const page=await readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8');
  const panel=await readFile(new URL('../src/components/SupplierQuotationReview.tsx',import.meta.url),'utf8');
  assert.match(page,/mutateVaultSafely\(vault=>\{/);
  assert.match(page,/acceptSupplierQuotation\(vault,input\)/);
  assert.match(page,/SupplierQuotationReview rfq=\{doc\}/);
  assert.match(panel,/confirmed/);
  assert.match(panel,/t\('Supplier quotation','عرض سعر المورد'\)/);
});
