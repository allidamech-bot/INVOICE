import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createSupplier,supplierSnapshotFrom} from '../dist/src/lib/operations.js';
import {prepareOperationalPoFromRfq,applyOperationalPoDraftApproval,
 operationalPoDraftRequested,requestedPoRfqNumber} from '../dist/src/lib/ai-operational-po-draft.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {confirmedGoodsReceipts} from '../dist/src/lib/goods-receipt-flow.js';

const request='أنشئ مسودة أمر شراء من طلب عرض السعر RFQ-2026-0001';
function fixture(){
 const vault=emptyVault();
 const supplier={...createSupplier(),nameEn:'Turkish FMCG Supplier',nameAr:'مورد تركيا',defaultCurrency:'USD'};
 vault.suppliers=[supplier];
 const rfq=createBlankDocument('rfq','RFQ-2026-0001',vault.company);
 rfq.workspaceId='default';rfq.branchId='main';rfq.status='final';
 rfq.currency='USD';rfq.language='bilingual';
 rfq.supplierSnapshot=supplierSnapshotFrom(supplier);
 rfq.items=[{...rfq.items[0],id:'line-1',descriptionEn:'Monster 500 ml',descriptionAr:'',quantity:'300',unit:'Carton',unitPrice:''},
  {...rfq.items[0],id:'line-2',descriptionEn:'Red Bull 250 ml',descriptionAr:'',quantity:'400',unit:'Carton',unitPrice:''}];
 vault.documents=[rfq];assert.deepEqual(validateDocument(rfq),{});
 return{vault,rfq,supplier};
}
const context=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Operational PO command recognizes exact single sourced RFQ; rejects high impact or missing source',()=>{
 for(const q of [request,'prepare purchase order from RFQ-2026-0001',
 'جهّز أمر شراء RFQ-٢٠٢٦-٠٠٠١']){
  assert.equal(operationalPoDraftRequested(q),true,q);
  assert.equal(requestedPoRfqNumber(q),'RFQ-2026-0001');
 }
 for(const q of ['اعتمد أمر الشراء RFQ-2026-0001','أنشئ أمر شراء ثم أصدره من RFQ-2026-0001',
 'افتح PDF أمر الشراء PO-2026-0001']){
  assert.equal(operationalPoDraftRequested(q),false,q);
 }
 assert.equal(requestedPoRfqNumber('أنشئ أمر شراء من RFQ-2026-0001 و RFQ-2026-0002'),null);
});
test('User explicit Controller RFQ command stages full PO preview; no save before approval',async()=>{
 const {vault}=fixture(),before=structuredClone(vault);
 const result=await orchestrateAiToolRequest({message:request,vault,context:context('controller'),language:'ar'});
 assert.ok(result);
 assert.equal(result.plannedBy,'local');
 assert.equal(result.plan.calls.length,1);
 assert.equal(result.proposal?.capability,'tool.execute');
 assert.equal(result.proposal?.tool,'procurement.createPoFromRfq');
 assert.equal(result.proposal?.args?.sourceNumber,'RFQ-2026-0001');
 assert.equal(result.proposal?.args?.lineCount,2);
 assert.equal(result.proposal?.preview?.length,7);
 assert.deepEqual(vault,before);
 assert.equal(vault.documents.length,1);
 assert.equal(vault.inventoryMovements.length,0);
});
test('PO draft approval uses existing linked conversion without receiving, posting, billing or losing lines',()=>{
 const {vault,rfq}=fixture(),before=structuredClone(vault);
 const review=prepareOperationalPoFromRfq(vault,rfq.number);
 assert.equal(review.preview.length,7);
 const next=applyOperationalPoDraftApproval(vault,review);
 const po=next.document;
 assert.equal(po.kind,'purchase-order');
 assert.equal(po.status,'draft');
 assert.deepEqual(po.items.map(row=>row.quantity),['300','400']);
 assert.deepEqual(po.items.map(row=>row.unitPrice),['','']);
 assert.equal(po.supplierSnapshot.sourceSupplierId,rfq.supplierSnapshot.sourceSupplierId);
 assert.equal(next.vault.documentEvents.at(-1).relatedDocumentId,rfq.id);
 assert.equal(confirmedGoodsReceipts(po.id,next.vault.documentEvents).length,0);
 for(const key of ['purchases','supplierPayments','inventoryMovements','payments','treasuryEntries'])
  assert.deepEqual(next.vault[key],before[key],key+' must not be posted');
 assert.deepEqual(vault,before);
 assert.throws(()=>prepareOperationalPoFromRfq(next.vault,rfq.number),/already exists/);
 assert.throws(()=>applyOperationalPoDraftApproval(next.vault,review),/already exists/);
});
test('PO approval rejects changed RFQ, supplier, quantities, company, branch and permissions',()=>{
 const f=fixture(),review=prepareOperationalPoFromRfq(f.vault,f.rfq.number);
 const mutation=(changes)=>({...f.vault,...changes});
 for(const edited of [
  mutation({documents:[{...f.rfq,updatedAt:'2099-01-01T00:00:00.000Z'}]}),
  mutation({documents:[{...f.rfq,items:[{...f.rfq.items[0],quantity:'301'},f.rfq.items[1]]}]}),
  mutation({documents:[{...f.rfq,supplierSnapshot:{...f.rfq.supplierSnapshot,sourceSupplierId:'unknown'}}]}),
  mutation({appSettings:{...f.vault.appSettings,activeWorkspaceId:'other'}}),
  mutation({appSettings:{...f.vault.appSettings,activeBranchId:'other'}}),
  mutation({teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]})
 ])assert.throws(()=>applyOperationalPoDraftApproval(edited,review));
});
test('Only Controller can stage PO; missing exact RFQ fails closed and Advisor remains read-only',async()=>{
 const {vault}=fixture(),before=structuredClone(vault);
 const advisor=await orchestrateAiToolRequest({message:request,vault,context:context('advisor'),language:'ar'});
 assert.equal(advisor?.proposal?.tool==='procurement.createPoFromRfq',false);
 const missing=await orchestrateAiToolRequest({message:'أنشئ مسودة أمر شراء من طلب عرض السعر',vault,context:context('controller'),language:'ar'});
 assert.equal(missing.proposal,null);
 assert.equal(missing.plan.calls.length,0);
 assert.deepEqual(vault,before);
});
