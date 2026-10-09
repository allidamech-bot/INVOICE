import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('canonical A4 base and final document finish remain distinct from app chrome',async()=>{
  const [html,sw,css,build]=await Promise.all([
    read('index.html'),read('public/sw.js'),
    read('src/styles/document-premium-redesign-v141.css'),
    read('scripts/build.mjs')
  ]);
  const base='./styles/document-premium-redesign-v141.css';
  const activeFinish='./styles/v332-critical-documents-deep-closeout.css';
  assert.ok(html.includes(base),'canonical printable base must remain available');
  assert.ok(sw.includes(base),'historical installed PWA must retain its safe base asset');
  assert.ok(html.includes(activeFinish),'current document final owner must be explicit');
  assert.ok(html.indexOf(activeFinish)>html.indexOf(base),'final document finish follows printable base');
  assert.ok(html.indexOf(activeFinish)>html.indexOf('./styles/tailadmin-editor-core-v320.css'),
    'document semantics must not be owned by editor app chrome');
  assert.match(css,/@page\{size:A4;margin:0\}/);
  assert.match(build,/v332-critical-documents-deep-closeout\.css/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v\d+'/);
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
