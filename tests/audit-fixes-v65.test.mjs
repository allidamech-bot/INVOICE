import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('final proforma remains convertible without unlocking it for editing',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/props\.document\.kind==='proforma'&&props\.document\.status==='final'/);
  assert.match(editor,/Create Invoice from Quote/);
  assert.match(editor,/props\.onConvert\(props\.document\)/);
  assert.match(editor,/The quote stays Final and unchanged/);
});

test('final quote conversion action is outside the disabled editor form',async()=>{
  const [wrapper,core]=await Promise.all([read('src/components/EditorPage.tsx'),read('src/components/EditorPageCore.tsx')]);
  assert.match(wrapper,/final-quote-convert-bar/);
  assert.match(core,/fieldset className="editor-form-lock" disabled=\{locked\}/);
  assert.match(core,/Unlock for editing/);
});

test('final quote conversion action is touch-safe and ships to installed PWA clients',async()=>{
  const [css,sw]=await Promise.all([read('src/styles/editor-workflow-v61.css'),read('public/sw.js')]);
  assert.match(css,/\.final-quote-convert-bar/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.final-quote-convert-bar/);
  assert.match(sw,/lourex-invoice-v65/);
  assert.ok(sw.includes('./src/components/EditorPage.js'));
});
