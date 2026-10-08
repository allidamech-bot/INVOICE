import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';
import { createSupplier, supplierSnapshotFrom } from '../dist/src/lib/operations.js';
import { acceptSupplierQuotation } from '../dist/src/lib/supplier-quotation-flow.js';
import { confirmGoodsReceipt } from '../dist/src/lib/goods-receipt-flow.js';
import {
  matchSupplierInvoice,matchedSupplierInvoices,supplierInvoiceLineBalances,assertSupplierInvoiceMatchIntegrity
} from '../dist/src/lib/supplier-invoice-flow.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { defaultOwnerMember } from '../dist/src/lib/governance.js';
import { todayIso } from '../dist/src/lib/id.js';

function setup(receive=['7.2','2']){
  const vault=emptyVault();
  const supplier={...createSupplier(),nameEn:'Istanbul Export',nameAr:'تصدير إسطنبول'};
  vault.suppliers=[supplier];
  const rfq=createBlankDocument('rfq','RFQ-2026-0111',vault.company);
  rfq.status='final';rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
  rfq.items=[
    {...rfq.items[0],id:'rfq-1',descriptionEn:'Cookies 200g',descriptionAr:'بسكويت 200 غرام',quantity:'12.5',unit:'Carton'},
    {...rfq.items[0],id:'rfq-2',descriptionEn:'Candy 50g',descriptionAr:'حلوى 50 غرام',quantity:'6',unit:'Carton'}
  ];
  vault.documents=[rfq];assert.deepEqual(validateDocument(rfq),{});
  const quoted=acceptSupplierQuotation(vault,{rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,
    expectedPurchaseOrderUpdatedAt:'',reference:'SQ-101',unitPrices:['10.5','25'],notes:''});
  const order={...quoted.purchaseOrder,status:'final',dueDate:todayIso()};
  assert.deepEqual(validateDocument(order),{});
  const ready={...quoted.vault,documents:quoted.vault.documents.map(doc=>doc.id===order.id?order:doc)};
  const after=confirmGoodsReceipt(ready,{purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
    reference:'GRN-100',receivedDate:todayIso(),quantities:receive}).vault;
  return{vault:after,rfq,order,supplier};
}
function invoice(order,quantities=['7.2','2'],reference='SI-2026-001',unitPrices=['10.5','25']){
  return{purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
    reference,invoiceDate:todayIso(),quantities,unitPrices,notes:'Received original supplier invoice'};
}

test('Batch7 supplier invoice: RFQ → supplier quote → issued PO → GRN → reviewed invoice; no accounting side effects',()=>{
  const {vault,order}=setup(),before=structuredClone(vault);
  const matched=matchSupplierInvoice(vault,invoice(order));
  assert.equal(matched.invoice.reference,'SI-2026-001');
  assert.equal(matched.invoice.purchaseOrderId,order.id);
  assert.equal(matched.invoice.currency,'USD');
  assert.equal(matched.invoice.supplierId,order.supplierSnapshot.sourceSupplierId);
  assert.equal(matched.invoice.reviewedByMemberId,'owner');
  assert.equal(matched.invoice.lineSubtotal,'125.60');
  assert.deepEqual(matched.invoice.lines.map(line=>line.quantity),['7.2','2']);
  assert.equal(matchedSupplierInvoices(order.id,matched.vault.documentEvents).length,1);
  assert.deepEqual(supplierInvoiceLineBalances(order,matched.vault.documentEvents).map(b=>b.availableToBill),['0','0']);
  assert.equal(matched.vault.documentEvents.length,vault.documentEvents.length+1);
  assert.deepEqual(matched.vault.documents,before.documents);
  for(const key of ['purchases','supplierPayments','payments','inventoryMovements','savedItems','expenses','treasuryEntries']){
    assert.deepEqual(matched.vault[key],before[key],`matching must never post ${key}`);
  }
  assert.deepEqual(vault,before,'matching is a pure vault mutation');
});

test('Batch7 supplier invoice: partial bills cannot exceed cumulative received quantities',()=>{
  const {vault,order}=setup();
  const first=matchSupplierInvoice(vault,invoice(order,['5','1'],'SI-001'));
  assert.deepEqual(supplierInvoiceLineBalances(order,first.vault.documentEvents).map(x=>x.availableToBill),['2.2','1']);
  const second=matchSupplierInvoice(first.vault,invoice(order,['2.2','1'],'SI-002'));
  assert.deepEqual(supplierInvoiceLineBalances(order,second.vault.documentEvents).map(x=>[x.received,x.billed,x.availableToBill]),
    [['7.2','7.2','0'],['2','2','0']]);
  assert.throws(()=>matchSupplierInvoice(second.vault,invoice(order,['0.0001','0'],'SI-003')),/exceeds received/);
});

test('Batch7 supplier invoice: price mismatch, duplicate reference, mismatched quantities, stale edits fail closed',()=>{
  const {vault,order}=setup();
  const prior=matchSupplierInvoice(vault,invoice(order,['5','1']));
  assert.throws(()=>matchSupplierInvoice(prior.vault,invoice(order,['1','0'],'si-2026-001')),/already matched/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['1','0'],'SI-2',['10.5001','25'])),/exactly match/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['1','0'],'SI-2',['11','25'])),/exactly match/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['7.2001','0'],'SI-2')),/exceeds received/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['','0'],'SI-2')),/At least one/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['0','0'],'SI-2')),/At least one/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['NaN','0'],'SI-2')),/non-negative/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['1.00001','0'],'SI-2')),/four decimal/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['1'],'SI-2')),/exact Purchase Order line/);
  assert.throws(()=>matchSupplierInvoice(vault,{...invoice(order),expectedPurchaseOrderUpdatedAt:'stale'}),/changed/);
  assert.throws(()=>matchSupplierInvoice(vault,invoice(order,['1','0'],'   ')),/reference is required/);
});

