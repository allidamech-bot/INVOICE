import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');

test('shared modal shell locks background scrolling and stays safe with nested dialogs',()=>{
  const ui=read('src/components/UI.tsx');
  assert.match(ui,/let openModalFrames=0/);
  assert.match(ui,/document\.body\.style\.overflow='hidden'/);
  assert.match(ui,/openModalFrames=Math\.max\(0,openModalFrames-1\)/);
  assert.match(ui,/if\(openModalFrames===0\)document\.body\.style\.overflow=bodyOverflowBeforeModals/);
  assert.match(ui,/onPointerDown=/);
});

test('toast feedback never blocks the controls underneath it',()=>{
  const ui=read('src/components/UI.tsx');
  assert.match(ui,/pointerEvents:'none'/);
  assert.match(ui,/role=\{error\?'alert':'status'\}/);
  assert.match(ui,/aria-live=\{error\?'assertive':'polite'\}/);
});

test('mobile document action menu closes on outside press or Escape',()=>{
  const page=read('src/components/DocumentsPage.tsx');
  assert.match(page,/document\.addEventListener\('pointerdown',this\.handleOutsidePointer\)/);
  assert.match(page,/document\.removeEventListener\('pointerdown',this\.handleOutsidePointer\)/);
  assert.match(page,/target\.closest\('\.mobile-actions'\)/);
  assert.match(page,/event\.key==='Escape'/);
  assert.match(page,/<button type="button" className="document-main"/);
  assert.match(page,/<button type="button" onClick=\{\(\)=>this\.runAction/);
});

test('customer editor warns before discarding unsaved changes',()=>{
  const page=read('src/components/CustomersPage.tsx');
  assert.match(page,/editingInitial:string/);
  assert.match(page,/private editingDirty=/);
  assert.match(page,/private requestClose=/);
  assert.match(page,/onClose=\{this\.requestClose\}/);
  assert.match(page,/Discard customer changes\?/);
  assert.match(page,/onConfirm=\{this\.closeEditing\}/);
});

test('saved-item editor protects dirty edits across close and item selection',()=>{
  const modal=read('src/components/SavedItemsModal.tsx');
  assert.match(modal,/type DiscardAction=''\|'editor'\|'modal'\|'select'/);
  assert.match(modal,/private editingDirty=/);
  assert.match(modal,/private requestModalClose=/);
  assert.match(modal,/private selectItem=/);
  assert.match(modal,/onClose=\{this\.requestModalClose\}/);
  assert.match(modal,/Discard item changes\?/);
  assert.match(modal,/onConfirm=\{this\.confirmDiscard\}/);
});
