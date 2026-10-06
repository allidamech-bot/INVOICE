import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateTotals } from '../dist/src/lib/money.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('15 percent VAT remains exact for a simple quotation base',()=>{
  const totals=calculateTotals(
    [{quantity:'4',unitPrice:'25.00'}],
    {discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:true,taxPercent:'15'}
  );
  assert.deepEqual(totals,{subtotal:'100.00',discount:'0.00',shipping:'0.00',otherCharges:'0.00',tax:'15.00',grandTotal:'115.00'});
});

test('15 percent VAT remains exact with Arabic digits and decimal prices',()=>{
  const totals=calculateTotals(
    [{quantity:'٢',unitPrice:'٥٠٫٠٠'}],
    {discountEnabled:false,discountMode:'fixed',discountValue:'٠',shippingEnabled:false,shipping:'٠',otherChargesEnabled:false,otherCharges:'٠',taxEnabled:true,taxPercent:'١٥'}
  );
  assert.equal(totals.subtotal,'100.00');
  assert.equal(totals.tax,'15.00');
  assert.equal(totals.grandTotal,'115.00');
});

test('editor exposes the same VAT amount that the document renderer uses',async()=>{
  const [editor,renderer]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/templates/TemplateRenderer.tsx')
  ]);
  assert.match(editor,/totals=calculateTotals\(d\.items,d\.adjustments\)/);
  assert.match(editor,/Tax \/ VAT/);
  assert.match(editor,/formatMoney\(totals\.tax,d\.currency\)/);
  assert.match(renderer,/calculateTotals\(doc\.items, doc\.adjustments\)/);
  assert.match(renderer,/t\.tax,doc\.adjustments\.taxEnabled/);
});

test('financial edits refresh desktop preview immediately instead of waiting for delayed preview',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/const financialChanged=previous\.items!==doc\.items\|\|previous\.adjustments!==doc\.adjustments\|\|previous\.currency!==doc\.currency/);
  assert.match(editor,/if\(financialChanged&&this\.state\.desktopPreview\)nextState\.previewDoc=previewDocument\(doc\)/);
  assert.match(editor,/if\(!financialChanged\)this\.schedulePreview\(\)/);
});

test('PDF output refuses a financially different persisted snapshot',async()=>{
  const app=await read('src/app/App.tsx');
  assert.match(app,/function assertFinancialOutputParity\(source:LourexDocument,target:LourexDocument\):void/);
  assert.match(app,/OUTPUT_TOTAL_KEYS\.some\(key=>sourceTotals\[key\]!==targetTotals\[key\]\)/);
  assert.match(app,/assertFinancialOutputParity\(doc,target\);const party=/);
});
