import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createSupplier,supplierSnapshotFrom} from '../dist/src/lib/operations.js';
import {todayIso} from '../dist/src/lib/id.js';
import {confirmedGoodsReceipts} from '../dist/src/lib/goods-receipt-flow.js';
import {createDocumentEvent} from '../dist/src/lib/document-lifecycle.js';
import {prepareFoundationApproval,assertFoundationApproval,foundationActionAllowed} from '../dist/src/lib/ai-foundation-approval.js';
import {isAiGoodsReceiptRequest,parseAiGoodsReceiptRequest,prepareAiGoodsReceiptReview,applyAiGoodsReceiptApproval} from '../dist/src/lib/ai-operational-goods-receipt.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

const poNumber='PO-2026-0041';
function fixture(){
 const vault=emptyVault();
 const supplier={...createSupplier(),nameEn:'Verified Supplier',nameAr:'مورد معتمد'};
 vault.suppliers=[supplier];
 const order=createBlankDocument('purchase-order',poNumber,vault.company);
 order.status='final';order.language='bilingual';order.currency='USD';
 order.supplierSnapshot=supplierSnapshotFrom(supplier);order.dueDate=todayIso();
 order.items=[
  {...order.items[0],id:'po-line-1',descriptionEn:'Red Bull 250 ml',descriptionAr:'ريد بول',quantity:'10',unit:'CTN',unitPrice:'20'},
  {...order.items[0],id:'po-line-2',descriptionEn:'Monster 500 ml',descriptionAr:'مونستر',quantity:'6',unit:'CTN',unitPrice:'22'}
 ];
 vault.documents=[order];
 assert.deepEqual(validateDocument(order),{});
 return{vault,order};
}
const command=(date=todayIso(),qty='4,0',ref='GRN-101')=>
 'سجّل استلام بضاعة لأمر الشراء '+poNumber+'، المرجع '+ref+'، التاريخ '+date+'، الكميات '+qty;
