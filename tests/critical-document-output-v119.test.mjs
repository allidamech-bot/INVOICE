import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('canonical document output layer is the single final A4 stylesheet',async()=>{
  const [html,sw,css]=await Promise.all([read('index.html'),read('public/sw.js'),read('src/styles/document-premium-redesign-v141.css')]);
  const design='./styles/document-premium-redesign-v141.css';
  assert.ok(html.includes(design));
  assert.ok(sw.includes(design));
  assert.equal([...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].at(-1)?.[1],'document-premium-redesign-v141.css');
  assert.match(css,/@page\{size:A4;margin:0\}/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v146'/);
});

test('v119 keeps terms totals notes and other closing details at the bottom of the A4 body',async()=>{
  const css=await read('src/styles/document-output-v119.css');
  assert.match(css,/\.invoice-page:not\(\.details-only\) \.final-details\{[\s\S]*?margin-top:auto!important/);
  assert.match(css,/\.invoice-page \.doc-body\{[\s\S]*?display:flex;[\s\S]*?flex-direction:column/);
  assert.match(css,/@media print\{[\s\S]*?\.final-details[\s\S]*?margin-top:auto!important/);
  assert.match(css,/break-inside:avoid!important/);
});

test('v119 protects Arabic shaping while allowing mixed Arabic English numeric trade values',async()=>{
  const css=await read('src/styles/document-output-v119.css');
  assert.match(css,/letter-spacing:normal!important/);
  assert.match(css,/font-variant-ligatures:common-ligatures contextual/);
  assert.match(css,/font-feature-settings:"rlig" 1,"calt" 1,"liga" 1/);
  assert.match(css,/\.term-row>span,[\s\S]*?unicode-bidi:plaintext/);
  assert.match(css,/\.invoice-page\.lang-ar \.money-cell,/);
  assert.match(css,/direction:ltr;\s*\n\s*unicode-bidi:isolate;/);
});

test('iOS PDF/share bridge explicitly stabilizes bidi direction and Arabic font readiness before html2canvas capture',async()=>{
  const bridge=await read('public/ios-print-bridge.js');
  assert.match(bridge,/ARABIC_TEXT_RE/);
  assert.match(bridge,/firstStrongDirection/);
  assert.match(bridge,/stabilizeDocumentDirection/);
  assert.match(bridge,/document\.fonts\.load\('400 12px "Noto Sans Arabic"','العربية'\)/);
  assert.match(bridge,/document\.fonts\.load\('700 12px "Noto Sans Arabic"','العربية'\)/);
  assert.match(bridge,/letter-spacing', 'normal'/);
  assert.match(bridge,/onclone:\(clonedDocument\)=>/);
  assert.match(bridge,/html2canvas@1\.4\.1/);
  assert.doesNotMatch(bridge,/\.reverse\(\)/);
});
