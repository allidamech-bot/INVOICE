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
