import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';
import { createSupplier, supplierSnapshotFrom } from '../dist/src/lib/operations.js';
import { acceptSupplierQuotation } from '../dist/src/lib/supplier-quotation-flow.js';
import { confirmGoodsReceipt } from '../dist/src/lib/goods-receipt-flow.js';
import { matchedSupplierInvoices, matchSupplierInvoice, supplierInvoiceLineBalances, assertSupplierInvoiceIntegrity } from '../dist/src/lib/supplier-invoice-flow.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { defaultOwnerMember } from '../dist/src/lib/governance.js';
import { todayIso } from '../dist/src/lib/id.js';

function fixture(){
  const vault=emptyVault();
  const supplier={...createSupplier(),nameEn:'Istanbul FMCG Export',nameAr:'صادرات إسطنبول'};
  vault.suppliers=[supplier];
  const rfq=createBlankDocument('rfq','RFQ-2026-0008',vault.company);
  rfq.status='final';rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
  rfq.items=[
    {...rfq.items[0],id:'req-1',descriptionEn:'Candy 50g',descriptionAr:'حلوى 50 غرام',quantity:'12.5',unit:'Carton'},
    {...rfq.items[0],id:'req-2',descriptionEn:'Cookies 200g',descriptionAr:'بسكويت 200 غرام',quantity:'6',unit:'Carton'}
  ];
  vault.documents=[rfq];
  const accepted=acceptSupplierQuotation(vault,{
    rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,expectedPurchaseOrderUpdatedAt:'',
    reference:'QUOTE-120',unitPrices:['10.5','25']
  });
  const order={...accepted.purchaseOrder,status:'final',dueDate:todayIso()};
  assert.deepEqual(validateDocument(order),{});
  const issued={...accepted.vault,documents:accepted.vault.documents.map(doc=>doc.id===order.id?order:doc)};
  const grn=confirmGoodsReceipt(issued,{
    purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
    reference:'GRN-A',receivedDate:todayIso(),quantities:['7.2','2']
  });
  return{vault:grn.vault,order,supplier};
}
function matchInput(order,extra={}){
  return {purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
    invoiceReference:'BILL-001',invoiceDate:todayIso(),dueDate:todayIso(),
    quantities:['7.2','2'],unitPrices:['10.5','25'],statedTotal:'125.60',notes:'Reviewed the supplier original',...extra};
}

test('Batch7 supplier invoice: match RFQ→quote→PO→GRN 3-way, no posting, keep immutable evidence',()=>{
  const {vault,order}=fixture(),baseline=structuredClone(vault);
  const matched=matchSupplierInvoice(vault,matchInput(order));
  assert.equal(matched.invoice.purchaseOrderId,order.id);
  assert.equal(matched.invoice.supplierId,order.supplierSnapshot.sourceSupplierId);
  assert.equal(matched.invoice.currency,'USD');
  assert.equal(matched.invoice.total,'125.60');
  assert.equal(matched.invoice.reviewedByMemberId,'owner');
  assert.equal(matched.invoice.lines.length,2);
  assert.deepEqual(matched.invoice.lines.map(line=>line.quantity),['7.2','2']);
  assert.deepEqual(matched.invoice.lines.map(line=>line.lineTotal),['75.60','50.00']);
  assert.equal(matchedSupplierInvoices(order.id,matched.vault.documentEvents).length,1);
  assert.deepEqual(supplierInvoiceLineBalances(order,matched.vault.documentEvents).map(row=>row.availableToMatch),['0','0']);
  for(const key of ['documents','purchases','supplierPayments','payments','inventoryMovements','savedItems','expenses','treasuryEntries']){
    assert.deepEqual(matched.vault[key],baseline[key],`must not change ${key}`);
  }
  assert.deepEqual(vault,baseline);
  assert.doesNotThrow(()=>assertSupplierInvoiceIntegrity(matched.vault.documents,matched.vault.documentEvents));
});

