import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('canonical light-paper layer replaces the retired fully-dark contrast layer',async()=>{
  const [html,css]=await Promise.all([
    read('index.html'),
    read('src/styles/document-premium-redesign-v141.css')
  ]);
  assert.doesNotMatch(html,/document-dark-contrast-v126\.css/);
  assert.equal([...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].at(-1)?.[1],'document-premium-redesign-v141.css');

  for(const name of ['template-noir','template-midnight','template-blackivory','template-carbon']){
    assert.match(css,new RegExp(name));
  }
  assert.match(css,/\.template-noir\{--paper:#fffdf8/);
  assert.match(css,/\.template-midnight\{--paper:#fcfaf4/);
  assert.match(css,/\.term-row>span/);
  assert.match(css,/\.notes-block p/);
  assert.match(css,/\.bank-block>div>span/);
  assert.match(css,/\.continued-label/);
});

test('v126 preserves intentional light and accent surfaces',async()=>{
  const css=await read('src/styles/document-dark-contrast-v126.css');
  assert.match(css,/template-blackivory \.party-customer[\s\S]*?color:#191816!important/);
  assert.match(css,/template-blackivory \.totals-block[\s\S]*?color:#29251f!important/);
  assert.match(css,/template-noir \.modern-title[\s\S]*?color:#12100d!important/);
  assert.match(css,/template-split \.modern-brand[\s\S]*?color:var\(--accent-ink\)!important/);
});

test('v126 also protects dark mastheads on otherwise-light templates',async()=>{
  const css=await read('src/styles/document-dark-contrast-v126.css');
  for(const name of ['template-executive','template-obsidian','template-split','template-aurora']){
    assert.match(css,new RegExp(name));
  }
  assert.match(css,/template-slate \.modern-meta \.doc-meta span\{color:#fff!important\}/);
  assert.match(css,/not\(:first-child\)\.template-slate[\s\S]*?color:#13232f!important/);
});
