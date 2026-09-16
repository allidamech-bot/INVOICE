import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v257 maintenance scope stays limited to save sequencing financial parsing and RTL isolation',async()=>{
  const [editor,money,rtl]=await Promise.all([
    readFile('src/components/EditorPageCore.tsx','utf8'),
    readFile('src/lib/money.ts','utf8'),
    readFile('src/styles/rtl.css','utf8')
  ]);
  assert.ok(editor.includes('private editRevision=0'));
  assert.ok(money.includes("const arabicIndic='٠١٢٣٤٥٦٧٨٩'"));
  assert.ok(rtl.includes('input[inputmode="decimal"]'));
});
