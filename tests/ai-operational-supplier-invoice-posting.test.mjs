import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createSupplier,supplierSnapshotFrom,purchaseTotals,inventoryBalances} from '../dist/src/lib/operations.js';
import {acceptSupplierQuotation} from '../dist/src/lib/supplier-quotation-flow.js';
import {confirmGoodsReceipt} from '../dist/src/lib/goods-receipt-flow.js';
import {matchSupplierInvoice} from '../dist/src/lib/supplier-invoice-flow.js';
import {invoicePostingForMatch} from '../dist/src/lib/supplier-invoice-posting.js';
import {purchasePayableSummary} from '../dist/src/lib/payables.js';
import {foundationActionAllowed,prepareFoundationApproval,assertFoundationApproval} from '../dist/src/lib/ai-foundation-approval.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {todayIso} from '../dist/src/lib/id.js';
import {parseAiMatchedBillPosting,isAiMatchedBillPostingIntent,
 prepareAiMatchedBillPosting,applyAiMatchedBillPosting} from '../dist/src/lib/ai-operational-supplier-invoice-posting.js';

function fixture(){
 const first=emptyVault(),now=new Date().toISOString();
 const supplier={...createSupplier(),nameEn:'Istanbul Export',nameAr:'مورد إسطنبول',defaultCurrency:'USD'};
 const items=[
  {id:'stock-cookies',createdAt:now,updatedAt:now,sku:'CK-200',
   descriptionEn:'Cookies 200g',descriptionAr:'بسكويت',hsCode:'',origin:'',packing:'',
   unit:'Carton',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:''},
  {id:'stock-candy',createdAt:now,updatedAt:now,sku:'CN-50',
   descriptionEn:'Candy 50g',descriptionAr:'حلوى',hsCode:'',origin:'',packing:'',
   unit:'Carton',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:''}
 ];
 first.suppliers=[supplier];first.savedItems=items;
 const rfq=createBlankDocument('rfq','RFQ-2026-111',first.company);
 rfq.status='final';rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
 rfq.items=[
  {...rfq.items[0],id:'rq-one',descriptionEn:'Cookies 200g',quantity:'12.5',unit:'Carton'},
  {...rfq.items[0],id:'rq-two',descriptionEn:'Candy 50g',quantity:'6',unit:'Carton'}
 ];
 first.documents=[rfq];
 const accepted=acceptSupplierQuotation(first,{rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,
  expectedPurchaseOrderUpdatedAt:'',reference:'SQ-111',unitPrices:['10.5','25']});
 const order={...accepted.purchaseOrder,status:'final',dueDate:todayIso()};
 let vault={...accepted.vault,documents:accepted.vault.documents.map(d=>d.id===order.id?order:d)};
 vault=confirmGoodsReceipt(vault,{purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
  reference:'GRN-111',receivedDate:todayIso(),quantities:['7.2','2']}).vault;
 vault=matchSupplierInvoice(vault,{purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
  invoiceReference:'BILL-001',invoiceDate:todayIso(),dueDate:todayIso(),
  quantities:['7.2','2'],unitPrices:['10.5','25'],statedTotal:'125.60'}).vault;
 return{vault,order,supplier,items,match:vault.documentEvents.at(-1)};
}
function command(order,skus='CK-200,CN-50'){
 return 'رحّل فاتورة المورد المطابقة لأمر الشراء '+order.number+
  '، مرجع الفاتورة BILL-001، أكواد SKU بالترتيب '+skus;
}
const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'vendor-post-test'};
const ctx=mode=>({conversationMode:mode,assistantRuntime:scope});

test('Exact Arabic/English matched bill posting parses every ordered SKU and refuses compound commands',()=>{
 const f=fixture(),message=command(f.order);
 assert.equal(isAiMatchedBillPostingIntent(message),true);
 assert.deepEqual(parseAiMatchedBillPosting(message),{
  purchaseOrderNumber:f.order.number,invoiceReference:'BILL-001',skus:['CK-200','CN-50']
 });
 const en='post matched supplier invoice for '+f.order.number+
  ', reference BILL-001, SKUs in order CK-200,CN-50';
 assert.deepEqual(parseAiMatchedBillPosting(en),parseAiMatchedBillPosting(message));
 for(const bad of [message+' ثم سدّد المورد',message+' and pay it',
  command(f.order,'CK-200,CK-200'),
  command(f.order,'CK-200,CN-50,STOCK-EXTRA')+' and delete PO']){
  assert.equal(parseAiMatchedBillPosting(bad),null,'compound or incomplete instruction blocked');
 }
});

test('Controller proposes exact posting without writing; Advisor stages no posting',async()=>{
 const f=fixture(),before=structuredClone(f.vault),request=command(f.order);
 const controller=await orchestrateAiToolRequest({message:request,vault:f.vault,context:ctx('controller'),language:'ar'});
 assert.equal(controller?.plannedBy,'local');
 assert.equal(controller?.proposal?.tool,'procurement.postMatchedSupplierBill');
 assert.deepEqual(controller?.proposal?.args?.savedItemIds,['stock-cookies','stock-candy']);
 assert.equal(controller?.proposal?.args?.invoiceTotal,'125.60');
 assert.match(controller?.proposal?.preview.join('\n'),/Stock: 0 -> 7.2/);
 assert.match(controller?.proposal?.preview.join('\n'),/accounts payable: \+125.60 USD/);
 assert.deepEqual(f.vault,before);
 const advisor=await orchestrateAiToolRequest({message:request,vault:f.vault,context:ctx('advisor'),language:'ar'});
 assert.notEqual(advisor?.proposal?.tool,'procurement.postMatchedSupplierBill');
 assert.deepEqual(f.vault,before);
});