const context=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('GRN parser requires exact PO, reference, receipt date and every physical quantity',()=>{
 const req=parseAiGoodsReceiptRequest(command());
 assert.deepEqual(req,{purchaseOrderNumber:poNumber,reference:'GRN-101',receivedDate:todayIso(),quantities:['4','0']});
 const en=parseAiGoodsReceiptRequest('Record goods receipt for purchase order '+poNumber+'; reference GRN-22; date '+todayIso()+'; quantities 4,0');
 assert.deepEqual(en.quantities,['4','0']);
 assert.equal(isAiGoodsReceiptRequest(command()),true);
 for(const msg of ['سجّل استلام بضاعة PO-2026-0041',
  'سجّل استلام بضاعة PO-2026-0041 واعتمد إصدار فاتورة المورد',
  'Record goods receipt '+poNumber+' and post stock to inventory']){
  const action=()=>parseAiGoodsReceiptRequest(msg);
  if(/اعتمد|post/.test(msg))assert.throws(action,/cannot be combined/);
  else assert.equal(action(),null);
 }
});
test('Controller stages exact purchase-order goods receipt review; Advisor stages nothing',async()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const controller=await orchestrateAiToolRequest({message:command(),vault:f.vault,context:context('controller'),language:'ar'});
 assert.equal(controller?.plannedBy,'local');
 assert.equal(controller?.proposal?.capability,'tool.execute');
 assert.equal(controller?.proposal?.tool,'procurement.recordGoodsReceipt');
 assert.equal(controller?.proposal?.args?.quantities?.length,2);
 assert.equal(controller?.proposal?.args?.preview?.length,6);
 assert.match(controller.answer,/موافقة مستقلة/);
 assert.deepEqual(f.vault,before);
 const advisor=await orchestrateAiToolRequest({message:command(),vault:f.vault,context:context('advisor'),language:'ar'});
 assert.equal(advisor?.proposal?.tool==='procurement.recordGoodsReceipt',false);
 assert.deepEqual(f.vault,before);
});
test('Approved GRN stores exact partial receipt evidence without creating stock postings or accounts payable',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const review=prepareAiGoodsReceiptReview(f.vault,parseAiGoodsReceiptRequest(command()));
 assert.equal(review.preview.length,6);
 assert.match(review.preview.join('\n'),/To receive: 4/);
 assert.match(review.preview.join('\n'),/To receive: 0/);
 const res=applyAiGoodsReceiptApproval(f.vault,review);
 const receipts=confirmedGoodsReceipts(f.order.id,res.vault.documentEvents);
 assert.equal(receipts.length,1);
 assert.equal(receipts[0].reference,'GRN-101');
 assert.deepEqual(receipts[0].lines.map(x=>x.quantity),['4']);
 for(const key of ['inventoryMovements','purchases','supplierPayments','payments','savedItems','treasuryEntries','documents'])
   assert.deepEqual(res.vault[key],before[key],key+' must remain unchanged');
 assert.deepEqual(f.vault,before);
 assert.throws(()=>applyAiGoodsReceiptApproval(res.vault,review),/already recorded|changed|duplicate|reference/i);
});
test('Preflight rejects over-receipt, missing counts, bad dates and unknown PO without writing',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 for(const data of [
  {purchaseOrderNumber:poNumber,reference:'GRN-1',receivedDate:todayIso(),quantities:['11','0']},
  {purchaseOrderNumber:poNumber,reference:'GRN-1',receivedDate:todayIso(),quantities:['0']},
  {purchaseOrderNumber:poNumber,reference:'GRN-1',receivedDate:'2027-01-01',quantities:['4','0']},
  {purchaseOrderNumber:'PO-2026-9999',reference:'GRN-1',receivedDate:todayIso(),quantities:['4','0']}
 ])assert.throws(()=>prepareAiGoodsReceiptReview(f.vault,data));
 assert.deepEqual(f.vault,before);
});
test('GRN review is invalidated by concurrent receipt, order revision, company/branch or role change',()=>{
 const {vault,order}=fixture();
 const review=prepareAiGoodsReceiptReview(vault,parseAiGoodsReceiptRequest(command()));
 const other=prepareAiGoodsReceiptReview(vault,parseAiGoodsReceiptRequest(command(todayIso(),'1,0','GRN-102')));
 const after=applyAiGoodsReceiptApproval(vault,other).vault;
 assert.throws(()=>applyAiGoodsReceiptApproval(after,review),/changed since review/);
 const changed={...vault,documents:[{...order,updatedAt:'2099-01-01T00:00:00.000Z'}]};
 assert.throws(()=>applyAiGoodsReceiptApproval(changed,review));
 const otherBranch={...vault,appSettings:{...vault.appSettings,activeBranchId:'other'}};
 assert.throws(()=>applyAiGoodsReceiptApproval(otherBranch,review),/branch changed/);
 const viewer={...vault,teamMembers:[{...vault.teamMembers[0],role:'viewer'}]};
 assert.throws(()=>applyAiGoodsReceiptApproval(viewer,review));
});
test('Signed GRN proposal permits purchasing but rejects sales and tampering',async()=>{
 const f=fixture(),review=prepareAiGoodsReceiptReview(f.vault,parseAiGoodsReceiptRequest(command()));
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'grn-fixture'};
 const proposal={capability:'tool.execute',tool:'procurement.recordGoodsReceipt',args:review,
  label:'Record GRN',rationale:'Exact physical receiving counts'};
 for(const role of ['owner','purchasing']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),true);
  const envelope=prepareFoundationApproval(vault,proposal,scope);
  const signed={...proposal,foundationApproval:envelope};
  assert.doesNotThrow(()=>assertFoundationApproval(vault,signed));
  assert.throws(()=>assertFoundationApproval(vault,{...signed,args:{...review,reference:'GRN-OTHER'}}),/payload changed/);
 }
 const sales={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'sales'}]};
 assert.equal(foundationActionAllowed(sales,proposal,scope),false);
 const actions=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(actions,/if\(!proposal\.foundationApproval\)throw new Error\('A signed physical goods receipt approval is required/);
 assert.match(actions,/assertFoundationApproval\(vault,proposal\)/);
 assert.match(actions,/applyAiGoodsReceiptApproval\(vault,review\)/);
});

test('Corrupted prior physical receipt proof blocks a new GRN rather than allowing silent over-receipt',()=>{
 const f=fixture(),row=createDocumentEvent(f.order,'audit',
   '@lourex:goods-receipt:confirmed:v1:{"purchaseOrderId":"tampered","reference":"DUPLICATE"}');
 const vault={...f.vault,documentEvents:[...f.vault.documentEvents,row]};
 assert.throws(()=>prepareAiGoodsReceiptReview(vault,parseAiGoodsReceiptRequest(command())));
 assert.equal(vault.inventoryMovements.length,0);
});
test('Saved GRN receipt verification matches exact PO, supplier, reference and date, never substring',async()=>{
 const actions=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(actions,/confirmedGoodsReceipts\(review\.purchaseOrderId,saved\.documentEvents\)/);
 assert.match(actions,/row\.reference===review\.reference/);
 assert.match(actions,/row\.supplierId===review\.supplierId/);
});
