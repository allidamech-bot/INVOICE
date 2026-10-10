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

test('current settings hierarchy is in the active source and installed offline bundle',async()=>{
 const [html,sw,css,bundle]=await Promise.all([read('index.html'),read('dist/sw.js'),read('src/styles/tailadmin-settings-v320.css'),read('dist/styles/app.bundle.css')]);
 assert.equal(html.includes('settings-workspace-v108.css'),false,'old settings sheet cannot override current shell');
 assert.ok(html.includes('tailadmin-settings-v320.css'));
 assert.ok(css.includes('.ta-settings-shell')&&css.includes('.ta-settings-page'));
 assert.ok(bundle.includes('tailadmin-settings-v320.css'));
 assert.ok(sw.includes('styles/app.bundle.css'));
});

