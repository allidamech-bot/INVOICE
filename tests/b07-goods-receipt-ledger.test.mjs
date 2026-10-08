import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';
import { createSupplier, supplierSnapshotFrom } from '../dist/src/lib/operations.js';
import { createLinkedPurchaseOrderDraft } from '../dist/src/lib/procurement-flow.js';
import { acceptSupplierQuotation } from '../dist/src/lib/supplier-quotation-flow.js';
import { confirmGoodsReceipt, confirmedGoodsReceipts, goodsReceiptBalances, assertGoodsReceiptIntegrity } from '../dist/src/lib/goods-receipt-flow.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { defaultOwnerMember } from '../dist/src/lib/governance.js';
import { todayIso } from '../dist/src/lib/id.js';

function fixture(){
  const vault=emptyVault();
  const supplier={...createSupplier(),nameEn:'Istanbul FMCG Export',nameAr:'صادرات إسطنبول'};
  vault.suppliers=[supplier];
  const rfq=createBlankDocument('rfq','RFQ-2026-0042',vault.company);
  rfq.status='final';rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
  rfq.items=[
    {...rfq.items[0],id:'src-1',descriptionEn:'Candy 50g',descriptionAr:'حلوى 50 غرام',quantity:'12.5',unit:'Carton'},
    {...rfq.items[0],id:'src-2',descriptionEn:'Cookies 200g',descriptionAr:'بسكويت 200 غرام',quantity:'6',unit:'Carton'}
  ];
  vault.documents=[rfq];assert.deepEqual(validateDocument(rfq),{});
  const quote=acceptSupplierQuotation(vault,{rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,expectedPurchaseOrderUpdatedAt:'',
    reference:'SUP-QUO-42',unitPrices:['10.5','25'],notes:''});
  const order={...quote.purchaseOrder,status:'final',dueDate:todayIso()};
  assert.deepEqual(validateDocument(order),{});
  return {vault:{...quote.vault,documents:quote.vault.documents.map(doc=>doc.id===order.id?order:doc)},rfq,order};
}
function input(order,quantities=['7.2','0'],reference='GRN-101'){
  return {purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,reference,
    receivedDate:todayIso(),notes:'Physical stock checked',quantities};
}

test('Batch7 GRN: RFQ → accepted supplier quote → issued PO → first partial receiving; no stock or debt',()=>{
  const {vault,rfq,order}=fixture(),baseline=structuredClone(vault);
  const first=confirmGoodsReceipt(vault,input(order));
  assert.equal(first.receipt.purchaseOrderId,order.id);
  assert.equal(first.receipt.supplierId,order.supplierSnapshot.sourceSupplierId);
  assert.equal(first.receipt.receivedByMemberId,'owner');
  assert.equal(first.receipt.lines.length,1);
  assert.equal(first.receipt.lines[0].purchaseOrderLineId,order.items[0].id);
  assert.equal(first.receipt.lines[0].quantity,'7.2');
  assert.deepEqual(goodsReceiptBalances(order,first.vault.documentEvents).map(x=>[x.received,x.remaining]),[['7.2','5.3'],['0','6']]);
  assert.equal(confirmedGoodsReceipts(order.id,first.vault.documentEvents).length,1);
  assert.equal(first.vault.documents.length,2);
  assert.deepEqual(first.vault.documents,baseline.documents);
  for(const key of ['purchases','supplierPayments','payments','inventoryMovements','savedItems','expenses','treasuryEntries']){
    assert.deepEqual(first.vault[key],baseline[key],`do not post ${key}`);
  }
  assert.deepEqual(vault,baseline,'no in-place mutation');
  assert.equal(rfq.status,'final');
});

test('Batch7 GRN: second partial completes remaining quantities, no third receipt permitted',()=>{
  const {vault,order}=fixture();
  const first=confirmGoodsReceipt(vault,input(order,['7.2','2'],'GRN-101'));
  const second=confirmGoodsReceipt(first.vault,input(order,['5.3','4'],'GRN-102'));
  assert.deepEqual(goodsReceiptBalances(order,second.vault.documentEvents).map(x=>[x.ordered,x.received,x.remaining]),
    [['12.5','12.5','0'],['6','6','0']]);
  assert.equal(confirmedGoodsReceipts(order.id,second.vault.documentEvents).length,2);
  assert.throws(()=>confirmGoodsReceipt(second.vault,input(order,['0.001','0'],'GRN-103')),/exceeds/);
});

test('Batch7 GRN: duplicates, over-receipts and stale PO edits fail closed',()=>{
  const {vault,order}=fixture();
  const a=confirmGoodsReceipt(vault,input(order));
  assert.throws(()=>confirmGoodsReceipt(a.vault,input(order,['1','0'],'grn-101')),/already recorded/);
  assert.throws(()=>confirmGoodsReceipt(a.vault,input(order,['5.3001','0'],'GRN-102')),/exceeds/);
  assert.throws(()=>confirmGoodsReceipt(a.vault,input(order,['0','0'],'GRN-102')),/At least one/);
  assert.throws(()=>confirmGoodsReceipt(a.vault,input(order,['','-1'],'GRN-102')),/non-negative/);
  assert.throws(()=>confirmGoodsReceipt(a.vault,input(order,['1.00001','0'],'GRN-102')),/four decimals/);
  assert.throws(()=>confirmGoodsReceipt(a.vault,input(order,['NaN','0'],'GRN-102')),/non-negative/);
  assert.throws(()=>confirmGoodsReceipt(a.vault,input(order,['1'],'GRN-102')),/exactly match/);
  assert.throws(()=>confirmGoodsReceipt(a.vault,{...input(order),expectedPurchaseOrderUpdatedAt:'stale'}),/changed/);
  assert.throws(()=>confirmGoodsReceipt(a.vault,{...input(order),reference:'  '}),/reference is required/);
});

