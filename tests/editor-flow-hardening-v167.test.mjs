import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addDaysIso, daysBetweenIso } from '../dist/src/lib/id.js';

const read=path=>readFile(path,'utf8');

test('ISO day spans preserve a user-selected quotation validity window',()=>{
  assert.equal(daysBetweenIso('2026-09-01','2026-09-15'),14);
  assert.equal(daysBetweenIso('2028-02-28','2028-03-01'),2);
  assert.equal(daysBetweenIso('2026-09-15','2026-09-01'),null);
  assert.equal(daysBetweenIso('2026-02-29','2026-03-01'),null);
  assert.equal(addDaysIso('2026-10-01',14),'2026-10-15');
});

test('quotation issue-date changes preserve validity duration and fall back safely',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/d\.kind==='proforma'/);
  assert.match(editor,/daysBetweenIso\(d\.issueDate,d\.dueDate\)\?\?normalizeValidityDays\(this\.props\.company\.defaultValidityDays\)/);
  assert.match(editor,/dueDate:addDaysIso\(value,validityDays\)/);
});

test('all item unit inputs share one valid datalist instead of duplicate DOM ids',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.equal((editor.match(/<datalist id="editor-unit-presets">/g)||[]).length,1);
  assert.match(editor,/list="editor-unit-presets"/);
  assert.doesNotMatch(editor,/id="units"/);
});

test('document design exposes every optional item table column',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/appearance-table-columns/);
  assert.match(editor,/checked=\{d\.appearance\.showHsCode\}[\s\S]{0,140}this\.appearance\('showHsCode',v\)/);
  assert.match(editor,/checked=\{d\.appearance\.showOrigin\}[\s\S]{0,140}this\.appearance\('showOrigin',v\)/);
  assert.match(editor,/checked=\{d\.appearance\.showPacking\}[\s\S]{0,140}this\.appearance\('showPacking',v\)/);
});

test('critical editor controls keep 44px touch targets on iPhone and iPad',async()=>{
  const design=await read('src/styles/design-system-v164.css');
  const coarse=design.slice(design.indexOf('@media(pointer:coarse)'));
  assert.match(coarse,/\.app-ui \.mobile-action-buttons \.btn/);
  assert.match(coarse,/\.app-ui \.editor-section-nav-button/);
  assert.match(coarse,/\.app-ui \.item-card-actions \.icon-btn/);
  assert.match(coarse,/\.app-ui \.editor-top-left>\.icon-btn/);
  assert.match(coarse,/min-height:44px!important/);
  assert.match(coarse,/min-width:44px!important/);
});
