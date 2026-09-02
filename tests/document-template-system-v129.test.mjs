import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v129 template system is loaded after flagship v128 without touching app chrome',async()=>{
  const [html,css]=await Promise.all([
    read('index.html'),
    read('src/styles/document-template-system-v129.css')
  ]);
  assert.match(html,/document-flagship-v128\.css[^<]*document-template-system-v129\.css/);
  assert.match(css,/\.invoice-page:is\(\.template-minimal,/);
  assert.doesNotMatch(css,/\.app-shell|\.documents-page|\.editor-shell/);
});

test('all twelve second-batch templates have explicit art direction',async()=>{
  const css=await read('src/styles/document-template-system-v129.css');
  for(const id of ['minimal','obsidian','cobalt','split','prism','slate','horizon','mono','aurora','ledger','noir','carbon']){
    assert.match(css,new RegExp(`template-${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`),id);
  }
  assert.match(css,/Minimal — Swiss restraint/);
  assert.match(css,/Obsidian — architectural black masthead/);
  assert.match(css,/Ledger — structured trade document/);
});

test('batch 2 increases A4 readability and keeps buyer and final total dominant',async()=>{
  const css=await read('src/styles/document-template-system-v129.css');
  assert.match(css,/font-size:9\.9px/);
  assert.match(css,/\.party-customer \.party-name\{\s*font-size:13\.8px/);
  assert.match(css,/\.items-table td\{\s*padding:2\.75mm 1\.5mm;\s*font-size:8\.1px/);
  assert.match(css,/\.grand-total strong\{\s*font-size:12\.7px/);
});

test('noir and carbon use dark identity with light printable document bodies',async()=>{
  const css=await read('src/styles/document-template-system-v129.css');
  assert.match(css,/\.invoice-page\.template-noir\{[\s\S]*background:var\(--b2-ivory\)!important/);
  assert.match(css,/\.invoice-page\.template-carbon\{[\s\S]*background:#fbfaf7!important/);
  assert.match(css,/template-noir \.header-modern\{[\s\S]*background:#121416/);
  assert.match(css,/template-carbon \.header-modern\{[\s\S]*background:linear-gradient\(120deg,#22262a,#34393e\)/);
  assert.match(css,/@media print\{[\s\S]*print-color-adjust:exact/);
});

test('aurora stays within LOUREX navy teal gold palette and avoids purple drift',async()=>{
  const css=await read('src/styles/document-template-system-v129.css');
  const aurora=css.slice(css.indexOf('10. Aurora'),css.indexOf('11. Ledger'));
  assert.match(aurora,/#0b2b3d/);
  assert.match(aurora,/#174b58/);
  assert.match(aurora,/#b58b4f/);
  assert.doesNotMatch(aurora,/#6f64ce|purple|violet|magenta/i);
});

test('directional accents use logical inline properties for RTL-safe mirroring',async()=>{
  const css=await read('src/styles/document-template-system-v129.css');
  assert.match(css,/border-inline-start/);
  assert.match(css,/border-inline-end/);
  assert.match(css,/padding-inline-start/);
  assert.match(css,/padding-inline-end/);
});
