import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {newConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {savedDocumentPreviewId} from '../dist/src/lib/ai-commercial-conversation.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f17-saved-reference'};
function fixture(){
 const vault=emptyVault();
 const doc=createBlankDocument('invoice','INV-2026-0001',vault.company);
 doc.workspaceId='default';doc.branchId='main';doc.status='draft';
 vault.documents=[doc];
 return {vault,doc,kernel:newConversationKernel(scope)};
}

test('F17 Controller resolves saved invoice number from a natural Arabic/English PDF request',()=>{
 const {vault,doc,kernel}=fixture();
 const before=structuredClone(vault);
 for(const message of [
   'افتح لي PDF الفاتورة INV-2026-0001 معاينة كاملة ورابط تحميل',
   'افتح معاينة الفاتورة رقم INV-2026-0001',
   'أعطني PDF للفاتورة رقم INV-2026-0001',
   'اعرض الفاتورة INV-2026-0001',
   'Open the PDF for invoice INV-2026-0001 for preview and download',
   'افتح معاينة الفاتورة INV-٢٠٢٦-٠٠٠١',
 ]){
  assert.equal(savedDocumentPreviewId(kernel,vault,message),doc.id,message);
 }
 assert.deepEqual(vault,before,'read-only selection cannot change saved finance data');
});
test('Controller opens the unique latest quotation by creation date without a document number',()=>{
 const {vault,kernel}=fixture();
 const old=createBlankDocument('proforma','QUO-2026-0004',vault.company);
 const latest=createBlankDocument('proforma','QUO-2026-0005',vault.company);
 for(const doc of [old,latest]){doc.workspaceId='default';doc.branchId='main';doc.status='draft';}
 old.createdAt='2026-10-11T10:00:00.000Z';
 latest.createdAt='2026-10-13T10:00:00.000Z';
 vault.documents.push(old,latest);
 const prior=structuredClone(vault);
 for(const message of ['افتح آخر عرض سعر','افتح عرض السعر الأخير','افتح PDF آخر عرض سعر','Open latest quotation']){
  assert.equal(savedDocumentPreviewId(kernel,vault,message),latest.id,message);
 }
 assert.deepEqual(vault,prior,'latest quotation resolution never mutates the business vault');
 latest.createdAt=old.createdAt;
 assert.throws(()=>savedDocumentPreviewId(kernel,vault,'افتح آخر عرض سعر'),/same latest date/);
 latest.createdAt='not-a-date';
 assert.throws(()=>savedDocumentPreviewId(kernel,vault,'افتح آخر عرض سعر'),/dates are incomplete/);
 kernel.mode='advisor';assert.equal(savedDocumentPreviewId(kernel,vault,'افتح آخر عرض سعر'),null);
 kernel.mode='controller';kernel.scope.branchId='different';
 assert.equal(savedDocumentPreviewId(kernel,vault,'افتح آخر عرض سعر'),null);
});

