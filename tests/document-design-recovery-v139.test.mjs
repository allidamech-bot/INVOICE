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

test('v139 preserves the complete final document design cascade in source order',async()=>{
  const html=await read('index.html');
  let previous=html.indexOf('performance-polish-v100.css');
  assert.ok(previous>=0);
  for(const name of designLayers){
    const current=html.indexOf(name);
    assert.ok(current>previous,`${name} must remain after the prior design layer`);
    previous=current;
  }
  assert.equal(designLayers.at(-1),'document-final-qa-v130.css');
});

test('v139 production bundle contains v120-v130 and removes local network imports',async()=>{
  const [bundle,distHtml]=await Promise.all([read('dist/styles/app.bundle.css'),read('dist/index.html')]);
  let previous=-1;
  for(const name of designLayers){
    const marker=`/* --- ${name} --- */`;
    const current=bundle.indexOf(marker);
    assert.ok(current>previous,`${name} must be bundled in exact cascade order`);
    previous=current;
  }
  assert.doesNotMatch(distHtml,/@import url\("\.\/styles\//);
  assert.deepEqual([...distHtml.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(m=>m[1]),['app.bundle.css']);
});

test('v139 offline source cache contains every final design layer',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v139';$/m);
  for(const name of designLayers)assert.ok(sw.includes(`"./styles/${name}"`),`${name} must be available offline`);
});

test('v139 retains all 18 established quote and invoice template identities',async()=>{
  const [types,v128,v129,v130]=await Promise.all([
    read('src/types.ts'),
    read('src/styles/document-flagship-v128.css'),
    read('src/styles/document-template-system-v129.css'),
    read('src/styles/document-final-qa-v130.css')
  ]);
  for(const id of templateIds)assert.ok(types.includes(`'${id}'`),`${id} template identity must remain supported`);
  for(const id of ['executive','trade','obsidian','prism','noir','carbon'])assert.match(v128,new RegExp(`\\.template-${id}\\b`));
  for(const id of ['minimal','signature','cobalt','editorial','split','slate','horizon','mono','aurora','ledger','midnight','blackivory'])assert.match(v129,new RegExp(`\\.template-${id}\\b`));
  assert.match(v130,/\.invoice-page/);
});