test('Batch7 GRN: voided, draft, malformed PO and future receipts are rejected',()=>{
  const {vault,order}=fixture();
  const draft={...vault,documents:vault.documents.map(doc=>doc.id===order.id?{...doc,status:'draft'}:doc)};
  const voided={...vault,documents:vault.documents.map(doc=>doc.id===order.id?{...doc,lifecycleStatus:'voided'}:doc)};
  assert.throws(()=>confirmGoodsReceipt(draft,input(order)),/active issued/);
  assert.throws(()=>confirmGoodsReceipt(voided,input(order)),/active issued/);
  assert.throws(()=>confirmGoodsReceipt(vault,{...input(order),receivedDate:'2099-01-01'}),/Receipt date/);
  assert.throws(()=>confirmGoodsReceipt(vault,{...input(order),receivedDate:'2000-01-01'}),/Receipt date/);
  const missing={...vault,suppliers:[]};
  assert.throws(()=>confirmGoodsReceipt(missing,input(order)),/registered supplier/);
  const altered={...vault,documents:vault.documents.map(doc=>doc.id===order.id?{...doc,dueDate:''}:doc)};
  assert.throws(()=>confirmGoodsReceipt(altered,input(order)),/invalid/);
});

test('Batch7 GRN: RBAC restricts receiving to owner/admin/purchasing',()=>{
  const {vault,order}=fixture();
  const owner=defaultOwnerMember();
  for(const role of ['viewer','sales','finance']){
    const member={...owner,id:role,displayName:role,role};
    const current={...vault,teamMembers:[owner,member],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.throws(()=>confirmGoodsReceipt(current,input(order)),/does not have permission/);
  }
  for(const role of ['owner','admin','purchasing']){
    const member={...owner,id:role,displayName:role,role};
    const current={...vault,teamMembers:[owner,member],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.equal(confirmGoodsReceipt(current,input(order)).receipt.receivedByMemberId,role);
  }
});

test('Batch7 GRN: Arabic decimal quantity normalized; stale/malformed stored events do not inflate receipts',()=>{
  const {vault,order}=fixture();
  const first=confirmGoodsReceipt(vault,input(order,['٧٫٢','٠'],'GRN-AR'));
  assert.equal(first.receipt.lines[0].quantity,'7.2');
  const badEvent={...first.vault.documentEvents.at(-1),id:'garbage',note:'@lourex:goods-receipt:confirmed:v1:{not-json'};
  const events=[...first.vault.documentEvents,badEvent];
  assert.equal(confirmedGoodsReceipts(order.id,events).length,1);
});

test('Batch7 GRN: visible purchase-order review uses serialized mutation bridge',async()=>{
  const docs=await readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8');
  const panel=await readFile(new URL('../src/components/GoodsReceiptReview.tsx',import.meta.url),'utf8');
  assert.match(docs,/mutateVaultSafely\(vault=>confirmGoodsReceipt\(vault,input\)\.vault\)/);
  assert.match(docs,/GoodsReceiptReview order=\{doc\}/);
  assert.match(panel,/this\.state\.confirmed/);
  assert.match(panel,/t\('Goods Receipts \(GRN\)','استلام البضاعة \(GRN\)'\)/);
});

test('Batch7 GRN: concurrent offline receipts beyond ordered quantity are blocked on vault merge',()=>{
  const {vault,order}=fixture();
  const left=confirmGoodsReceipt(vault,input(order,['7','0'],'GRN-L')).vault;
  const right=confirmGoodsReceipt(vault,input(order,['7','0'],'GRN-R')).vault;
  assert.equal(goodsReceiptBalances(order,left.documentEvents)[0].remaining,'5.5');
  assert.equal(goodsReceiptBalances(order,right.documentEvents)[0].remaining,'5.5');
  assert.throws(()=>mergeVaultIntent(vault,left,right),/Concurrent receipts exceed ordered quantity/);
  const within=confirmGoodsReceipt(vault,input(order,['5','0'],'GRN-R')).vault;
  const combined=mergeVaultIntent(vault,left,within);
  assert.deepEqual(goodsReceiptBalances(order,combined.documentEvents).map(x=>x.remaining),['0.5','6']);
  assert.doesNotThrow(()=>assertGoodsReceiptIntegrity(combined.documents,combined.documentEvents));
});

test('Batch7 GRN: duplicate cross-device references and mismatched PO units are rejected',()=>{
  const {vault,order}=fixture();
  const left=confirmGoodsReceipt(vault,input(order,['5','0'],'Same-Ref')).vault;
  const other=confirmGoodsReceipt(vault,input(order,['3','0'],'same-ref')).vault;
  assert.throws(()=>mergeVaultIntent(vault,left,other),/Duplicate goods receipt reference/);
  const changed={...left,documents:left.documents.map(doc=>doc.id===order.id?{...doc,items:doc.items.map((item,i)=>i===0?{...item,unit:'PCS'}:item)}:doc)};
  assert.throws(()=>assertGoodsReceiptIntegrity(changed.documents,changed.documentEvents),/mismatched PO lines/);
  const missing=left.documents.filter(doc=>doc.id!==order.id);
  assert.throws(()=>assertGoodsReceiptIntegrity(missing,left.documentEvents),/was removed/);
});
