import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';
import { createSupplier, supplierSnapshotFrom } from '../dist/src/lib/operations.js';
import { createLinkedPurchaseOrderDraft, linkedPurchaseOrders, purchaseOrderSource, purchaseOrderSourceEligible } from '../dist/src/lib/procurement-flow.js';

function fixture(){
  const vault=emptyVault();
  const supplier={...createSupplier(),nameEn:'Acme Exports',nameAr:'شركة أكمي',defaultCurrency:'USD'};
  vault.suppliers=[supplier];
  const rfq=createBlankDocument('rfq','RFQ-2026-0001',vault.company);
  rfq.status='final';
  rfq.currency='USD';
  rfq.language='bilingual';
  rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
  rfq.items=[{...rfq.items[0],descriptionEn:'Cocoa cartons',descriptionAr:'كرتون كاكاو',quantity:'12.5000',unit:'Carton',unitPrice:'',unitCost:''}];
  rfq.terms.finalDestination='Jeddah';
  rfq.terms.deliveryTime='30 days';
  vault.documents=[rfq];
  assert.deepEqual(validateDocument(rfq),{});
  return {vault,rfq};
}

test('Batch 7 / RFQ to purchase order maintains a traceable, idempotent link without posting',()=>{
  const {vault,rfq}=fixture();
  assert.equal(purchaseOrderSourceEligible(rfq),true);
  const before=structuredClone(vault);
  const result=createLinkedPurchaseOrderDraft(vault,rfq.id);
  const po=result.document;
  assert.equal(result.created,true);
  assert.equal(po.kind,'purchase-order');
  assert.equal(po.status,'draft');
  assert.equal(po.lifecycleStatus,'active');
  assert.match(po.number,/^PO-\d{4}-\d{4,}$/);
  assert.notEqual(po.id,rfq.id);
  assert.equal(po.convertedFromId,'');
  assert.equal(po.supplierSnapshot.sourceSupplierId,rfq.supplierSnapshot.sourceSupplierId);
  assert.notEqual(po.supplierSnapshot,rfq.supplierSnapshot);
  assert.equal(po.currency,rfq.currency);
  assert.equal(po.language,rfq.language);
  assert.equal(po.items[0].quantity,'12.5000');
  assert.equal(po.items[0].unit,'Carton');
  assert.equal(po.items[0].unitPrice,''); // price must be reviewed, never fabricated
  assert.equal(po.items[0].unitCost,'');
  assert.notEqual(po.items[0].id,rfq.items[0].id);
  assert.equal(po.terms.finalDestination,'Jeddah');
  assert.match(po.terms.remarks,/RFQ-2026-0001/);
  assert.equal(po.dueDate,''); // user must set requested delivery
  assert.equal(result.vault.documentEvents.at(-1).relatedDocumentId,rfq.id);
  assert.equal(purchaseOrderSource(po,result.vault.documents,result.vault.documentEvents)?.id,rfq.id);
  assert.deepEqual(linkedPurchaseOrders(rfq,result.vault.documents,result.vault.documentEvents).map(row=>row.id),[po.id]);
  for(const key of ['purchases','supplierPayments','payments','inventoryMovements','savedItems']){
    assert.deepEqual(result.vault[key],before[key],`No side effect allowed in ${key}`);
  }
  assert.deepEqual(vault,before,'Creation is pure; original vault must remain untouched');
  const repeated=createLinkedPurchaseOrderDraft(result.vault,rfq.id);
  assert.equal(repeated.created,false);
  assert.equal(repeated.document.id,po.id);
  assert.equal(repeated.vault,result.vault);
  assert.equal(repeated.vault.documents.length,2);
});

test('Batch 7 / sourced PO requires explicit pricing, delivery date, and approval before issuance',()=>{
  const {vault,rfq}=fixture();
  const result=createLinkedPurchaseOrderDraft(vault,rfq.id);
  const errors=validateDocument(result.document);
  assert.ok(errors.dueDate);
  assert.ok(errors['item-0-price']);
  const reviewed={...result.document,dueDate:result.document.issueDate,
    items:result.document.items.map(item=>({...item,unitPrice:'15.25'}))};
  assert.deepEqual(validateDocument(reviewed),{});
  assert.equal(reviewed.status,'draft','Reviewing document values must not issue or post it');
  assert.equal(result.vault.inventoryMovements.length,0);
});

test('Batch 7 / draft, voided, unrelated, or malformed RFQ must not create purchase order',()=>{
  const {vault,rfq}=fixture();
  const draft={...rfq,status:'draft'};
  assert.equal(purchaseOrderSourceEligible(draft),false);
  assert.throws(()=>createLinkedPurchaseOrderDraft({...vault,documents:[draft]},rfq.id),/issued RFQ/);
  const voided={...rfq,lifecycleStatus:'voided'};
  assert.throws(()=>createLinkedPurchaseOrderDraft({...vault,documents:[voided]},rfq.id),/issued RFQ/);
  const malformed={...rfq,supplierSnapshot:null};
  assert.throws(()=>createLinkedPurchaseOrderDraft({...vault,documents:[malformed]},rfq.id),/Correct the RFQ/);
  assert.throws(()=>createLinkedPurchaseOrderDraft(vault,'missing-source'),/issued RFQ/);
  const unrelated={...rfq,kind:'proforma'};
  assert.equal(purchaseOrderSourceEligible(unrelated),false);
  const result=createLinkedPurchaseOrderDraft(vault,rfq.id);
  assert.deepEqual(linkedPurchaseOrders(unrelated,result.vault.documents,result.vault.documentEvents),[]);
  assert.equal(purchaseOrderSource(rfq,result.vault.documents,result.vault.documentEvents),undefined);
});

test('Batch 7 / voided purchase order can be replaced with a new tracked draft',()=>{
  const {vault,rfq}=fixture();
  const first=createLinkedPurchaseOrderDraft(vault,rfq.id);
  const closed={...first.vault,documents:first.vault.documents.map(doc=>doc.id===first.document.id?{...doc,lifecycleStatus:'voided'}:doc)};
  const second=createLinkedPurchaseOrderDraft(closed,rfq.id);
  assert.equal(second.created,true);
  assert.notEqual(second.document.id,first.document.id);
  assert.notEqual(second.document.number,first.document.number);
  assert.equal(linkedPurchaseOrders(rfq,second.vault.documents,second.vault.documentEvents).length,2);
});
