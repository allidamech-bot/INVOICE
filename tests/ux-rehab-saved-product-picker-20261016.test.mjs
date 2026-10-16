import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('quotation picker offers real accessible per-product checkbox and select-all-visible',async()=>{
  const source=await read('src/components/SavedItemsModal.tsx');
  assert.match(source,/picker\?<label className="saved-item-select-control">[\s\S]*?<input type="checkbox" checked=\{selected\}/);
  assert.match(source,/className="saved-item-select-all"[\s\S]*?<input type="checkbox" checked=\{allVisibleSelected\}/);
  assert.match(source,/onChange=\{\(\)=>this\.toggleVisibleSelection\(filtered\)\}/);
  assert.match(source,/onChange=\{\(\)=>this\.selectItem\(item\)\}/);
  assert.match(source,/Select all visible products/);
  assert.match(source,/Deselect all visible products/);
});

test('product rows show SKU, unit and price, and selection uses the existing safe bulk callback',async()=>{
  const source=await read('src/components/SavedItemsModal.tsx');
  assert.match(source,/saved-item-picker-meta/);
  assert.match(source,/item\.sku\?\`SKU \$\{item\.sku\}\`/);
  assert.match(source,/item\.lastUnitPrice/);
  assert.match(source,/await this\.props\.onSelectMany\(selected\)/);
  assert.match(source,/this\.props\.items\.filter\(item=>selectedIds\.has\(item\.id\)\)/);
  assert.match(source,/aria-pressed=\{picker\?selected:undefined\}/);
  assert.match(source,/picker\?<label className="saved-item-select-control">[\s\S]*?:<button type="button" className=\{\`saved-item-favorite/);
});

test('picker density never clips full names; checkboxes and edit controls remain touch-sized',async()=>{
  const css=await read('src/styles/saved-items-picker-v232.css');
  const scope=css.split('/* UX rehab A — quote/invoice saved-product picker only.')[1];
  assert.ok(scope,'batch A styles must be scoped to the saved-items picker');
  assert.match(scope,/\.saved-items-shell\.is-picker \.saved-item-main strong\{[\s\S]*?white-space:normal/);
  assert.match(scope,/\.saved-items-shell\.is-picker \.saved-item-row\.is-selected::after\{content:none\}/);
  assert.match(scope,/\.saved-items-shell\.is-picker \.saved-item-select-control\{[\s\S]*?min-height:48px/);
  assert.match(scope,/\.saved-items-shell\.is-picker \.saved-item-row>\.icon-btn\{[\s\S]*?height:44px/);
  assert.doesNotMatch(scope,/\.invoice-page|\.document-page|\.a4[-_]/i);
});

test('iPhone picker beats late modal-body overflow rules with one bounded scroll container',async()=>{
 const css=await read('src/styles/saved-items-picker-v232.css');
 const section=css.split('/* UX rehab A WebKit finding:')[1];
 assert.ok(section,'WebKit scroll containment must survive future cascade changes');
 assert.match(section,/html body #root \.app-ui \.modal:has\(\.saved-items-shell\.is-picker\)\{[\s\S]*?height:calc\(var\(--modal-visual-height/);
 assert.match(section,/html body #root \.app-ui \.modal:has\(\.saved-items-shell\.is-picker\)>\.modal-body\{[\s\S]*?height:0!important[\s\S]*?overflow:hidden!important/);
 assert.match(section,/html body #root \.app-ui \.saved-items-shell\.is-picker \.saved-items-list\{[\s\S]*?flex:1 1 0!important[\s\S]*?overflow-y:auto!important/);
 assert.match(section,/touch-action:pan-y!important/);
});
