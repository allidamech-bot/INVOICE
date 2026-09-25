import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v337 is loaded by the runtime-promoted document owner after v333',async()=>{
  const owner=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(owner,/^@import url\("\.\/v333-critical-documents-visual-functional-closeout\.css\?v=333-1"\);\n@import url\("\.\/v337-template-layout-balance\.css\?v=337-1"\);/);
});

test('v337 keeps the commercial closing zone contiguous instead of splitting it across A4',async()=>{
  const css=await read('src/styles/v337-template-layout-balance.css');
  assert.match(css,/\.invoice-page \.final-details\{[\s\S]*display:block!important[\s\S]*flex:0 0 auto!important[\s\S]*margin-top:6mm!important/);
  assert.match(css,/\.invoice-page \.bottom-grid\{[\s\S]*margin-top:4\.5mm!important[\s\S]*padding-top:0!important[\s\S]*align-items:start!important/);
  assert.doesNotMatch(css,/\.invoice-page \.bottom-grid\{[\s\S]{0,180}margin-top:auto!important/);
  assert.doesNotMatch(css,/\.invoice-page \.final-details\{[\s\S]{0,180}flex:1 1 auto!important/);
});

test('v337 normalizes signature and stamp geometry without changing document output logic',async()=>{
  const css=await read('src/styles/v337-template-layout-balance.css');
  assert.match(css,/\.invoice-page \.signature-media\{[\s\S]*min-height:21mm!important/);
  assert.match(css,/\.signature-image\{[\s\S]*height:20mm!important[\s\S]*object-position:center bottom!important/);
  assert.match(css,/\.stamp-image\{[\s\S]*height:22mm!important[\s\S]*object-position:center bottom!important/);
  assert.match(css,/\.invoice-page \.doc-footer\{[\s\S]*flex:0 0 10mm!important[\s\S]*margin-inline:11mm!important/);
  assert.doesNotMatch(css,/firebase|indexedDB|localStorage|calculateTotals|saveVault|persist\(|onSave|onPrint/i);
});
