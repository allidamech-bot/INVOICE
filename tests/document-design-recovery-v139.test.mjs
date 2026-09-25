import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const designLayers=[
  'document-art-direction-v120.css',
  'document-palette-v121.css',
  'mobile-document-actions-v122.css',
  'mobile-document-actions-v123.css',
  'mobile-document-actions-v124.css',
  'mobile-document-actions-v125.css',
  'document-dark-contrast-v126.css',
  'document-flagship-v128.css',
  'document-template-system-v129.css',
  'document-final-qa-v130.css'
];
const templateIds=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];
const localStyles=html=>[...html.matchAll(/href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"/g)].map(m=>m[1]);

test('canonical recovery removes the historical document cascade from runtime',async()=>{
  const html=await read('index.html');
  for(const name of designLayers.filter(name=>!name.startsWith('mobile-document-actions')))assert.equal(html.indexOf(name),-1,`${name} must be retired`);
  assert.match(html,/href="\.\/styles\/document-premium-redesign-v141\.css"/);
  assert.match(html,/href="\.\/styles\/v331-draft-scroll-recovery\.css\?v=337-3"/);
});

test('production bundle keeps one canonical A4 layer and only one standalone v337 runtime owner',async()=>{
  const [bundle,distHtml,recovery]=await Promise.all([
    read('dist/styles/app.bundle.css'),
    read('dist/index.html'),
    read('dist/styles/v331-draft-scroll-recovery.css')
  ]);
  assert.match(bundle,/\/\* --- document-premium-redesign-v141\.css --- \*\//);
  for(const name of designLayers.filter(name=>!name.startsWith('mobile-document-actions')))assert.equal(bundle.indexOf(`/* --- ${name} --- */`),-1);
  assert.deepEqual(localStyles(distHtml),['app.bundle.css','v331-draft-scroll-recovery.css']);
  assert.match(distHtml,/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.match(distHtml,/data-lourex-v331-draft-recovery="true"/);
  assert.match(recovery,/^@import url\("\.\/v333-critical-documents-visual-functional-closeout\.css\?v=333-1"\);\n@import url\("\.\/v337-template-layout-balance\.css\?v=337-3"\);/);
  assert.doesNotMatch(distHtml,/@import url\("\.\/styles\//);
});

test('v139 offline source cache retains every recovered design layer after later cache upgrades',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v139/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v\d+';$/m);
  for(const name of designLayers)assert.ok(sw.includes(`"./styles/${name}"`),`${name} must remain available offline`);
});

test('v139 retains all 18 established quote and invoice template identities',async()=>{
  const [types,v128,v129,v130]=await Promise.all([
    read('src/types.ts'),
    read('src/styles/document-flagship-v128.css'),
    read('src/styles/document-template-system-v129.css'),
    read('src/styles/document-final-qa-v130.css')
  ]);
  const artDirection=`${v128}\n${v129}`;
  for(const id of templateIds){
    assert.ok(types.includes(`'${id}'`),`${id} template identity must remain supported`);
    assert.match(artDirection,new RegExp(`\\.template-${id}\\b`),`${id} must retain explicit final art direction`);
  }
  assert.match(v130,/\.invoice-page/);
});
