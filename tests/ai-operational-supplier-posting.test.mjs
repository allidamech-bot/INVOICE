import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createSupplier,supplierSnapshotFrom} from '../dist/src/lib/operations.js';
import {acceptSupplierQuotation} from '../dist/src/lib/supplier-quotation-flow.js';
import {confirmGoodsReceipt} from '../dist/src/lib/goods-receipt-flow.js';
import {matchSupplierInvoice} from '../dist/src/lib/supplier-invoice-flow.js';
import {assertMatchedSupplierInvoicePostingIntegrity} from '../dist/src/lib/supplier-invoice-posting.js';
import {purchasePayableSummary} from '../dist/src/lib/payables.js';
import {defaultWarehouseId,warehouseItemQuantity} from '../dist/src/lib/warehouses.js';
import {todayIso} from '../dist/src/lib/id.js';
import {decideApprovalRequest} from '../dist/src/lib/governance.js';
import {foundationActionAllowed,prepareFoundationApproval,assertFoundationApproval} from '../dist/src/lib/ai-foundation-approval.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {isAiSupplierPostingIntent,parseAiSupplierPosting,prepareAiSupplierPosting,applyAiSupplierPosting}
 from '../dist/src/lib/ai-operational-supplier-posting.js';

function fixture(){
 const v=emptyVault(),now=new Date().toISOString();
 const supplier={...createSupplier(),nameEn:'Istanbul FMCG Export',nameAr:'صادرات إسطنبول'};
 v.suppliers=[supplier];
 const item=(id,sku,en,arabic)=>({id,sku,descriptionEn:en,descriptionAr:arabic,
  createdAt:now,updatedAt:now,hsCode:'',origin:'',packing:'',unit:'Carton',
  lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',
  usageCount:0,lastUsedAt:'',workspaceId:'default',branchId:'main'});
 v.savedItems=[item('sweet','SKU-CANDY','Candy 50g','حلوى 50 غرام'),
  item('cookie','SKU-COOKIE','Cookies 200g','بسكويت 200 غرام')];
 const rfq=createBlankDocument('rfq','RFQ-2026-0008',v.company);
 rfq.status='final';rfq.currency='USD';rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
 rfq.items=[
  {...rfq.items[0],id:'req-1',descriptionEn:'Candy 50g',descriptionAr:'حلوى 50 غرام',quantity:'12.5',unit:'Carton'},
  {...rfq.items[0],id:'req-2',descriptionEn:'Cookies 200g',descriptionAr:'بسكويت 200 غرام',quantity:'6',unit:'Carton'}
 ];
 v.documents=[rfq];
 const quote=acceptSupplierQuotation(v,{rfqId:rfq.id,expectedRfqUpdatedAt:rfq.updatedAt,
  expectedPurchaseOrderUpdatedAt:'',reference:'QUOTE-120',unitPrices:['10.5','25']});
 const order={...quote.purchaseOrder,status:'final',dueDate:todayIso()};
 assert.deepEqual(validateDocument(order),{});
 const issued={...quote.vault,documents:quote.vault.documents.map(d=>d.id===order.id?order:d)};
 const received=confirmGoodsReceipt(issued,{purchaseOrderId:order.id,
  expectedPurchaseOrderUpdatedAt:order.updatedAt,reference:'GRN-A',
  receivedDate:todayIso(),quantities:['7.2','2']});
 const matched=matchSupplierInvoice(received.vault,{
  purchaseOrderId:order.id,expectedPurchaseOrderUpdatedAt:order.updatedAt,
  invoiceReference:'BILL-001',invoiceDate:todayIso(),dueDate:todayIso(),
  quantities:['7.2','2'],unitPrices:['10.5','25'],statedTotal:'125.60',notes:'Reviewed'
 });
 const wh=matched.vault.warehouses.find(w=>w.id===defaultWarehouseId('main'));
 assert.ok(wh);
 return {vault:matched.vault,order,supplier,wh};
}
const command=f=>'جهز ترحيل فاتورة المورد '+f.order.number+
 '، المرجع BILL-001، المستودع '+f.wh.code+'، الأصناف SKU-CANDY,SKU-COOKIE';