test('F17 preview needs exact reference: no guessed latest or substring match',()=>{
 const {vault,kernel}=fixture();
 for(const message of [
   'افتح الفاتورة الأخيرة',
   'افتح تقرير مبيعات سبتمبر',
   'هل الفاتورة INV-2026-0001 محفوظة؟',
   'أريد مقارنة الفواتير',
   'لا تفتح الفاتورة INV-2026-0001',
   'افتح PDF الفاتورة INV-2026-0001 ثم عدل سعرها',
   'Open PDF invoice INV-2026-0001 and delete it',
 ]){
  assert.equal(savedDocumentPreviewId(kernel,vault,message),null,message);
 }
 for(const message of [
   'افتح PDF الفاتورة INV-2026-0001 والفاتورة INV-2026-0099',
   'افتح معاينة الفاتورة رقم INV-2026-000',
   'افتح معاينة الفاتورة رقم INV-2026-0009',
 ]){
  assert.throws(()=>savedDocumentPreviewId(kernel,vault,message),/Document not found|ambiguous/,message);
 }
});
test('F17 branch/mode isolation, ambiguous references and missing records fail closed',()=>{
 const {vault,doc,kernel}=fixture();
 const ask='افتح لي PDF الفاتورة INV-2026-0001';
 kernel.mode='advisor';assert.equal(savedDocumentPreviewId(kernel,vault,ask),null);
 kernel.mode='controller';kernel.scope.branchId='other';
 assert.equal(savedDocumentPreviewId(kernel,vault,ask),null);
 kernel.scope.branchId='main';kernel.scope.scope='personal';
 assert.equal(savedDocumentPreviewId(kernel,vault,ask),null);
 kernel.scope.scope='business';
 const second=createBlankDocument('invoice','INV-2026-0002',vault.company);
 second.workspaceId='default';second.branchId='main';vault.documents.push(second);
 assert.throws(
  ()=>savedDocumentPreviewId(kernel,vault,'افتح PDF الفاتورة INV-2026-0001 والفاتورة INV-2026-0002'),
  /ambiguous/
 );
 vault.documents=[doc];
 assert.equal(savedDocumentPreviewId(kernel,vault,ask),doc.id);
});
test('F17 exact saved reference is resolved BEFORE the navigation planner and can trigger the A4 PDF preview',async()=>{
 const source=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 const start=source.indexOf("const previewId=currentConversationMode(host)==='controller'?savedDocumentPreviewId");
 const pdf=source.indexOf('if(currentConversationMode(host)===\'controller\'&&pdfRequested&&(kernel.artifact||previewId))',start);
 const nav=source.indexOf('const commercialCommand=',start);
 assert.ok(start>=0&&pdf>start&&nav>pdf,'saved document preview must intercept before generic tool/navigation route');
 assert.match(source,/__workspaceSavedId:previewId\|\|''/);
 assert.match(source,/__workspacePdfAutoStart:identity/);
 assert.match(source,/savedDocumentPreviewId\(kernel,fresh\.vault,message\)!==previewId/,'scope must revalidate after async work');
 // The full Arabic instruction must generate a PDF rather than stopping at a
 // read-only workspace, and reply language must follow this message.
 const pdfAction=source.match(/const pdfRequested=[\s\S]*?\.test\(message\);/)?.[0]||'';
 assert.match(pdfAction,/افتح\|أفتح\|اعرض\|أعرض/);
 assert.match(source,/const requestLanguage=resolveAiConversationReplyLanguage\(currentAiExperiencePreferences\(host\)\.replyLanguage,message/);
 assert.match(source,/prepareAiPdfPreview\(kernel,fresh\.vault,requestLanguage,previewId\|\|''\)/);
 assert.match(source,/text:requestLanguage==='ar'/);
});

test('Operational PO and delivery-note PDF references resolve exact scoped saved type',()=>{
 const {vault,kernel}=fixture();
 const po=createBlankDocument('purchase-order','PO-2026-0009',vault.company);
 const dn=createBlankDocument('delivery-note','DN-2026-0012',vault.company);
 po.workspaceId='default';po.branchId='main';
 dn.workspaceId='default';dn.branchId='main';
 vault.documents.push(po,dn);
 const before=structuredClone(vault);
 for(const message of [
  'افتح لي PDF أمر الشراء PO-2026-0009',
  'افتح معاينة طلب الشراء رقم PO-2026-0009',
  'Open PDF purchase order PO-2026-0009',
 ]){
  assert.equal(savedDocumentPreviewId(kernel,vault,message),po.id,message);
 }
 for(const message of [
  'اعرض سند تسليم DN-2026-0012',
  'افتح PDF سند التسليم DN-2026-0012',
  'Show PDF delivery note DN-2026-0012',
 ]){
  assert.equal(savedDocumentPreviewId(kernel,vault,message),dn.id,message);
 }
 assert.deepEqual(vault,before,'read-only saved operational PDFs never write state');
});
test('Operational PDF routing never resolves the wrong document kind or a GRN it cannot save',()=>{
 const {vault,kernel}=fixture();
 const po=createBlankDocument('purchase-order','PO-2026-0009',vault.company);
 po.workspaceId='default';po.branchId='main';vault.documents.push(po);
 for(const msg of [
  'افتح PDF سند التسليم PO-2026-0009',
  'Open PDF invoice PO-2026-0009',
  'افتح PDF أمر الشراء INV-2026-0001',
 ]){
  assert.throws(()=>savedDocumentPreviewId(kernel,vault,msg),/Different document kinds|kind does not match/,msg);
 }
 assert.throws(()=>savedDocumentPreviewId(kernel,vault,'افتح PDF سند استلام GRN-2026-0012'),/GRN is not a saved document type/);
 kernel.mode='advisor';
 assert.equal(savedDocumentPreviewId(kernel,vault,'افتح PDF أمر الشراء PO-2026-0009'),null);
 kernel.mode='controller';kernel.scope.branchId='other';
 assert.equal(savedDocumentPreviewId(kernel,vault,'افتح PDF أمر الشراء PO-2026-0009'),null);
});
