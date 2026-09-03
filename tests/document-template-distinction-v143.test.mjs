import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const MODERN=['obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('v143 is retired and its distinction contract lives in the canonical layer',async()=>{
  const html=await read('index.html');
  assert.equal(html.indexOf('document-template-distinction-v143.css'),-1);
  assert.equal([...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].at(-1)?.[1],'document-premium-redesign-v141.css');
});

test('all fourteen modern template identities receive explicit v143 art direction',async()=>{
  const css=await read('src/styles/document-template-distinction-v143.css');
  for(const id of MODERN) assert.match(css,new RegExp(`template-${id} \\.header-modern`),id);
});

test('v143 keeps template text in normal flow and avoids overlay geometry',async()=>{
  const css=await read('src/styles/document-template-distinction-v143.css');
  assert.doesNotMatch(css,/position\s*:\s*absolute/i);
  assert.doesNotMatch(css,/::before|::after/);
  assert.match(css,/position:relative!important/);
  assert.match(css,/overflow:hidden!important/);
});

test('dark-identity templates stay on light printable paper',async()=>{
  const css=await read('src/styles/document-template-distinction-v143.css');
  for(const id of ['noir','midnight','blackivory','carbon']){
    assert.match(css,new RegExp(`template-${id} \\.header-modern\\{[\\s\\S]*?background:`),id);
  }
  assert.match(css,/@media print/);
  assert.match(css,/print-color-adjust:exact!important/);
});

test('RTL receives explicit mirrored treatment where directional composition is used',async()=>{
  const css=await read('src/styles/document-template-distinction-v143.css');
  assert.match(css,/template-split\.lang-ar/);
  assert.match(css,/template-noir\.lang-ar/);
  assert.match(css,/template-carbon\.lang-ar/);
});
