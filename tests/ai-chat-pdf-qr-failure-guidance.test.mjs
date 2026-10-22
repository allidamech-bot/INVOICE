import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {aiChatQrFailureGuidance} from '../dist/src/lib/ai-chat-pdf-qr-policy.js';

const cases=[
 {kind:'inactive',error:new Error('The document QR is disabled or expired. Open Electronic document to reactivate it.'),en:/reactivate/,ar:/إعادة تفعيل/},
 {kind:'inactive',error:new Error('رابط QR متوقف أو منتهي. افتح النسخة الإلكترونية لإعادة تفعيله.'),en:/expired/,ar:/إعادة تفعيل/},
 {kind:'auth',error:new Error('Connect your LOUREX cloud account to activate the document QR.'),en:/sign-in/,ar:/تسجيل الدخول/},
 {kind:'auth',error:{code:'auth/unauthenticated',message:'private Firebase UID 123abc'},en:/sign-in/,ar:/تسجيل الدخول/},
 {kind:'permission',error:{code:'firestore/permission-denied',message:'token=SHOULD-NEVER-APPEAR'},en:/permissions/,ar:/صلاحيات/},
 {kind:'network',error:{code:'unavailable',message:'service internal URL https://private.example'},en:/connection/,ar:/الاتصال/},
 {kind:'network',error:new Error('Network request failed'),en:/connection/,ar:/الاتصال/},
 {kind:'size',error:new Error('This document is too large for a secure customer link. Reduce embedded logo/signature/stamp image size and try again.'),en:/Reduce embedded logo/,ar:/قلّل حجم صور/},
 {kind:'stale',error:new Error('Account or document changed.'),en:/Reopen/,ar:/تغير الحساب/},
 {kind:'other',error:new Error('something else, sourceCustomerId=secret-email@example.test'),en:/Retry PDF/,ar:/أعد محاولة PDF/}
];
for(const {kind,error,en,ar} of cases){
 test('QR error guidance '+kind+' is correctly categorized and localized',()=>{
   const english=aiChatQrFailureGuidance(error,false);
   const arabic=aiChatQrFailureGuidance(error,true);
   assert.equal(english.kind,kind);
   assert.equal(arabic.kind,kind);
   assert.match(english.message,en);
   assert.match(arabic.message,ar);
   assert.ok(!english.message.includes('123abc'));
   assert.ok(!arabic.message.includes('123abc'));
   assert.ok(!english.message.includes('SHOULD-NEVER-APPEAR'));
   assert.ok(!arabic.message.includes('SHOULD-NEVER-APPEAR'));
   assert.ok(!english.message.includes('secret-email@example.test'));
   assert.ok(!arabic.message.includes('secret-email@example.test'));
   assert.match(english.message,/QR/);
   assert.match(arabic.message,/QR|PDF/);
 });
}
test('malformed backend failure data does not render arbitrary exception text',()=>{
  for(const error of [null,undefined,{}, {code:{unexpected:true},message:{arbitrary:1}},'Authorization Bearer PRIVATE_TOKEN']){
    const result=aiChatQrFailureGuidance(error,false);
    assert.equal(result.kind,'other');
    assert.match(result.message,/electronic QR/);
    assert.doesNotMatch(result.message,/PRIVATE_TOKEN|Bearer|unexpected|arbitrary/);
  }
});
test('conversation PDF component uses private-safe QR guidance only after QR failure and retains explicit fallback',async()=>{
  const ui=await readFile('src/components/AiConversationWorkspace.tsx','utf8');
  const s=ui.slice(ui.indexOf('function ConversationDocumentCard('),ui.indexOf('function ArtifactWorkspace('));
  assert.match(ui,/aiChatQrFailureGuidance, planAiChatPdfQr/);
  assert.match(s,/setPdfError\(qrAttemptFailed\?aiChatQrFailureGuidance\(e,ar\)\.message/);
  assert.match(s,/if\(qrAttemptFailed\)setPdfQrError\('qr-unavailable'\)/);
  assert.match(s,/allowOfflineCopy&&!pdfQrError\)return/);
  assert.match(s,/pdfQrError\?<button[^>]*onClick=\{\(\)=>void createPdf\(true\)\}/);
  assert.doesNotMatch(s,/console\.(?:warn|error)\(e\)/);
});

test('oversized QR guidance does not reveal customer data or suggest unchanged retry',()=>{
  const original=new Error('This document is too large for a secure customer link. Customer private@example.test. Reduce embedded logo/signature/stamp image size and try again.');
  const english=aiChatQrFailureGuidance(original,false),arabic=aiChatQrFailureGuidance(original,true);
  assert.equal(english.kind,'size');
  assert.equal(arabic.kind,'size');
  assert.match(english.message,/Reduce embedded logo/);
  assert.match(arabic.message,/قلّل حجم صور/);
  assert.doesNotMatch(english.message,/private@example\.test/);
  assert.doesNotMatch(arabic.message,/private@example\.test/);
  assert.match(english.message,/marked local/);
});
