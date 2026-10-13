import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {isAiInvoiceStockEvidenceIntent,aiInvoiceStockEvidence} from '../dist/src/lib/ai-invoice-stock-evidence.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

const ask='هل الفاتورة INV-2026-0001 خصمت من المخزون؟';
function fixture(){
 const vault=emptyVault();
 const invoice=createBlankDocument('invoice','INV-2026-0001',vault.company);
 invoice.workspaceId='default';invoice.branchId='main';invoice.status='final';invoice.lifecycleStatus='active';
 const delivery=createBlankDocument('delivery-note','DN-2026-0001',vault.company);
 delivery.workspaceId='default';delivery.branchId='main';delivery.status='final';delivery.lifecycleStatus='active';
 vault.documents=[invoice,delivery];
 return{vault,invoice,delivery};
}
function link({vault,invoice,delivery}){
 vault.documentEvents.push({
  id:'evt-invoice-link',documentId:invoice.id,documentNumber:invoice.number,type:'created',
  at:'2026-10-01T00:00:00.000Z',relatedDocumentId:delivery.id,relatedDocumentNumber:delivery.number,
  note:'@lourex:sales-order:delivery-invoice:v1:'+JSON.stringify({
   invoiceId:invoice.id,invoiceNumber:invoice.number,quotationId:'q1',
   salesOrderNumber:'SO-2026-0001',deliveryNoteId:delivery.id,
   deliveryNoteUpdatedAt:delivery.updatedAt,deliveryReference:delivery.number,
   customerId:'customer-1',currency:invoice.currency,
   lines:[{salesOrderLineId:'order-line',invoiceLineId:'invoice-line',
     deliveryLineId:'delivery-line',quantity:'3'}]
  }),amount:'',currency:invoice.currency
 });
}
function issue({vault,delivery},valid=true){
 vault.inventoryMovements.push({
  id:'sales-delivery-stock:'+delivery.id+':delivery-line',workspaceId:'default',branchId:'main',
  itemId:'saved-item-1',itemNameEn:'Red Bull',itemNameAr:'',sku:'RB-250',
  date:valid?'2026-10-01':'not-a-date',type:'issue',quantity:'-3',unitCost:'',currency:'USD',
  sourceId:delivery.id,sourceNumber:delivery.number,
  note:'@lourex:sales-order:stock-issue:v1:{}",',createdAt:'2026-10-01T00:00:00.000Z'
 });
}
test('Invoice stock questions require an exact user request, not generic stock or invoice discussion',()=>{
 for(const message of [ask,'Did invoice INV-2026-0001 deduct stock?',
 'هل الفاتورة INV-2026-0001 أثرت على المخزون؟'])
  assert.equal(isAiInvoiceStockEvidenceIntent(message),true,message);
 for(const message of ['افتح الفاتورة INV-2026-0001','كم رصيد المخزون؟','راجع الفاتورة'])
  assert.equal(isAiInvoiceStockEvidenceIntent(message),false,message);
});
test('An issued invoice without delivery stock evidence cannot be called a stock deduction',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const result=aiInvoiceStockEvidence(f.vault,ask,'ar');
 assert.match(result,/إصدار الفاتورة وحده لا يثبت خصم المخزون/);
 assert.doesNotMatch(result,/وجدت .* حركة صرف مخزون مثبتة/);
 assert.deepEqual(f.vault,before,'read-only audit cannot mutate vault');
 link(f);
 const onlyDelivery=aiInvoiceStockEvidence(f.vault,ask,'ar');
 assert.match(onlyDelivery,/لم أجد حركة صرف مخزون موثقة/);
});
test('Only a valid linked stock issue supports actual deduction, and never leaks another branch',()=>{
 const f=fixture();link(f);issue(f);
 const before=structuredClone(f.vault);
 const text=aiInvoiceStockEvidence(f.vault,ask,'ar');
 assert.match(text,/وجدت 1 حركة صرف مخزون مثبتة/);
 assert.match(text,/DN-2026-0001/);
 assert.match(text,/-3/);
 assert.deepEqual(f.vault,before);
 f.vault.inventoryMovements[0].branchId='secret-branch';
 assert.match(aiInvoiceStockEvidence(f.vault,ask,'en'),/no validated linked stock issue/);
 f.vault.inventoryMovements[0].branchId='main';
 f.vault.inventoryMovements[0].date='bad-date';
 assert.match(aiInvoiceStockEvidence(f.vault,ask,'en'),/fails accounting validation/);
});
test('Unissued invoices, absent refs and multi-ref prompts fail closed',()=>{
 const f=fixture(),other='هل الفاتورة INV-2026-0001 والفاتورة INV-2026-0002 خصمت من المخزون؟';
 assert.match(aiInvoiceStockEvidence(f.vault,other,'ar'),/اذكر رقم فاتورة واحدة/);
 assert.match(aiInvoiceStockEvidence(f.vault,'هل الفاتورة INV-2026-9999 خصمت من المخزون؟','ar'),/لم أجد فاتورة واحدة مطابقة/);
 f.invoice.status='draft';
 assert.match(aiInvoiceStockEvidence(f.vault,ask,'ar'),/مسودة أو ملغاة أو غير صادرة/);
 f.invoice.status='final';f.invoice.branchId='private';
 assert.match(aiInvoiceStockEvidence(f.vault,ask,'ar'),/لم أجد فاتورة واحدة مطابقة/);
});
test('Advisor and Controller return the same source-scoped read-only answer with no execution',async()=>{
 const f=fixture(),before=structuredClone(f.vault);
 for(const mode of ['advisor','controller']){
  const context={conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}};
  const result=await orchestrateAiToolRequest({message:ask,vault:f.vault,context,language:'ar'});
  assert.ok(result);
  assert.equal(result.proposal,null);
  assert.equal(result.plannedBy,'local');
  assert.deepEqual(result.plan.calls,[]);
  assert.match(result.answer,/إصدار الفاتورة وحده لا يثبت خصم المخزون/);
 }
 assert.deepEqual(f.vault,before);
});
