import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createSupplier,supplierSnapshotFrom,purchaseTotals} from '../dist/src/lib/operations.js';
import {acceptSupplierQuotation} from '../dist/src/lib/supplier-quotation-flow.js';
import {confirmGoodsReceipt} from '../dist/src/lib/goods-receipt-flow.js';
import {matchSupplierInvoice} from '../dist/src/lib/supplier-invoice-flow.js';
import {postMatchedSupplierInvoice,assertMatchedSupplierInvoicePostingIntegrity} from '../dist/src/lib/supplier-invoice-posting.js';
import {createSupplierPayment,normalizeSupplierPayment,purchasePayableSummary,supplierPayablesByCurrency} from '../dist/src/lib/payables.js';
import {financialReportByCurrency} from '../dist/src/lib/reports.js';
import {buildAiFinanceContext} from '../dist/src/lib/ai-finance.js';
import {todayIso} from '../dist/src/lib/id.js';

function prepare(){
  const v=emptyVault(),now=new Date().toISOString();
  const supplier={...createSupplier(),nameEn:'Istanbul Export',nameAr:'صادرات إسطنبول',defaultCurrency:'USD'};
  v.suppliers=[supplier];
  const make=(id,sku,name)=>({id,sku,createdAt:now,updatedAt:now,descriptionEn:name,
    descriptionAr:name,hsCode:'',origin:'',packing:'',unit:'Carton',lastUnitPrice:'',
    lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:''});
  v.savedItems=[make('b09-in-cookie','CK-B09','Cookies 200g'),make('b09-in-candy','CN-B09','Candy 50g')];
  const rfq=createBlankDocument('rfq','RFQ-B09-001',v.company);
  rfq.status='final';rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
  rfq.items=[
    {...rfq.items[0],id:'b09-rq1',descriptionEn:'Cookies 200g',descriptionAr:'Cookies 200g',
      quantity:'12.5',unit:'Carton'},
    {...rfq.items[0],id:'b09-rq2',descriptionEn:'Candy 50g',descriptionAr:'Candy 50g',
      quantity:'6',unit:'Carton'}
  ];
  assert.deepEqual(validateDocument(rfq),{});
  v.documents=[rfq];
  const accepted=acceptSupplierQuotation(v,{rfqId:rfq.id,
    expectedRfqUpdatedAt:rfq.updatedAt,expectedPurchaseOrderUpdatedAt:'',
    reference:'SQ-B09',unitPrices:['10.5','25']});
  const order={...accepted.purchaseOrder,status:'final',dueDate:todayIso()};
  assert.deepEqual(validateDocument(order),{});
  const issued={...accepted.vault,documents:accepted.vault.documents.map(doc=>doc.id===order.id?order:doc)};
  const goods=confirmGoodsReceipt(issued,{purchaseOrderId:order.id,
    expectedPurchaseOrderUpdatedAt:order.updatedAt,reference:'GRN-B09',
    receivedDate:todayIso(),quantities:['7.2','2']}).vault;
  const matched=matchSupplierInvoice(goods,{purchaseOrderId:order.id,
    expectedPurchaseOrderUpdatedAt:order.updatedAt,invoiceReference:'SUP-B09',
    invoiceDate:todayIso(),dueDate:todayIso(),quantities:['7.2','2'],
    unitPrices:['10.5','25'],statedTotal:'125.60'});
  const event=matched.vault.documentEvents.at(-1);
  const input={purchaseOrderId:order.id,matchEventId:event.id,
    expectedPurchaseOrderUpdatedAt:order.updatedAt,
    savedItemIds:['b09-in-cookie','b09-in-candy'],confirmed:true};
  return{vault:matched.vault,order,supplier,input};
}
function salesReport(vault){
  return financialReportByCurrency(vault.documents,vault.payments,todayIso(),todayIso());
}
function salesAi(vault){
  return buildAiFinanceContext({documents:vault.documents,payments:vault.payments,
    customers:vault.customers,activeDocument:null},'financial health',todayIso()).today;
}

test('B09 procurement bridge: RFQ/GRN/matched bill are evidence; approved posting creates exactly one stock receipt and payable, not sales',()=>{
  const {vault,order,input}=prepare();
  assert.equal(vault.inventoryMovements.length,0);
  assert.equal(vault.purchases.length,0);
  assert.deepEqual(salesReport(vault),[]);
  assert.deepEqual(salesAi(vault),[]);
  const result=postMatchedSupplierInvoice(vault,input);
  assert.equal(result.posted,true);
  assert.equal(result.vault.purchases.length,1);
  assert.equal(result.vault.inventoryMovements.length,2);
  assert.deepEqual(result.vault.inventoryMovements.map(m=>m.quantity),['7.2','2']);
  assert.equal(purchaseTotals(result.purchase).landedTotal,'125.60');
  assert.equal(purchasePayableSummary(result.purchase,result.vault.supplierPayments).remaining,'125.60');
  assert.deepEqual(salesReport(result.vault),[],'supplier invoice is never customer revenue');
  assert.deepEqual(salesAi(result.vault),[],'AI must not treat payables as sales');
  assert.doesNotThrow(()=>assertMatchedSupplierInvoicePostingIntegrity(result.vault));
  assert.throws(()=>postMatchedSupplierInvoice(result.vault,input),/already been posted/);
});

test('B09 procurement bridge: supplier payment changes payable only, without affecting sales reports or quantity',()=>{
  const {vault,input,supplier}=prepare();
  const posted=postMatchedSupplierInvoice(vault,input).vault;
  const purchase=posted.purchases[0];
  const paymentDraft=createSupplierPayment(purchase,supplier,[]);
  const payment=normalizeSupplierPayment(purchase,supplier,[],{
    ...paymentDraft,amount:'25.60',reference:'WIRE-B09',date:todayIso()
  });
  const paid={...posted,supplierPayments:[payment]};
  const liability=purchasePayableSummary(purchase,paid.supplierPayments);
  assert.equal(liability.total,'125.60');
  assert.equal(liability.paid,'25.60');
  assert.equal(liability.remaining,'100.00');
  assert.equal(liability.state,'partial');
  assert.equal(supplierPayablesByCurrency(paid.purchases,paid.supplierPayments)[0].remaining,'100.00');
  assert.deepEqual(paid.inventoryMovements,posted.inventoryMovements);
  assert.deepEqual(salesReport(paid),salesReport(posted));
  assert.deepEqual(salesAi(paid),salesAi(posted));
  assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[],{
    ...paymentDraft,currency:'EUR',amount:'25.60'
  }),/currency must match/);
  assert.throws(()=>normalizeSupplierPayment(purchase,supplier,paid.supplierPayments,{
    ...paymentDraft,id:'other-b09',amount:'100.01'
  }),/cannot exceed/);
});
