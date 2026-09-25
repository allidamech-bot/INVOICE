import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v337 is loaded by the runtime-promoted document owner after v333',async()=>{
  const owner=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(owner,/^@import url\("\.\/v333-critical-documents-visual-functional-closeout\.css\?v=333-1"\);\n@import url\("\.\/v337-template-layout-balance\.css\?v=337-1"\);/);
});

test('v337 keeps the complete commercial closing zone contiguous instead of splitting it across A4',async()=>{
  const css=await read('src/styles/v337-template-layout-balance.css');
  assert.match(css,/\.invoice-page \.final-details\{[\s\S]*display:block!important[\s\S]*flex:0 0 auto!important[\s\S]*margin-top:auto!important[\s\S]*padding-top:6mm!important/);
  assert.match(css,/\.invoice-page\.details-only \.final-details\{[\s\S]*margin-top:0!important[\s\S]*padding-top:0!important/);
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

test('mobile editor scroll owner stays inside the shell grid row instead of claiming a second full viewport',async()=>{
  const recovery=await read('src/styles/v331-draft-scroll-recovery.css');
  const commercial=recovery.slice(recovery.indexOf('@media screen and (max-width:900px)'),recovery.indexOf('/* Draft Studio uses'));
  const draft=recovery.slice(recovery.indexOf('@media screen and (max-width:1180px)'),recovery.indexOf('@media screen and (max-width:720px)'));
  for(const block of [commercial,draft]){
    assert.match(block,/\.ta-main[\s\S]*height:auto!important/);
    assert.match(block,/\.ta-main[\s\S]*min-height:0!important/);
    assert.match(block,/\.ta-main[\s\S]*max-height:none!important/);
    assert.match(block,/\.ta-main[\s\S]*align-self:stretch!important/);
    assert.match(block,/\.ta-main[\s\S]*overflow-y:auto!important/);
    assert.doesNotMatch(block,/\.ta-main[\s\S]{0,260}height:100dvh!important/);
  }
});

test('production entry cache-busts the repaired Safari scroll owner and document runtime',async()=>{
  const html=await read('index.html');
  assert.match(html,/v331-draft-scroll-recovery\.css\?v=337-2/);
  assert.doesNotMatch(html,/v331-draft-scroll-recovery\.css\?v=331-1/);
  assert.match(html,/document-entry-v302\.js\?v=337-2/);
});
