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
