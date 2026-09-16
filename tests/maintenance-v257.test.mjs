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