test('Batch7 supplier invoice: sequential partial bills reconcile only unbilled received quantities',()=>{
  const {vault,order}=fixture();
  const a=matchSupplierInvoice(vault,matchInput(order,{invoiceReference:'BILL-1',quantities:['3.2','0'],statedTotal:'33.60'}));
  assert.deepEqual(supplierInvoiceLineBalances(order,a.vault.documentEvents).map(x=>x.availableToMatch),['4','2']);
  const b=matchSupplierInvoice(a.vault,matchInput(order,{invoiceReference:'BILL-2',quantities:['4','2'],statedTotal:'92.00'}));
  assert.equal(matchedSupplierInvoices(order.id,b.vault.documentEvents).length,2);
  assert.deepEqual(supplierInvoiceLineBalances(order,b.vault.documentEvents).map(x=>x.availableToMatch),['0','0']);
  assert.throws(()=>matchSupplierInvoice(b.vault,matchInput(order,{invoiceReference:'BILL-3',quantities:['0.001','0'],statedTotal:'0.01'})),/exceeds goods physically received/);
});

test('Batch7 supplier invoice: duplicates, over-billing, price and total variances are rejected',()=>{
  const {vault,order}=fixture();
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{quantities:['7.2001','0'],statedTotal:'75.60'})),/exceeds goods physically received/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{unitPrices:['10.5001','25']})),/differs from the issued/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{statedTotal:'125.61'})),/does not match/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{unitPrices:['10.50001','25']})),/at most 4 decimals/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{unitPrices:['-1','25']})),/at most 4 decimals/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{quantities:['7.20001','0']})),/at most 4 decimals/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{quantities:['0','0'],statedTotal:'0'})),/At least one received/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{quantities:['1']})),/All invoice lines/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{invoiceReference:' '})),/invoice reference is required/);
  const a=matchSupplierInvoice(vault,matchInput(order));
  assert.throws(()=>matchSupplierInvoice(a.vault,matchInput(order,{invoiceReference:'bill-001',quantities:['0','0'],statedTotal:'0'})),/already been matched/);
});

test('Batch7 supplier invoice: review approvals are finance/admin/owner, not viewer/sales/purchasing',()=>{
  const {vault,order}=fixture();
  const owner=defaultOwnerMember();
  for(const role of ['viewer','sales','purchasing']){
    const member={...owner,id:role,displayName:role,role};
    const scoped={...vault,teamMembers:[owner,member],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.throws(()=>matchSupplierInvoice(scoped,matchInput(order)),/does not have permission/);
  }
  for(const role of ['owner','admin','finance']){
    const member={...owner,id:role,displayName:role,role};
    const scoped={...vault,teamMembers:[owner,member],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.equal(matchSupplierInvoice(scoped,matchInput(order)).invoice.reviewedByMemberId,role);
  }
});

test('Batch7 supplier invoice: invalid or edited PO, dates, supplier and currency all fail closed',()=>{
  const {vault,order}=fixture();
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{expectedPurchaseOrderUpdatedAt:'stale'})),/changed/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{invoiceDate:'2099-01-01'})),/Invoice date cannot/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{invoiceDate:'2000-01-01'})),/Invoice date cannot/);
  assert.throws(()=>matchSupplierInvoice(vault,matchInput(order,{dueDate:'2000-01-01'})),/due date/);
  const draft={...vault,documents:vault.documents.map(doc=>doc.id===order.id?{...doc,status:'draft'}:doc)};
  assert.throws(()=>matchSupplierInvoice(draft,matchInput(order)),/active issued/);
  const voided={...vault,documents:vault.documents.map(doc=>doc.id===order.id?{...doc,lifecycleStatus:'voided'}:doc)};
  assert.throws(()=>matchSupplierInvoice(voided,matchInput(order)),/active issued/);
  const missing={...vault,suppliers:[]};
  assert.throws(()=>matchSupplierInvoice(missing,matchInput(order)),/registered supplier/);
  const wrongCurrency={...vault,documents:vault.documents.map(doc=>doc.id===order.id?{...doc,currency:'US$'}:doc)};
  assert.throws(()=>matchSupplierInvoice(wrongCurrency,matchInput(order)),/currency is invalid/);
});

