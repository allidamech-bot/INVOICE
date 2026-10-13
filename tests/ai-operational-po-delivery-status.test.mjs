import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {isOperationalDocumentStatusIntent,operationalDocumentStatus} from '../dist/src/lib/ai-operational-document-status.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

function fixture(){
 const vault=emptyVault();
 const po=createBlankDocument('purchase-order','PO-2026-0031',vault.company);
 const dn=createBlankDocument('delivery-note','DN-2026-0032',vault.company);
 po.workspaceId='default';po.branchId='main';
 dn.workspaceId='default';dn.branchId='main';
 vault.documents=[po,dn];
 return{vault,po,dn};
}
const poAsk='ما حالة أمر الشراء PO-2026-0031؟',dnAsk='هل تم تأكيد سند التسليم DN-2026-0032؟';
test('PO/DN status classifier does not intercept create or finalize requests',()=>{
 for(const q of [poAsk,dnAsk,'What is the status of purchase order PO-2026-0031?',
 'Show progress of delivery note DN-2026-0032'])assert.equal(isOperationalDocumentStatusIntent(q),true,q);
 for(const q of ['أنشئ أمر شراء جديد','جهّز سند تسليم DN-2026-0032',
 'Create purchase order PO-2026-0031','اعتمد الآن أمر الشراء PO-2026-0031',
 'افتح PDF سند التسليم DN-2026-0032'])assert.equal(isOperationalDocumentStatusIntent(q),false,q);
});
test('Issued purchase order cannot be mistaken for received goods or booked stock',()=>{
 const {vault,po}=fixture(),before=structuredClone(vault);
 po.status='final';
 const result=operationalDocumentStatus(vault,poAsk,'ar');
 assert.match(result,/PO-2026-0031/);
 assert.match(result,/إصدار أمر الشراء لا يثبت استلام البضاعة/);
 assert.match(result,/لا يوجد هنا سجل GRN مستقل/);
 assert.doesNotMatch(result,/استلام البضاعة مؤكد/);
 assert.equal(vault.inventoryMovements.length,0);
 assert.deepEqual(vault,{...before,documents:[{...before.documents[0],status:'final'},before.documents[1]]});
});
test('A delivery note being final is not evidence of confirmed delivery or stock issue',()=>{
 const {vault,dn}=fixture();
 dn.status='final';
 const result=operationalDocumentStatus(vault,dnAsk,'en');
 assert.match(result,/No single matching confirmation/);
 assert.match(result,/No stock issue can be confirmed/);
 assert.equal(vault.inventoryMovements.length,0);
});
test('A confirmed delivery reports actual validated linked stock issues with no claims about full completion',()=>{
 const {vault,dn}=fixture();dn.status='final';
 vault.documentEvents.push({
  id:'proof',documentId:dn.id,documentNumber:dn.number,type:'audit',
  at:'2026-10-01T00:00:00.000Z',relatedDocumentId:'',relatedDocumentNumber:'',
  amount:'',currency:'USD',
  note:'@lourex:sales-order:delivery-confirmed:v1:'+JSON.stringify({
   quotationId:'quotation',salesOrderNumber:'SO-2026-008',
   deliveryNoteId:dn.id,deliveryNoteNumber:dn.number,
   deliveryNoteUpdatedAt:dn.updatedAt,customerId:'buyer-1',currency:'USD',
   deliveredDate:'2026-10-01',reference:'DN proof',notes:'',
   confirmedByMemberId:'member-1',
   lines:[{salesOrderLineId:'line',deliveryLineId:'delivery-line',
    quantity:'3',unit:'CTN'}]
  })
 });
 vault.inventoryMovements.push({
  id:'sales-delivery-stock:'+dn.id+':delivery-line',workspaceId:'default',branchId:'main',
  itemId:'item-1',itemNameEn:'Product A',itemNameAr:'',sku:'A',
  date:'2026-10-01',type:'issue',quantity:'-3',unitCost:'',currency:'USD',
  sourceId:dn.id,sourceNumber:dn.number,
  note:'@lourex:sales-order:stock-issue:v1:{"proof":true}',
  createdAt:'2026-10-01T00:00:00.000Z'
 });
 const before=structuredClone(vault);
 assert.match(operationalDocumentStatus(vault,dnAsk,'ar'),/حركات الصرف الصالحة المرتبطة: 1/);
 assert.match(operationalDocumentStatus(vault,dnAsk,'en'),/The movement count alone does not prove all delivered quantities/);
 assert.deepEqual(vault,before);
 vault.inventoryMovements[0].branchId='other';
 assert.match(operationalDocumentStatus(vault,dnAsk,'en'),/Valid linked stock issue movements: 0/);
});
test('Operational status fails closed for wrong kinds, missing numbers, ambiguous refs and other branches',()=>{
 const {vault,po}=fixture();
 assert.match(operationalDocumentStatus(vault,'ما حالة أمر الشراء PO-2026-0031 و DN-2026-0032','ar'),/اذكر رقم/);
 assert.match(operationalDocumentStatus(vault,'ما حالة أمر الشراء PO-2026-9999','ar'),/لم أجد/);
 assert.match(operationalDocumentStatus(vault,'ما حالة سند التسليم PO-2026-0031','ar'),/لا يطابق/);
 po.branchId='branch-2';
 assert.match(operationalDocumentStatus(vault,poAsk,'en'),/No purchase order or delivery note/);
});
test('Controller and Advisor share scoped read-only status, never stage documents or stock actions',async()=>{
 const f=fixture(),before=structuredClone(f.vault);
 for(const mode of ['advisor','controller']){
  const ctx={conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}};
  const x=await orchestrateAiToolRequest({message:poAsk,vault:f.vault,context:ctx,language:'ar'});
  assert.ok(x);assert.equal(x.proposal,null);assert.deepEqual(x.plan.calls,[]);
  assert.equal(x.plannedBy,'local');assert.match(x.answer,/لا يوجد هنا سجل GRN مستقل/);
 }
 assert.deepEqual(f.vault,before);
});
