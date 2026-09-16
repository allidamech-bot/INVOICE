import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v257 keeps localized financial input inside the fixed precision engine',async()=>{
  const money=await read('src/lib/money.ts');
  assert.match(money,/const arabicIndic='٠١٢٣٤٥٦٧٨٩'/);
  assert.match(money,/const easternArabic='۰۱۲۳۴۵۶۷۸۹'/);
  assert.match(money,/char==='٫'\?'\.':char/);
  assert.match(money,/\(\?:٬\\d\{3\}\)\+/);
});

test('v257 isolates editable decimal and technical controls in the Arabic application shell',async()=>{
  const [rtl,editor]=await Promise.all([read('src/styles/rtl.css'),read('src/components/EditorPageCore.tsx')]);
  assert.match(editor,/inputMode="decimal"/,'document financial controls must use decimal input mode');
  assert.match(rtl,/input\[inputmode="decimal"\][\s\S]*direction:ltr;text-align:left;unicode-bidi:isolate/);
  assert.match(rtl,/input\[type="date"\]/);
  assert.match(rtl,/input\[type="tel"\]/);
});

test('v257 isolates monetary display strings from RTL bidi reordering',async()=>{
  const rtl=await read('src/styles/rtl.css');
  for(const selector of ['.editor-top-left strong','.editor-grand-total-chip strong','.item-line-total','.premium-item-card footer strong','.document-total'])assert.ok(rtl.includes(selector),selector);
  assert.match(rtl,/\.document-total\{direction:ltr;unicode-bidi:isolate\}/);
});

test('v257 tracks in-flight edits by monotonic revision instead of millisecond timestamps',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/private editRevision=0/);
  assert.match(editor,/this\.editRevision\+=1/);
  assert.match(editor,/const revisionAtStart=this\.editRevision;[\s\S]*const hasNewerChanges=this\.editRevision!==revisionAtStart/);
  assert.doesNotMatch(editor,/hasNewerChanges=this\.state\.doc\.updatedAt!==snapshot\.updatedAt/);
});

test('v257 back navigation drains newer edits and issuing freezes the editable form',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  const closeFlow=editor.slice(editor.indexOf('private saveAndClose=async()=>'),editor.indexOf('private openReview='));
  assert.match(closeFlow,/for\(;;\)/);
  assert.match(closeFlow,/const revisionAtStart=this\.editRevision/);
  assert.match(closeFlow,/await this\.props\.onSave\(snapshot,true\)/);
  assert.match(closeFlow,/if\(this\.editRevision!==revisionAtStart\)continue/);
  const retryAt=closeFlow.indexOf('if(this.editRevision!==revisionAtStart)continue');
  const stableCloseAt=closeFlow.lastIndexOf('this.props.onClose()');
  assert.ok(retryAt>=0&&stableCloseAt>retryAt,'Back must only close from the save loop after the latest edit revision is stable');
  assert.match(editor,/fieldset className="editor-form-lock" disabled=\{locked\|\|this\.state\.issuing\}/);
});

test('v257 refreshes installed PWA clients for financial and RTL runtime changes',async()=>{
  const [pwa,sourceWorker]=await Promise.all([read('scripts/pwa-cache-v205.mjs'),read('public/sw.js')]);
  assert.ok(pwa.includes('lourex-invoice-v257: localized financial input and RTL numeric isolation refresh'));
  for(const asset of ['./src/lib/money.js','./styles/rtl.css'])assert.ok(sourceWorker.includes(asset),asset);
});
