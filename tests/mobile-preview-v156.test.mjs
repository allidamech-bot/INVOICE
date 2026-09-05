import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v156 is the final app preview layer before document output styling and ships offline',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.ok(html.indexOf('mobile-safe-area-v155.css')<html.indexOf('mobile-preview-v156.css'));
  assert.ok(html.indexOf('mobile-preview-v156.css')<html.indexOf('document-output-quality-v157.css'));
  assert.ok(html.indexOf('document-output-quality-v157.css')<html.indexOf('document-premium-redesign-v141.css'));
  assert.match(sw,/^const CACHE = 'lourex-invoice-v167';$/m);
  assert.ok(sw.includes("const CACHE = 'lourex-invoice-v156'"));
  assert.ok(sw.includes('./styles/mobile-preview-v156.css'));
});

test('v156 makes mobile preview a real viewport layer instead of normal editor flow',async()=>{
  const css=await read('src/styles/mobile-preview-v156.css');
  assert.match(css,/\.app-ui \.mobile-preview-overlay\{[\s\S]*position:fixed!important;[\s\S]*inset:0!important;[\s\S]*height:100dvh!important;[\s\S]*overflow:hidden!important/);
  assert.match(css,/\.app-ui \.mobile-preview-open \.mobile-preview-overlay\{[\s\S]*display:flex!important/);
  assert.match(css,/body:has\(\.app-ui \.editor-screen\.mobile-preview-open\)[\s\S]*overflow:hidden!important/);
});

test('v156 reserves the preview header above the scrollable document and respects iPhone safe areas',async()=>{
  const css=await read('src/styles/mobile-preview-v156.css');
  assert.match(css,/mobile-preview-overlay>header\{[\s\S]*position:relative!important;[\s\S]*flex:0 0 auto!important;[\s\S]*env\(safe-area-inset-top\)/);
  assert.match(css,/mobile-preview-stage\{[\s\S]*flex:1 1 auto!important;[\s\S]*min-height:0!important;[\s\S]*overflow:auto!important/);
  assert.match(css,/padding:14px max\(10px,env\(safe-area-inset-right\)\) calc\(24px \+ env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(css,/\.invoice-page\b/);
});