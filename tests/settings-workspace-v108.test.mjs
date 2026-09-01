import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('v108 keeps long settings forms easy to save and visually flat',async()=>{
  const css=await read('src/styles/settings-workspace-v108.css');
  assert.match(css,/\.app-ui \.settings-title\{[\s\S]*position:sticky/);
  assert.match(css,/\.app-ui \.settings-section\{[\s\S]*border-radius:0!important/);
  assert.match(css,/\.app-ui \.settings-section\{[\s\S]*box-shadow:none!important/);
  assert.match(css,/\.app-ui \.asset-settings\{[\s\S]*grid-template-columns:minmax\(0,1\.4fr\)/);
  assert.match(css,/\.app-ui \.numbering-preview\{[\s\S]*grid-template-columns:1fr 1fr/);
});

test('v108 removes cramped paired settings inputs on phones',async()=>{
  const css=await read('src/styles/settings-workspace-v108.css');
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/\.app-ui \.settings-panel \.form-grid\.two,[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/\.app-ui \.settings-title\{[\s\S]*grid-template-columns:minmax\(0,1fr\) auto!important/);
  assert.match(css,/\.app-ui \.asset-settings>\.logo-asset-control\{[\s\S]*grid-column:1 \/ -1/);
});

test('v108 remains application-only and respects motion/touch ergonomics',async()=>{
  const css=await read('src/styles/settings-workspace-v108.css');
  assert.match(css,/@media \(hover:none\), \(pointer:coarse\)/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media print\{[\s\S]*\.app-ui \.settings-layout\{display:none!important\}/);
  assert.doesNotMatch(css,/\.invoice-page|\.items-table|\.doc-header|\.totals-block/);
});

test('v108 loads before final performance layer and is cached offline',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const settings=html.indexOf('./styles/settings-workspace-v108.css');
  const performance=html.indexOf('./styles/performance-polish-v100.css');
  assert.ok(settings>=0,'v108 stylesheet should be linked');
  assert.ok(performance>settings,'v100 must stay the final performance layer');
  assert.match(sw,/settings-workspace-v108\.css/);
  assert.match(sw,/v108/);
  assert.match(sw,/v107/);
  assert.match(sw,/v103/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
});
