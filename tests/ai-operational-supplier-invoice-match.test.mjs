import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createSupplier,supplierSnapshotFrom} from '../dist/src/lib/operations.js';
import {acceptSupplierQuotation} from '../dist/src/lib/supplier-quotation-flow.js';
import {confirmGoodsReceipt} from '../dist/src/lib/goods-receipt-flow.js';
import {matchedSupplierInvoices,matchSupplierInvoice,supplierInvoiceLineBalances} from '../dist/src/lib/supplier-invoice-flow.js';
import {todayIso} from '../dist/src/lib/id.js';
import {foundationActionAllowed,prepareFoundationApproval,assertFoundationApproval} from '../dist/src/lib/ai-foundation-approval.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {isAiSupplierInvoiceMatchIntent,parseAiSupplierInvoiceMatchRequest,prepareAiSupplierInvoiceMatch,applyAiSupplierInvoiceMatchApproval} from '../dist/src/lib/ai-operational-supplier-invoice-match.js';

function fixture(){
 const v=emptyVault(),supplier={...createSupplier(),nameEn:'Istanbul Supplier',nameAr:'مورد إسطنبول'};
 v.suppliers=[supplier];
 const rfq=createBlankDocument('rfq','RFQ-2026-0008',v.company);
 rfq.status='final';rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
 rfq.items=[
  {...rfq.items[0],id:'req-1',descriptionEn:'Candy 50g',descriptionAr:'حلوى',quantity:'12.5',unit:'Carton'},
  {...rfq.items[0],id:'req-2',descriptionEn:'Cookies 200g',descriptionAr:'بسكويت',quantity:'6',unit:'Carton'}
 ];
 v.documents=[rfq];
 const quoted=acceptSupplierQuotation(v,{rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,
  expectedPurchaseOrderUpdatedAt:'',reference:'QUOTE-120',unitPrices:['10.5','25']});
 const order={...quoted.purchaseOrder,status:'final',dueDate:todayIso()};
 assert.deepEqual(validateDocument(order),{});
 const issued={...quoted.vault,documents:quoted.vault.documents.map(d=>d.id===order.id?order:d)};
 const grn=confirmGoodsReceipt(issued,{purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
  reference:'GRN-A',receivedDate:todayIso(),quantities:['7.2','2']});
 return{vault:grn.vault,order,supplier};
}
const request=(po='PO-RFQ-2026-0008',extra='')=>
 'طابق فاتورة المورد لأمر الشراء '+po+' المرجع BILL-001 التاريخ '+todayIso()+
 ' الاستحقاق '+todayIso()+' الكميات 7.2,2 الأسعار 10.5,25 الإجمالي 125.60'+extra;
