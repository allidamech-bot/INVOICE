import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');

test('v110 keeps all three primary mobile workspaces visible and touch safe',()=>{
  const css=read('src/styles/system-closeout-v110.css');
  assert.match(css,/\.app-ui \.main-nav\s*\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.app-ui \.main-nav button\s*\{[\s\S]*min-height:44px!important/);
  assert.match(css,/\.app-ui \.header-actions \.btn,[\s\S]*min-height:44px!important/);
});

test('v110 modal frame traps keyboard focus and restores the opener',()=>{
  const ui=read('src/components/UI.tsx');
  assert.match(ui,/private dialog:HTMLElement\|null=null/);
  assert.match(ui,/private isTopModal=/);
  assert.match(ui,/event\.key!=='Tab'/);
  assert.match(ui,/event\.shiftKey\?last:first/);
  assert.match(read('src/lib/overlay-focus.ts'),/previous\?\.isConnected/);
  assert.match(ui,/restoreOverlayFocus\(this\.previousFocus\)/);
  assert.match(ui,/aria-labelledby=\{this\.titleId\}/);
  assert.match(ui,/tabIndex=\{-1\}/);
  assert.match(ui,/<h2 id=\{this\.titleId\}>/);
});

test('v110 keeps phone modal decisions reachable without touching invoice templates',()=>{
  const css=read('src/styles/system-closeout-v110.css');
  assert.match(css,/\.app-ui \.modal-footer\s*\{[\s\S]*position:sticky/);
  assert.match(css,/\.app-ui \.modal-footer-actions\s*\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css,/\.invoice-page|\.items-table|\.invoice-sheet/);
  assert.match(css,/@media print/);
});

test('current modal safety and mobile shell are shipped through the PWA bundle',()=>{
 const html=read('index.html'),sw=read('dist/sw.js'),css=read('src/styles/tailadmin-overlays-v320.css');
 assert.ok(html.includes('tailadmin-overlays-v320.css'));
 assert.ok(html.includes('tailadmin-shell-v320.css'));
 assert.ok(css.includes('.modal-backdrop')&&css.includes('safe-area-inset-bottom'));
 assert.ok(sw.includes('styles/app.bundle.css'));
 assert.equal(html.includes('system-closeout-v110.css'),false,'retired modal CSS no longer overrides the current implementation');
});

