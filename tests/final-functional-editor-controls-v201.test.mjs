import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const activeCacheVersion=sw=>{
  const matches=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  return matches.length?Number(matches.at(-1)[1]):0;
};

test('v201 serializes editor output preparation across rapid PDF/share/print presses',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/private outputPromise:Promise<void>\|null=null/);
  assert.match(editor,/private printWithPreparedMode=\(doc:LourexDocument,mode:'print'\|'pdf'\|'share'\):Promise<void>=>\{/);
  assert.match(editor,/if\(this\.outputPromise\)return this\.outputPromise/);
  assert.match(editor,/await this\.props\.onPrint\(doc,mode\)/);
  assert.match(editor,/if\(this\.outputPromise===operation\)this\.outputPromise=null/);
});

test('v201 serializes quick-create customer and per-item library writes',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/private customerSavePromise:Promise<void>\|null=null/);
  assert.match(editor,/if\(this\.customerSavePromise\)return this\.customerSavePromise/);
  assert.match(editor,/Promise\.resolve\(this\.props\.onSaveCustomer\(customer\)\)/);
  assert.match(editor,/private documentItemSavePromises=new Map<string,Promise<void>>\(\)/);
  assert.match(editor,/const existing=this\.documentItemSavePromises\.get\(item\.id\)/);
  assert.match(editor,/if\(existing\)return existing/);
  assert.match(editor,/Promise\.resolve\(this\.props\.onSaveDocumentItem\(item,currency\)\)/);
  assert.match(editor,/onSaveCustomer=\{this\.saveCustomerSingleFlight\}/);
  assert.match(editor,/onSaveDocumentItem=\{this\.saveDocumentItemSingleFlight\}/);
});

test('v201 puts revision and lifecycle mutations behind operation boundaries',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/private revisionPromise:Promise<LourexDocument>\|null=null/);
  assert.match(editor,/if\(this\.revisionPromise\)return this\.revisionPromise/);
  assert.match(editor,/private lifecyclePromises=new Map<string,Promise<void>>\(\)/);
  assert.match(editor,/private lifecycleSingleFlight=\(key:'discard'\|'void'\|'credit',action:\(\)=>Promise<void>\):Promise<void>=>\{/);
  assert.match(editor,/onBeginRevision=\{this\.beginRevisionSingleFlight\}/);
  assert.match(editor,/onDiscardRevision=\{this\.discardRevisionSingleFlight\}/);
  assert.match(editor,/onVoid=\{this\.voidDocumentSingleFlight\}/);
  assert.match(editor,/onCreateCreditNote=\{this\.createCreditNoteSingleFlight\}/);
});

test('v201 browser audit covers the editor field and action surface',async()=>{
  const runner=await read('tests/visual/run-functional-editor-controls-v201.cjs');
  for(const marker of [
    'invoice-core-fields-items-totals-terms',
    'proforma-date-customer-rtl',
    'save-item-single-flight',
    'new-customer-single-flight',
    'final-output-and-lifecycle-single-flight',
    'validation-and-touch-targets'
  ])assert.match(runner,new RegExp(marker));
  assert.match(runner,/Add Item must append exactly one row/);
  assert.match(runner,/quotation validity window must move with the issue date/);
  assert.match(runner,/rapid final PDF presses must prepare one output/);
  assert.match(runner,/undersized mobile controls/);
});

test('v201 is published as a fresh immutable PWA generation',async()=>{
  const sw=await read('public/sw.js');
  assert.ok(activeCacheVersion(sw)>=201,'active PWA generation must be v201 or newer');
  assert.match(sw,/lourex-invoice-v200: preserved as a legacy marker/);
});
