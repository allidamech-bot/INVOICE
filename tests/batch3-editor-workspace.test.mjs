import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('batch 3 makes one editor command surface authoritative without touching A4 output',async()=>{
  const [html,css,core]=await Promise.all([
    read('index.html'),read('src/styles/editor-workspace-v162.css'),read('src/components/EditorPageCore.tsx')
  ]);
  assert.match(html,/styles\/editor-workspace-v162\.css/);
  assert.ok(html.indexOf('dashboard-documents.css')<html.indexOf('editor-workspace-v162.css'));
  assert.ok(html.indexOf('editor-workspace-v162.css')<html.indexOf('document-premium-redesign-v141.css'));
  assert.match(css,/workspace-shell\.is-editor>\.workspace-topbar\{display:none!important\}/);
  assert.match(css,/\.app-ui \.editor-topbar\{[\s\S]*grid-template-columns:minmax\(220px,1fr\) auto auto minmax\(0,max-content\)!important/);
  assert.match(core,/className="editor-topbar"/);
  assert.doesNotMatch(css,/\.invoice-page\s*\{/);
  assert.doesNotMatch(css,/\.items-table\s*\{/);
});

test('batch 3 desktop editor reserves independent scrolling for form and A4 preview',async()=>{
  const css=await read('src/styles/editor-workspace-v162.css');
  assert.match(css,/\.app-ui \.editor-screen\{[\s\S]*height:100dvh[\s\S]*display:flex!important[\s\S]*overflow:hidden!important/);
  assert.match(css,/\.app-ui \.editor-layout\{[\s\S]*grid-template-columns:minmax\(520px,46%\) minmax\(0,54%\)!important[\s\S]*overflow:hidden!important/);
  assert.match(css,/\.app-ui \.editor-pane\{[\s\S]*height:100%!important[\s\S]*overflow:hidden!important/);
  assert.match(css,/\.app-ui \.editor-scroll\{[\s\S]*height:100%!important[\s\S]*overflow:auto!important/);
  assert.match(css,/\.app-ui \.preview-pane\{[\s\S]*display:flex!important[\s\S]*overflow:hidden!important/);
  assert.match(css,/\.app-ui \.preview-stage\{[\s\S]*overflow:auto!important/);
});

test('batch 3 keeps the six-step form calm and prevents nested control overflow',async()=>{
  const [css,core,wrapper]=await Promise.all([
    read('src/styles/editor-workspace-v162.css'),read('src/components/EditorPageCore.tsx'),read('src/components/EditorPage.tsx')
  ]);
  for(const number of ['01','02','03','04','05','06'])assert.match(core,new RegExp(`>${number}<`));
  assert.match(wrapper,/editor-section-navigator/);
  assert.match(css,/\.app-ui \.editor-section\{[\s\S]*border-radius:15px!important/);
  assert.match(css,/\.app-ui \.form-grid\.two\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.app-ui \.item-pricing-grid\{[\s\S]*grid-template-columns:minmax\(90px,\.75fr\) minmax\(120px,\.9fr\) minmax\(150px,1\.15fr\)!important/);
  assert.match(css,/\.app-ui \.customer-dropdown\{[\s\S]*max-height:min\(360px,48vh\)!important[\s\S]*overflow:auto!important/);
  assert.match(css,/\.app-ui \.premium-selected-customer>div\{min-width:0!important\}/);
});

test('batch 3 mobile editor uses reserved action and step docks instead of overlays',async()=>{
  const css=await read('src/styles/editor-workspace-v162.css');
  const mobile=css.slice(css.indexOf('@media(max-width:900px)'));
  assert.match(mobile,/\.app-ui \.editor-topbar>[\s\S]*\.editor-actions\{display:none!important\}/);
  assert.match(mobile,/\.app-ui \.editor-layout\{[\s\S]*flex:1 1 0!important[\s\S]*overflow:hidden!important/);
  assert.match(mobile,/\.app-ui \.editor-pane\{[\s\S]*height:100%!important/);
  assert.match(mobile,/\.app-ui \.input,[\s\S]*font-size:16px!important/);
  assert.match(mobile,/\.app-ui \.editor-section-nav-slot\{[\s\S]*overflow-x:auto!important/);
  assert.match(mobile,/\.app-ui \.mobile-editor-actionbar\{[\s\S]*position:relative!important[\s\S]*min-height:calc\(64px \+ env\(safe-area-inset-bottom\)\)!important/);
  assert.match(mobile,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
});

test('batch 3 preserves save issue preview PDF share and offline contracts',async()=>{
  const [core,sw,css]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),read('public/sw.js'),read('src/styles/editor-workspace-v162.css')
  ]);
  assert.match(core,/window\.setTimeout\(\(\)=>void this\.save\(true\),450\)/);
  assert.match(core,/this\.openReview\('issue'\)/);
  assert.match(core,/this\.output\('pdf'\)/);
  assert.match(core,/this\.output\('share'\)/);
  assert.match(core,/mobile-preview-overlay/);
  assert.match(sw,/\.\/styles\/editor-workspace-v162\.css/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v169';$/m);
  assert.match(css,/@media print\{[\s\S]*\.app-ui \.editor-screen[\s\S]*display:none!important/);
});