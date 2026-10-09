import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('final proforma remains convertible without unlocking it for editing',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/documentCanConvertToInvoice\(props\.document\.kind\)&&props\.document\.status==='final'/);
  assert.match(editor,/props\.document\.lifecycleStatus!=='voided'/);
  assert.match(editor,/item\.convertedFromId===props\.document\.id&&item\.lifecycleStatus!=='voided'/);
  assert.match(editor,/Create Commercial Invoice/);
  assert.match(editor,/t\('Create Invoice','إنشاء فاتورة'\)/);
  assert.match(editor,/private convertFinalQuote=/);
  assert.match(editor,/this\.props\.onConvert\(this\.props\.document\)/);
  assert.match(editor,/if\(this\.quoteConversionRunning\)return/);
  assert.match(editor,/The quote stays Final and unchanged/);
});

test('final quote conversion action is outside the disabled editor form',async()=>{
  const [wrapper,core]=await Promise.all([read('src/components/EditorPage.tsx'),read('src/components/EditorPageCore.tsx')]);
  assert.match(wrapper,/const finalQuoteAction=finalQuote\?this\.renderQuoteAction\(linkedInvoice,sourceIsProformaInvoice\):null/);
  assert.match(wrapper,/ReactDOM\.createPortal\(finalQuoteAction,editorScreen\)/);
  assert.match(wrapper,/aria-label=\{t\('Final document conversion','تحويل المستند النهائي'\)\}/);
  assert.match(core,/fieldset className="editor-form-lock" disabled=\{locked\|\|this\.state\.issuing\}/);
  assert.match(core,/Unlock for editing/);
});

test('final quote conversion action is touch-safe and ships to installed PWA clients',async()=>{
  const [css,sw]=await Promise.all([read('src/styles/editor-workflow-v61.css'),read('public/sw.js')]);
  assert.match(css,/\.final-quote-convert-bar/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.final-quote-convert-bar/);
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.ok(sw.includes('./src/components/EditorPage.js'));
});
