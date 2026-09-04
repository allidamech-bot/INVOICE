import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v114 manual save stays in the editor while Back remains the save-and-close path',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/private save=async\(auto=false\)/);
  assert.match(core,/private saveAndClose=async\(\)=>/);
  assert.match(core,/try\{await this\.props\.onSave\(snapshot,true\);this\.props\.onClose\(\);\}/);
  assert.doesNotMatch(core,/if\(!auto&&!hasNewerChanges\)\{this\.props\.onClose\(\);return;\}/);
});

test('v114 mobile workflow exposes the correct primary action plus preview PDF and share',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/mobile-editor-actionbar mobile-workflow-\$\{workflow\}/);
  assert.match(core,/readiness\.ready\?<Button icon="check" variant="primary" onClick=\{\(\)=>this\.openReview\('issue'\)\}/);
  assert.match(core,/mobile-action-buttons/);
  assert.match(core,/onClick=\{\(\)=>void this\.output\('pdf'\)\}>PDF/);
  assert.match(core,/onClick=\{\(\)=>void this\.output\('share'\)\}>\{t\('Share','مشاركة'\)\}/);
  assert.match(core,/mobile-preview-overlay[\s\S]*output\('share'\)/);
});

test('v114 carries typed customer search into the quick-create form',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/blankCustomer\(this\.state\.customerQuery\)/);
});

test('v114 keeps current-page semantics while manual header and settings lock controls stay retired',async()=>{
  const [shell,cloudCss]=await Promise.all([read('src/components/AppShell.tsx'),read('src/styles/cloud.css')]);
  assert.match(shell,/aria-current=\{this\.props\.screen===screen\?'page':undefined\}/);
  assert.match(shell,/aria-current=\{this\.props\.screen==='documents'\?'page':undefined\}/);
  assert.match(shell,/aria-current=\{this\.props\.screen==='customers'\?'page':undefined\}/);
  assert.match(shell,/this\.navButton\('items','items'/);
  assert.match(cloudCss,/\.auth-cloud-launcher,\.cloud-header-button,\.header-lock-button,\.settings-panel \.settings-section:has\(select option\[value="30"\]\)>\.btn\{display:none!important\}/);
});

test('v114 responsive layer keeps four actions usable and does not leak into printed invoices',async()=>{
  const css=await read('src/styles/customer-ux-closeout-v114.css');
  assert.match(css,/\.app-ui \.mobile-action-buttons/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(css,/@media\(max-width:430px\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/@media print/);
  assert.match(css,/\.app-ui \.mobile-editor-actionbar/);
  assert.doesNotMatch(css,/\.invoice-page|\.items-table|\.doc-header|\.totals-block/);
});

test('v114 stylesheet is loaded before the performance layer and remains available offline',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const ux='./styles/customer-ux-closeout-v114.css';
  const perf='./styles/performance-polish-v100.css';
  assert.ok(index.indexOf(ux)>-1&&index.indexOf(ux)<index.indexOf(perf));
  assert.ok(sw.includes(ux));
  assert.match(sw,/v114/);
  assert.match(sw,/v113/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
});