const ctx=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Supplier bill parser uses an exact PO and all explicitly labeled amounts; no implicit posting',()=>{
 const f=fixture(),input=request(f.order.number);
 assert.equal(isAiSupplierInvoiceMatchIntent(input),true);
 assert.deepEqual(parseAiSupplierInvoiceMatchRequest(input),{
  purchaseOrderNumber:f.order.number,invoiceReference:'BILL-001',invoiceDate:todayIso(),
  dueDate:todayIso(),quantities:['7.2','2'],unitPrices:['10.5','25'],statedTotal:'125.60'
 });
 for(const msg of [input+' وادفع للمورد',input+' واصدر قيد المخزون',
  'match supplier invoice '+f.order.number+' and post stock']){
  assert.throws(()=>parseAiSupplierInvoiceMatchRequest(msg),/cannot combine/);
 }
 assert.equal(parseAiSupplierInvoiceMatchRequest('طابق فاتورة المورد '+f.order.number),null);
 assert.equal(parseAiSupplierInvoiceMatchRequest(input.replace('الكميات 7.2,2','')),null);
 assert.equal(parseAiSupplierInvoiceMatchRequest(input+' و PO-2026-9999'),null);
});
test('Controller prepares entire three-way supplier bill, Advisor stages no action',async()=>{
 const f=fixture(),message=request(f.order.number),before=structuredClone(f.vault);
 const result=await orchestrateAiToolRequest({message,vault:f.vault,context:ctx('controller'),language:'ar'});
 assert.equal(result.plannedBy,'local');
 assert.equal(result.proposal?.tool,'procurement.matchSupplierBill');
 assert.equal(result.proposal?.args?.purchaseOrderId,f.order.id);
 assert.equal(result.proposal?.preview?.length,7);
 assert.match(result.answer,/موافقة منفصلة/);
 const advisor=await orchestrateAiToolRequest({message,vault:f.vault,context:ctx('advisor'),language:'ar'});
 assert.notEqual(advisor?.proposal?.tool,'procurement.matchSupplierBill');
 assert.deepEqual(f.vault,before);
});
test('Signed matching records vendor bill evidence only: no payable, stock, purchase or payment',()=>{
 const f=fixture(),before=structuredClone(f.vault),parsed=parseAiSupplierInvoiceMatchRequest(request(f.order.number));
 const review=prepareAiSupplierInvoiceMatch(f.vault,parsed);
 assert.equal(review.preview.length,7);
 assert.match(review.preview.join('\n'),/Physically received\/unbilled 7.2/);
 const applied=applyAiSupplierInvoiceMatchApproval(f.vault,review);
 const matches=matchedSupplierInvoices(f.order.id,applied.vault.documentEvents);
 assert.equal(matches.length,1);
 assert.equal(matches[0].total,'125.60');
 assert.equal(matches[0].lines.length,2);
 assert.deepEqual(supplierInvoiceLineBalances(f.order,applied.vault.documentEvents).map(row=>row.availableToMatch),['0','0']);
 for(const k of ['documents','purchases','supplierPayments','payments','inventoryMovements','treasuryEntries','savedItems'])
  assert.deepEqual(applied.vault[k],before[k],k);
 assert.deepEqual(f.vault,before);
 assert.throws(()=>applyAiSupplierInvoiceMatchApproval(applied.vault,review),/already been matched/);
});
test('Matched bill review fails closed on stale quantities, supplier, PO revision, scope or role',()=>{
 const f=fixture(),parsed=parseAiSupplierInvoiceMatchRequest(request(f.order.number));
 const review=prepareAiSupplierInvoiceMatch(f.vault,parsed);
 const wrongTotal={...parsed,statedTotal:'125.61'};
 assert.throws(()=>prepareAiSupplierInvoiceMatch(f.vault,wrongTotal),/total does not match/);
 const wrongQty={...parsed,quantities:['7.3','2'],statedTotal:'126.65'};
 assert.throws(()=>prepareAiSupplierInvoiceMatch(f.vault,wrongQty),/exceeds goods physically received/);
 const alteredOrder={...f.vault,documents:f.vault.documents.map(d=>d.id===f.order.id?{...d,updatedAt:'2099-01-01T00:00:00.000Z'}:d)};
 assert.throws(()=>applyAiSupplierInvoiceMatchApproval(alteredOrder,review));
 const alteredBranch={...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}};
 assert.throws(()=>applyAiSupplierInvoiceMatchApproval(alteredBranch,review),/scope changed/);
 const viewer={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]};
 assert.throws(()=>applyAiSupplierInvoiceMatchApproval(viewer,review));
 const otherReceipt=confirmGoodsReceipt(f.vault,{purchaseOrderId:f.order.id,
   expectedPurchaseOrderUpdatedAt:f.order.updatedAt,reference:'GRN-B',receivedDate:todayIso(),
   quantities:['1','0']}).vault;
 assert.throws(()=>applyAiSupplierInvoiceMatchApproval(otherReceipt,review),/changed/);
});
test('Matching requires signed finance/owner approval for exactly the reviewed payload',async()=>{
 const f=fixture(),parsed=parseAiSupplierInvoiceMatchRequest(request(f.order.number));
 const review=prepareAiSupplierInvoiceMatch(f.vault,parsed);
 const proposal={capability:'tool.execute',tool:'procurement.matchSupplierBill',args:review,
  label:'Review supplier invoice',rationale:'3 way matching; no posting'};
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'supplier-invoice'};
 for(const role of ['owner','finance']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),true);
  const signed={...proposal,foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
  assert.doesNotThrow(()=>assertFoundationApproval(vault,signed));
  assert.throws(()=>assertFoundationApproval(vault,{...signed,args:{...review,statedTotal:'1'}}),/payload changed/);
 }
 for(const role of ['sales','viewer','purchasing']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),false);
 }
 const actions=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(actions,/A signed vendor bill three-way matching approval is required/);
 assert.match(actions,/applyAiSupplierInvoiceMatchApproval\(vault,review\)/);
});
