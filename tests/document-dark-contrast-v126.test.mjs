import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('canonical light-paper A4 layer remains active without retired dark override',async()=>{
 const [html,css]=await Promise.all([read('index.html'),read('src/styles/document-premium-redesign-v141.css')]);
 assert.equal(html.includes('document-dark-contrast-v126.css'),false);
 assert.equal([...html.matchAll(/href="\.\/styles\/document-premium-redesign-v141\.css"/g)].length,1,'one canonical commercial paper owner');
 assert.ok(html.includes('tailadmin-documents-v320.css'),'screen-only workspaces follow the canonical paper owner');
 for(const id of ['noir','midnight','blackivory','carbon'])assert.match(css,new RegExp('\\.template-'+id+'\\{--paper:#(?:fff|fc|fb|fa)'));
 for(const rule of ['.term-row>span','.notes-block p','.bank-block>div>span','.continued-label'])assert.ok(css.includes(rule),rule);
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
