import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attachmentScopeKey,explicitAttachedFileFollowup} from '../dist/src/lib/ai-attachment-followup.js';

const original={scope:'business',accountId:'user-1',workspaceId:'company-1',branchId:'main',threadId:'controller-thread'};
test('F15 exact Controller scope identity separates account, company, branch and thread',()=>{
 const base=attachmentScopeKey(original,'controller');
 assert.ok(base);
 for(const property of ['accountId','workspaceId','branchId','threadId']){
  assert.notEqual(attachmentScopeKey({...original,[property]:'different'},'controller'),base,property+' changed');
  assert.equal(attachmentScopeKey({...original,[property]:''},'controller'),'');
 }
 assert.equal(attachmentScopeKey(original,'advisor'),'');
 assert.equal(attachmentScopeKey({...original,scope:'personal'},'controller'),'');
 assert.equal(attachmentScopeKey(undefined,'controller'),'');
});
test('F15 only an explicit reference to the uploaded file reuses prior extraction',()=>{
 for(const message of ['حوّل الملف إلى عرض سعر','جهز عرض سعر من المرفق',
  'استخرج الاصناف من الصورة','حلل الملف السابق','Convert this file into a quote',
  'Create a quotation from the uploaded file','Review the attached file']){
   assert.equal(explicitAttachedFileFollowup(message),true,message);
 }
 for(const message of ['أنشئ فاتورة جديدة','احسب المبيعات هذا الشهر','هل العميل موجود؟',
  'اعتمد النسخة','حول الدولار إلى الليرة','تجاهل الملف السابق',
  'لا تستخدم المرفق في التحليل','Delete this attached file','Create a new quote']){
  assert.equal(explicitAttachedFileFollowup(message),false,message);
 }
});
test('F15 multi-file Arabic and English follow-ups retain same-thread evidence only on explicit merge intent',()=>{
 for(const message of [
   'ادمج الملفات المرفقة في عرض سعر موحد',
   'اجمع الثلاث ملفات في عرض سعر واحد',
   'وحّد المرفقات السابقة في عرض سعر',
   'حلل كل الملفات التي رفعتها',
   'Combine the uploaded files into one quotation',
   'Merge all attachments into a single quotation',
   'Consolidate the previously uploaded documents',
   'Analyze these files together'
 ])assert.equal(explicitAttachedFileFollowup(message),true,message);
 for(const message of [
   'ادمج بيانات العملاء في تقرير واحد',
   'ادمج تصوراتي عن المخزون في خطة جديدة',
   'Prepare a new quotation without any attachment',
   'احذف الملفات المرفقة',
   'تجاهل الملفات السابقة وابدأ من جديد',
   'لا تستخدم الملفات التي رفعتها',
   'Ignore all uploaded files and prepare a new invoice',
   'Merge the customer balances',
   'Merge these files into a quote without using the attached files'
 ])assert.equal(explicitAttachedFileFollowup(message),false,message);
});

test('F15 negated ignore and copy verbs do not silently discard eligible file evidence',()=>{
 for(const message of [
   'لا تتجاهل المرفقات، ادمج الملفات في عرض سعر',
   "Don't ignore the uploaded files: merge the attachments",
   'انسخ بيانات الملفات ثم حللها'
 ])assert.equal(explicitAttachedFileFollowup(message),true,message);
 assert.equal(explicitAttachedFileFollowup('انس الملفات ولا تستخدمها'),false);
});

test('F15 compiled attachment handler uses exact scoped evidence and clears it even on failed reply',async()=>{
 const generated=await readFile(new URL('../dist/src/components/AiCopilot.js',import.meta.url),'utf8');
 assert.match(generated,/__lourexLastConversationSourceScope=attachmentScopeKey/);
 assert.match(generated,/const currentKey=attachmentScopeKey\(instance\.__intelligenceKernel\?\.scope,instance\.__intelligenceKernel\?\.mode\)/);
 assert.match(generated,/currentKey===instance\.__lourexLastConversationSourceScope&&cached\.length&&explicitAttachedFileFollowup\(prompt\)/);
 assert.match(generated,/__lourexSetConversationSources\(cached\.slice\(\)\)/);
 assert.match(generated,/try\{return await baseAsk\(raw\);\}finally\{__lourexSetConversationSources\(\[\]\);\}/);
});
test('F15 thread switch and mode switch erase old source identity and transient global data',async()=>{
 const source=await readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
 assert.match(source,/host\.__lourexLastConversationSourceScope=''/);
 assert.match(source,/globalThis as any\)\.__lourexConversationSourcesV3=\[\]/);
 assert.equal(source.match(/host\.__lourexLastConversationSourceScope=''/g)?.length,2);
});
test('F15 non-file followups never inherit untrusted attachment data on the next request',async()=>{
 const source=await readFile(new URL('../scripts/ai-batch3-conversation-lifecycle-fix.mjs',import.meta.url),'utf8');
 assert.match(source,/if\(!rows\.length\)/);
 assert.match(source,/return baseAsk\(raw\)/);
 assert.match(source,/__lourexSetConversationSources\(\[\]\)/);
 assert.match(source,/explicitAttachedFileFollowup\(prompt\)/);
});
