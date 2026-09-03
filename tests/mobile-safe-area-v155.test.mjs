import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v155 loads after application recovery and is cached for installed PWAs',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.ok(html.indexOf('ux-recovery-v152.css')<html.indexOf('mobile-safe-area-v155.css'));
  assert.ok(html.indexOf('mobile-safe-area-v155.css')<html.indexOf('document-premium-redesign-v141.css'));
  assert.match(sw,/const CACHE = 'lourex-invoice-v155'/);
  assert.ok(sw.includes('./styles/mobile-safe-area-v155.css'));
});

test('v155 preserves a full editor header below the iPhone safe area',async()=>{
  const css=await read('src/styles/mobile-safe-area-v155.css');
  assert.match(css,/body:has\(\.editor-screen\)[\s\S]*--header:calc\(var\(--mobile-editor-header-content-height\) \+ env\(safe-area-inset-top\)\)/);
  assert.match(css,/app-header:has\(\.header-editor-context\)[\s\S]*height:var\(--header\)!important/);
  assert.match(css,/\.app-ui \.editor-screen\{[\s\S]*height:calc\(100dvh - var\(--mobile-shell-header-height\)\)!important/);
  assert.doesNotMatch(css,/height:calc\(100dvh - 64px\)/);
});

test('v155 restores balanced final quote actions in RTL mobile layout',async()=>{
  const css=await read('src/styles/mobile-safe-area-v155.css');
  assert.match(css,/\[dir='rtl'\] \.final-quote-convert-bar/);
  assert.match(css,/left:max\(10px,env\(safe-area-inset-left\)\)!important/);
  assert.match(css,/right:max\(10px,env\(safe-area-inset-right\)\)!important/);
  assert.match(css,/max-width:none!important/);
  assert.doesNotMatch(css,/\.invoice-page|\.document-page/);
});
