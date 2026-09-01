import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v119 document output layer loads after document composition layers and before final performance layer',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const output='./styles/document-output-v119.css';
  const content='./styles/document-content-v85.css';
  const performance='./styles/performance-polish-v100.css';
  assert.ok(html.includes(output));
  assert.ok(sw.includes(output));
  assert.ok(html.indexOf(output)>html.indexOf(content));
  assert.ok(html.indexOf(output)<html.indexOf(performance));
  assert.equal([...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].at(-1)?.[1],'performance-polish-v100.css');
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
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
  assert.match(css,/\.money-cell,[\s\S]*?direction:ltr/);
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