test('Batch7 supplier invoice: GRN required, draft/void PO blocked and invalid supplier/date guarded',()=>{
  const {vault,order}=setup();
  const noGrn={...vault,documentEvents:vault.documentEvents.filter(x=>!x.note.includes('@lourex:goods-receipt:confirmed:v1:'))};
  assert.throws(()=>matchSupplierInvoice(noGrn,invoice(order)),/Record actual goods receipt/);
  const draft={...vault,documents:vault.documents.map(doc=>doc.id===order.id?{...doc,status:'draft'}:doc)};
  assert.throws(()=>matchSupplierInvoice(draft,invoice(order)),/active issued/);
  const voided={...vault,documents:vault.documents.map(doc=>doc.id===order.id?{...doc,lifecycleStatus:'voided'}:doc)};
  assert.throws(()=>matchSupplierInvoice(voided,invoice(order)),/active issued/);
  const missing={...vault,suppliers:[]};
  assert.throws(()=>matchSupplierInvoice(missing,invoice(order)),/registered supplier/);
  assert.throws(()=>matchSupplierInvoice(vault,{...invoice(order),invoiceDate:'2099-01-01'}),/invoice date/);
  assert.throws(()=>matchSupplierInvoice(vault,{...invoice(order),invoiceDate:'2000-01-01'}),/invoice date/);
});

test('Batch7 supplier invoice: finance/purchasing/admin/owner roles permitted, sales and viewer denied',()=>{
  const {vault,order}=setup();
  const owner=defaultOwnerMember();
  for(const role of ['sales','viewer']){
    const actor={...owner,id:role,displayName:role,role};
    const scoped={...vault,teamMembers:[owner,actor],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.throws(()=>matchSupplierInvoice(scoped,invoice(order)),/does not have permission/);
  }
  for(const role of ['owner','admin','finance','purchasing']){
    const actor={...owner,id:role,displayName:role,role};
    const scoped={...vault,teamMembers:[owner,actor],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.equal(matchSupplierInvoice(scoped,invoice(order)).invoice.reviewedByMemberId,role);
  }
});

test('Batch7 supplier invoice: Arabic decimal pricing and quantities normalize without floating rounding',()=>{
  const {vault,order}=setup();
  const matched=matchSupplierInvoice(vault,invoice(order,['٧٫٢','٢'],'AR-1',['١٠٫٥','٢٥']));
  assert.deepEqual(matched.invoice.lines.map(x=>[x.quantity,x.unitPrice]),[['7.2','10.5'],['2','25']]);
  assert.equal(matched.invoice.lineSubtotal,'125.60');
});

test('Batch7 supplier invoice: concurrent device matches are rejected if sum exceeds GRN',()=>{
  const {vault,order}=setup();
  const left=matchSupplierInvoice(vault,invoice(order,['5','0'],'INV-L')).vault;
  const right=matchSupplierInvoice(vault,invoice(order,['5','0'],'INV-R')).vault;
  assert.throws(()=>mergeVaultIntent(vault,left,right),/Concurrent supplier invoices exceed received quantities/);
  const less=matchSupplierInvoice(vault,invoice(order,['2.2','0'],'INV-R')).vault;
  const combined=mergeVaultIntent(vault,left,less);
  assert.equal(supplierInvoiceLineBalances(order,combined.documentEvents)[0].availableToBill,'0');
  assert.doesNotThrow(()=>assertSupplierInvoiceMatchIntegrity(combined.documents,combined.documentEvents));
});

test('Batch7 supplier invoice: concurrent same-reference matches rejected on merge',()=>{
  const {vault,order}=setup();
  const left=matchSupplierInvoice(vault,invoice(order,['3','0'],'SAME-1')).vault;
  const right=matchSupplierInvoice(vault,invoice(order,['2','0'],'same-1')).vault;
  assert.throws(()=>mergeVaultIntent(vault,left,right),/Duplicate supplier invoice reference/);
  const damaged={...left,documentEvents:[...left.documentEvents,{...left.documentEvents.at(-1),id:'bad',note:'@lourex:supplier-invoice:three-way-matched:v1:broken'}]};
  assert.throws(()=>assertSupplierInvoiceMatchIntegrity(damaged.documents,damaged.documentEvents),/invalid or damaged evidence/);
});

test('Batch7 supplier invoice: UI uses serialized mutation and bilingual explicit confirmation',async()=>{
  const documents=await readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8');
  const panel=await readFile(new URL('../src/components/SupplierInvoiceMatchReview.tsx',import.meta.url),'utf8');
  assert.match(documents,/mutateVaultSafely\(vault=>matchSupplierInvoice\(vault,input\)\.vault\)/);
  assert.match(documents,/SupplierInvoiceMatchReview order=\{doc\}/);
  assert.match(panel,/t\('Supplier Invoice Matching','مطابقة فاتورة المورد'\)/);
  assert.match(panel,/this\.state\.confirmed/);
});
