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

test('canonical recovery removes the historical document cascade from runtime',async()=>{
  const html=await read('index.html');
  for(const name of designLayers.filter(name=>!name.startsWith('mobile-document-actions')))assert.equal(html.indexOf(name),-1,`${name} must be retired`);
  assert.equal([...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].at(-1)?.[1],'document-premium-redesign-v141.css');
});

test('production bundle contains one canonical document layer and removes local imports',async()=>{
  const [bundle,distHtml]=await Promise.all([read('dist/styles/app.bundle.css'),read('dist/index.html')]);
  assert.match(bundle,/\/\* --- document-premium-redesign-v141\.css --- \*\//);
  for(const name of designLayers.filter(name=>!name.startsWith('mobile-document-actions')))assert.equal(bundle.indexOf(`/* --- ${name} --- */`),-1);
  assert.doesNotMatch(distHtml,/@import url\("\.\/styles\//);
  assert.deepEqual([...distHtml.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(m=>m[1]),['app.bundle.css']);
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