test('Batch7 supplier invoice: Eastern Arabic decimal forms normalize safely without rounding',()=>{
  const {vault,order}=fixture();
  const m=matchSupplierInvoice(vault,matchInput(order,{
    quantities:['٧٫٢','٢'],unitPrices:['١٠٫٥','٢٥'],statedTotal:'١٢٥٫٦٠'
  }));
  assert.equal(m.invoice.total,'125.60');
  assert.deepEqual(m.invoice.lines.map(x=>x.quantity),['7.2','2']);
});

test('Batch7 supplier invoice: concurrent offline matches cannot bill same receipt twice',()=>{
  const {vault,order}=fixture();
  const first=matchSupplierInvoice(vault,matchInput(order,{invoiceReference:'A'})).vault;
  const second=matchSupplierInvoice(vault,matchInput(order,{invoiceReference:'B'})).vault;
  assert.throws(()=>mergeVaultIntent(vault,first,second),/Concurrent supplier invoices exceed/);
  const smallA=matchSupplierInvoice(vault,matchInput(order,{
    invoiceReference:'A',quantities:['3.2','0'],statedTotal:'33.60'
  })).vault;
  const smallB=matchSupplierInvoice(vault,matchInput(order,{
    invoiceReference:'B',quantities:['4','2'],statedTotal:'92.00'
  })).vault;
  const merged=mergeVaultIntent(vault,smallA,smallB);
  assert.deepEqual(supplierInvoiceLineBalances(order,merged.documentEvents).map(x=>x.availableToMatch),['0','0']);
  assert.throws(()=>mergeVaultIntent(vault,smallA,matchSupplierInvoice(vault,matchInput(order,{
    invoiceReference:'a',quantities:['1','0'],statedTotal:'10.50'
  })).vault),/Duplicate supplier invoice/);
});

test('Batch7 supplier invoice: PO tampering, orphan event, tampered totals are denied on sync',()=>{
  const {vault,order}=fixture();
  const accepted=matchSupplierInvoice(vault,matchInput(order)).vault;
  const altered={...accepted,documents:accepted.documents.map(doc=>doc.id===order.id?{...doc,items:doc.items.map((item,i)=>i===0?{...item,unitPrice:'11'}:item)}:doc)};
  assert.throws(()=>assertSupplierInvoiceIntegrity(altered.documents,altered.documentEvents),/line differs/);
  const missing=accepted.documents.filter(doc=>doc.id!==order.id);
  assert.throws(()=>assertSupplierInvoiceIntegrity(missing,accepted.documentEvents),/missing PO/);
  const events=structuredClone(accepted.documentEvents);
  const last=events.at(-1);
  last.note=last.note.replace('125.60','125.61');
  assert.throws(()=>assertSupplierInvoiceIntegrity(accepted.documents,events),/total is inconsistent/);
});

test('Batch7 supplier invoice: UI integrates through serialized encrypted vault bridge',async()=>{
  const page=await readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8');
  const panel=await readFile(new URL('../src/components/SupplierInvoiceReview.tsx',import.meta.url),'utf8');
  const merge=await readFile(new URL('../src/storage/vault-merge.ts',import.meta.url),'utf8');
  assert.match(page,/mutateVaultSafely\(vault=>matchSupplierInvoice\(vault,input\)\.vault\)/);
  assert.match(page,/SupplierInvoiceReview order=\{doc\}/);
  assert.match(panel,/this\.state\.confirmed/);
  assert.match(merge,/assertSupplierInvoiceIntegrity\(documents,documentEvents\)/);
});