const ctx=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Only complete exact PO/bill/primary warehouse/ordered SKU posting commands are accepted',()=>{
 const f=fixture(),s=command(f);
 assert.equal(isAiSupplierPostingIntent(s),true);
 assert.deepEqual(parseAiSupplierPosting(s),{purchaseOrderNumber:f.order.number,
  invoiceReference:'BILL-001',warehouseCode:f.wh.code,skus:['SKU-CANDY','SKU-COOKIE']});
 for(const compound of [s+' وادفع',s+' ثم اعتمد السداد',s+' and issue invoice']){
  assert.equal(parseAiSupplierPosting(compound),null);
 }
 assert.equal(parseAiSupplierPosting('جهز ترحيل فاتورة المورد '+f.order.number),null);
 assert.throws(()=>parseAiSupplierPosting(s.replace('SKU-COOKIE','SKU-CANDY')),/distinct SKU/);
});
test('Controller stages exact posting review and NO mutations; Advisor cannot stage posting',async()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const res=await orchestrateAiToolRequest({message:command(f),vault:f.vault,
  context:ctx('controller'),language:'ar'});
 assert.equal(res?.plannedBy,'local');
 assert.equal(res?.proposal?.tool,'procurement.postMatchedSupplierBill');
 assert.equal(res?.proposal?.args?.lineCount,2);
 assert.match(res.proposal.preview.join('\n'),/125.60 USD/);
 assert.match(res.proposal.preview.join('\n'),/0 → 7.2/);
 assert.match(res.proposal.preview.join('\n'),/0 → 2/);
 const advisor=await orchestrateAiToolRequest({message:command(f),vault:f.vault,
  context:ctx('advisor'),language:'ar'});
 assert.notEqual(advisor?.proposal?.tool,'procurement.postMatchedSupplierBill');
 assert.deepEqual(f.vault,before);
});
test('Signed posting generates one actual payable and exact stock receipts, never cash or a second match',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const review=prepareAiSupplierPosting(f.vault,parseAiSupplierPosting(command(f)));
 const result=applyAiSupplierPosting(f.vault,review);
 assert.equal(result.posted,true);
 assert.equal(result.approvalPending,false);
 const purchase=result.vault.purchases.find(p=>p.id===result.purchaseId);
 assert.ok(purchase);assert.equal(purchase.status,'posted');
 assert.equal(purchase.sourceSupplierInvoiceEventId,review.matchEventId);
 assert.equal(purchase.items.length,2);
 assert.equal(purchasePayableSummary(purchase,result.vault.supplierPayments).remaining,'125.60');
 assert.equal(result.vault.inventoryMovements.filter(m=>m.type==='purchase'&&m.sourceId===purchase.id).length,2);
 assert.equal(Number(warehouseItemQuantity('sweet',f.wh.id,result.vault.inventoryMovements,f.wh.id))/10000,7.2);
 assert.equal(Number(warehouseItemQuantity('cookie',f.wh.id,result.vault.inventoryMovements,f.wh.id))/10000,2);
 for(const k of ['documents','payments','supplierPayments','treasuryEntries'])
  assert.deepEqual(result.vault[k],before[k],k);
 assert.deepEqual(f.vault,before);
 assert.doesNotThrow(()=>assertMatchedSupplierInvoicePostingIntegrity(result.vault));
 assert.throws(()=>applyAiSupplierPosting(result.vault,review),/already posted|posting/);
});
test('Posting fails closed on wrong item, wrong warehouse, changed GRN, altered stock and duplicate catalogs',()=>{
 const f=fixture(),parsed=parseAiSupplierPosting(command(f));
 const review=prepareAiSupplierPosting(f.vault,parsed);
 assert.throws(()=>prepareAiSupplierPosting(f.vault,{...parsed,skus:['SKU-COOKIE','SKU-CANDY']}),/different product/);
 assert.throws(()=>prepareAiSupplierPosting(f.vault,{...parsed,warehouseCode:'SECONDARY'}),/PRIMARY/);
 const duplicated={...f.vault,savedItems:[...f.vault.savedItems,
  {...f.vault.savedItems[0],id:'clone-candy',sku:'SKU-CLONE'}]};
 assert.throws(()=>prepareAiSupplierPosting(duplicated,parsed),/Ambiguous/);
 const branch={...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}};
 assert.throws(()=>applyAiSupplierPosting(branch,review),/scope changed/);
 const stock={...f.vault,inventoryMovements:[...f.vault.inventoryMovements,
  {id:'outside-stock',itemId:'sweet',type:'opening',quantity:'1',date:todayIso(),
   sourceId:'',sourceNumber:'',createdAt:new Date().toISOString()}]};
 assert.throws(()=>applyAiSupplierPosting(stock,review),/changed/);
 const changed={...f.vault,documents:f.vault.documents.map(x=>x.id===f.order.id?{...x,updatedAt:'2099-01-01T00:00:00.000Z'}:x)};
 assert.throws(()=>applyAiSupplierPosting(changed,review));
});
test('Enabled purchase policy remains a second independent gate: NOT POSTED until approved',()=>{
 const f=fixture(),policy={...f.vault,
  approvalPolicies:f.vault.approvalPolicies.map(p=>p.action==='post-purchase'?{...p,enabled:true}:p)};
 const review=prepareAiSupplierPosting(policy,parseAiSupplierPosting(command(f)));
 const pending=applyAiSupplierPosting(policy,review);
 assert.equal(pending.posted,false);
 assert.equal(pending.approvalPending,true);
 assert.equal(pending.vault.purchases.length,0);
 assert.equal(pending.vault.inventoryMovements.length,0);
 assert.equal(pending.vault.approvalRequests.length,1);
 const approved=decideApprovalRequest(pending.vault,pending.vault.approvalRequests[0].id,'approved');
 const fresh=prepareAiSupplierPosting(approved,parseAiSupplierPosting(command(f)));
 const posted=applyAiSupplierPosting(approved,fresh);
 assert.equal(posted.posted,true);
 assert.equal(posted.vault.purchases.length,1);
});
test('Only owner/admin can sign exact vendor bill posting, not finance/purchasing/sales/viewer',async()=>{
 const f=fixture(),review=prepareAiSupplierPosting(f.vault,parseAiSupplierPosting(command(f)));
 const proposal={capability:'tool.execute',tool:'procurement.postMatchedSupplierBill',
  args:review,label:'Post supplier bill',rationale:'Explicit stock and payable'};
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'supplier-post'};
 for(const role of ['owner','admin']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),true);
  const signed={...proposal,foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
  assert.doesNotThrow(()=>assertFoundationApproval(vault,signed));
  assert.throws(()=>assertFoundationApproval(vault,{...signed,args:{...review,total:'9999.00'}}),/payload changed/);
 }
 for(const role of ['finance','purchasing','sales','viewer']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),false,role);
  assert.throws(()=>prepareAiSupplierPosting(vault,parseAiSupplierPosting(command(f))));
 }
 const actions=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(actions,/Independent signed owner\/admin approval is required/);
 assert.match(actions,/applyAiSupplierPosting\(vault,review\)/);
});