test('Fresh signed review posts exactly one purchase, stock and payable; no payment and no GRN duplication',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const request=parseAiMatchedBillPosting(command(f.order));
 const review=prepareAiMatchedBillPosting(f.vault,request);
 assert.equal(review.preview.some(line=>line.includes('Stock: 0 -> 2')),true);
 const outcome=applyAiMatchedBillPosting(f.vault,review);
 assert.equal(outcome.posted,true);
 assert.equal(outcome.approvalPending,false);
 const purchase=outcome.vault.purchases.find(p=>p.id===outcome.purchaseId);
 assert.equal(purchase.status,'posted');
 assert.equal(purchase.sourceSupplierInvoiceEventId,f.match.id);
 assert.equal(purchaseTotals(purchase).landedTotal,'125.60');
 assert.equal(purchasePayableSummary(purchase,outcome.vault.supplierPayments).remaining,'125.60');
 assert.equal(outcome.vault.inventoryMovements.length,2);
 assert.deepEqual(inventoryBalances(outcome.vault.savedItems,outcome.vault.inventoryMovements)
  .filter(x=>['stock-cookies','stock-candy'].includes(x.item.id)).map(x=>x.quantity),['7.2','2']);
 assert.equal(outcome.vault.supplierPayments.length,0);
 assert.equal(outcome.vault.payments.length,before.payments.length);
 assert.equal(outcome.vault.documents.length,before.documents.length);
 assert.deepEqual(f.vault,before,'review and posting must not modify caller vault');
 assert.equal(invoicePostingForMatch(f.match.id,outcome.vault.documentEvents)?.purchaseId,purchase.id);
 assert.throws(()=>prepareAiMatchedBillPosting(outcome.vault,request),/already been posted/i);
});

test('Stale review, missing mapped SKU, duplicate catalog SKU, changed role, scope or supplier evidence all fail closed',()=>{
 const f=fixture(),request=parseAiMatchedBillPosting(command(f.order)),review=prepareAiMatchedBillPosting(f.vault,request);
 assert.throws(()=>prepareAiMatchedBillPosting(f.vault,{...request,skus:['CK-200']}),/Every matched invoice line/);
 assert.throws(()=>prepareAiMatchedBillPosting(f.vault,{...request,skus:['CK-200','MISSING']}),/exactly one active/);
 assert.throws(()=>prepareAiMatchedBillPosting(f.vault,{...request,skus:['CK-200','CK-200']}),/unique/);
 const duplicated={...f.vault,savedItems:[...f.vault.savedItems,{...f.vault.savedItems[0],id:'same-sku'}]};
 assert.throws(()=>prepareAiMatchedBillPosting(duplicated,request),/exactly one active/);
 const changedStock={...f.vault,savedItems:f.vault.savedItems.map((item,i)=>i===0?{...item,descriptionEn:'Renamed'}:item)};
 assert.throws(()=>applyAiMatchedBillPosting(changedStock,review),/changed/);
 const switched={...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}};
 assert.throws(()=>applyAiMatchedBillPosting(switched,review),/scope changed/);
 const role={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'finance'}]};
 assert.throws(()=>applyAiMatchedBillPosting(role,review),/permission/);
 const invoiceChanged={...f.vault,documentEvents:f.vault.documentEvents.filter(e=>e.id!==f.match.id)};
 assert.throws(()=>applyAiMatchedBillPosting(invoiceChanged,review),/previously matched/);
});

test('Purchasing/owner/admin approve signed posting; finance, sales and viewer cannot; tampering rejected',()=>{
 const f=fixture(),review=prepareAiMatchedBillPosting(f.vault,parseAiMatchedBillPosting(command(f.order)));
 const proposal={capability:'tool.execute',tool:'procurement.postMatchedSupplierBill',
  args:review,label:'Supplier invoice posting',rationale:'Exact GRN and payable'};
 for(const role of ['owner','admin','purchasing']){
  const v={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(v,proposal,scope),true,role);
  const signed={...proposal,foundationApproval:prepareFoundationApproval(v,proposal,scope)};
  assert.doesNotThrow(()=>assertFoundationApproval(v,signed));
  assert.throws(()=>assertFoundationApproval(v,{...signed,args:{...review,invoiceTotal:'999.00'}}),/payload changed/);
 }
 for(const role of ['finance','sales','viewer']){
  const v={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(v,proposal,scope),false,role);
 }
});

test('Optional manual governance policy remains a second explicit gate, not a silent posting',()=>{
 const f=fixture(),gated={...f.vault,
  approvalPolicies:f.vault.approvalPolicies.map(p=>p.action==='post-purchase'?{...p,enabled:true}:p)};
 const review=prepareAiMatchedBillPosting(gated,parseAiMatchedBillPosting(command(f.order)));
 const result=applyAiMatchedBillPosting(gated,review);
 assert.equal(result.posted,false);
 assert.equal(result.approvalPending,true);
 assert.equal(result.vault.purchases.length,0);
 assert.equal(result.vault.inventoryMovements.length,0);
 assert.equal(result.vault.approvalRequests.filter(p=>p.status==='pending'&&p.action==='post-purchase').length,1);
});

test('Posting execution routes only through independent signed approval and one serialized mutation',async()=>{
 const actions=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 const planner=await readFile(new URL('../src/lib/ai-tool-orchestrator.ts',import.meta.url),'utf8');
 assert.match(actions,/A separately signed matched vendor bill posting approval is required/);
 assert.match(actions,/assertFoundationApproval\(vault,proposal\)/);
 assert.match(actions,/applyAiMatchedBillPosting\(vault,review\)\.vault/);
 assert.match(actions,/invoicePostingForMatch\(review\.matchEventId,saved\.documentEvents\)/);
 assert.match(planner,/procurement\.postMatchedSupplierBill/);
});
