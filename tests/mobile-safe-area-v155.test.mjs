import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current mobile safe areas and iPhone editor controls are bundled for installed clients',async()=>{
 const [html,sw,shell,core]=await Promise.all([read('index.html'),read('dist/sw.js'),read('src/styles/tailadmin-shell-v320.css'),read('src/styles/tailadmin-editor-core-v320.css')]);
 assert.equal(html.includes('mobile-safe-area-v155.css'),false,'retired safe-area styles cannot override current shell');
 assert.ok(html.includes('tailadmin-shell-v320.css')&&html.includes('tailadmin-editor-core-v320.css'));
 assert.ok(shell.includes('safe-area-inset-bottom'));
 assert.ok(core.includes('safe-area-inset-bottom'));
 assert.ok(sw.includes('styles/app.bundle.css'),'offline PWA caches the canonical controls');
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