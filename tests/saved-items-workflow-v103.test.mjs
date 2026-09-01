import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyItem } from '../dist/src/lib/documents.js';
import { findSavedItemDuplicate, markSavedItemsUsed, mergeSavedItemSelections, parseSavedItemTags } from '../dist/src/lib/saved-items.js';

const read=path=>readFile(path,'utf8');

function saved(id,descriptionEn,overrides={}){
  return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',descriptionEn,descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'10',lastCurrency:'USD',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z',...overrides};
}

test('v103 replaces the pristine first row and can add several saved items together',()=>{
  const first=saved('one','First');
  const second=saved('two','Second',{lastCurrency:'EUR',lastUnitPrice:'25'});
  const items=mergeSavedItemSelections([emptyItem()],[first,second],'USD');
  assert.equal(items.length,2);
  assert.equal(items[0].descriptionEn,'First');
  assert.equal(items[0].unitPrice,'10');
  assert.equal(items[1].descriptionEn,'Second');
  assert.equal(items[1].unitPrice,'');
});

test('v103 keeps a meaningful existing document row and appends selections',()=>{
  const existing={...emptyItem(),descriptionEn:'Existing',unitPrice:'5'};
  const items=mergeSavedItemSelections([existing],[saved('one','First')],'USD');
  assert.equal(items.length,2);
  assert.equal(items[0].id,existing.id);
  assert.equal(items[1].descriptionEn,'First');
});

test('v103 records real use and prevents normalized duplicate names',()=>{
  const original=saved('one','  Energy   Drink  ');
  const duplicate=saved('two','energy drink');
  assert.equal(findSavedItemDuplicate([original],duplicate)?.id,'one');
  const [used]=markSavedItemsUsed([original],[original],'2026-08-31T10:00:00.000Z');
  assert.equal(used.usageCount,1);
  assert.equal(used.lastUsedAt,'2026-08-31T10:00:00.000Z');
});

test('v103 accepts Arabic and English commas in tags',()=>{
  assert.deepEqual(parseSavedItemTags('طاقة، 250ml, مشروب'),['طاقة','250ml','مشروب']);
});

test('v103 exposes a first-class Items page and multi-select picker offline',async()=>{
  const [app,page,modal,editor,sw]=await Promise.all([
    read('src/app/App.tsx'),read('src/components/SavedItemsPage.tsx'),read('src/components/SavedItemsModal.tsx'),read('src/components/EditorPageCore.tsx'),read('public/sw.js')
  ]);
  assert.match(app,/screen:'documents'\|'customers'\|'items'\|'editor'/);
  assert.match(app,/screen==='items'/);
  assert.match(page,/ProductLibraryWorkspace/);
  assert.match(modal,/onSelectMany/);
  assert.match(modal,/saved-items-picker-bar/);
  assert.match(editor,/SavedItemsModal/);
  assert.match(editor,/mergeSavedItemSelections/);
  assert.ok(sw.includes('./src/components/SavedItemsPage.js'));
  assert.ok(sw.includes('./src/components/SavedItemsModal.js'));
  assert.ok(sw.includes('./src/components/ProductLibraryWorkspace.js'));
  assert.match(sw,/v103/);
});
