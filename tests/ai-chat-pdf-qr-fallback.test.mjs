import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {planAiChatPdfQr} from '../dist/src/lib/ai-chat-pdf-qr-policy.js';

function issued(){
  const vault=emptyVault();
  const customer={id:'qa-customer',workspaceId:'default',companyNameEn:'QA Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  const doc=createBlankDocument('proforma','PI-2026-9999',vault.company);
  doc.customerSnapshot=customerSnapshotFrom(customer);
  doc.status='final';doc.lifecycleStatus='active';
  doc.items=[{id:'qa-line',descriptionEn:'QA Product',descriptionAr:'',quantity:'2',unit:'PCS',unitPrice:'40',unitCost:'',origin:'',packing:'',hsCode:''}];
  return doc;
}
test('issued customer PDF retains electronic QR by default',async()=>{
  const doc=issued(),before=structuredClone(doc);let calls=0;
  const planned=await planAiChatPdfQr(doc,async()=>{calls++;return'QA-VERIFIED-TOKEN';});
  assert.equal(calls,1);
  assert.equal(planned.document,doc);
  assert.equal(planned.electronicShareId,'QA-VERIFIED-TOKEN');
  assert.equal(planned.offlineCopy,false);
  assert.deepEqual(doc,before);
});
test('QR failure cannot silently produce unmarked final PDF',async()=>{
  const doc=issued(),before=structuredClone(doc);
  await assert.rejects(planAiChatPdfQr(doc,async()=>{throw Error('offline/firestore-denied');}),/offline\/firestore-denied/);
  await assert.rejects(planAiChatPdfQr(doc,async()=>''),/QR reference is missing/);
  assert.deepEqual(doc,before);
});
test('explicit fallback produces a separate visibly watermarked local PDF without contacting cloud',async()=>{
  const doc=issued(),before=structuredClone(doc);let calls=0;
  const plan=await planAiChatPdfQr(doc,async()=>{calls++;throw Error('no-cloud');},true);
  assert.equal(calls,0);
  assert.equal(plan.offlineCopy,true);
  assert.equal(plan.electronicShareId,'');
  assert.notEqual(plan.document,doc);
  assert.equal(plan.document.status,'final');
  assert.equal(plan.document.appearance.watermark.enabled,true);
  assert.equal(plan.document.appearance.watermark.type,'text');
  assert.match(plan.document.appearance.watermark.text,/LOCAL COPY - NO QR/);
  assert.deepEqual(doc,before,'never edit the original invoice or its saved company data');
});
test('draft previews remain independent from all electronic share connections',async()=>{
  const doc=issued();doc.status='draft';let calls=0;
  const result=await planAiChatPdfQr(doc,async()=>{calls++;throw Error('must not be contacted');});
  assert.equal(calls,0);assert.equal(result.offlineCopy,false);assert.equal(result.electronicShareId,'');assert.equal(result.document,doc);
});
test('UI requires a separate post-error click, labels offline copy, and keeps normal QR as default',async()=>{
  const ui=await readFile('src/components/AiConversationWorkspace.tsx','utf8');
  const code=ui.slice(ui.indexOf('function ConversationDocumentCard('),ui.indexOf('function ArtifactWorkspace('));
  assert.match(code,/allowOfflineCopy&&!pdfQrError\)return/,'cannot run fallback without previous QR failure');
  assert.match(code,/planAiChatPdfQr\(document,async\(\)=>/);
  assert.match(code,/if\(qrAttemptFailed\)setPdfQrError\('qr-unavailable'\)/);
  assert.match(code,/pdfQrError\?<button[^>]*onClick=\{\(\)=>void createPdf\(true\)\}/);
  assert.match(code,/pdfSource\?\.offlineCopy\?<p role="status"/);
  assert.match(code,/electronicShareId=\{pdfSource\.electronicShareId\}/);
  assert.doesNotMatch(code,/setPdfSource\(\{document,identity,electronicShareId\}\)/);
});
