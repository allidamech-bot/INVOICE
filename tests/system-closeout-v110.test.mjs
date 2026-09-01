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
  assert.match(ui,/this\.previousFocus\?\.focus\(\{preventScroll:true\}\)/);
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

test('v110 is loaded offline before the final performance layer',()=>{
  const html=read('index.html');
  const sw=read('public/sw.js');
  const closeout='./styles/system-closeout-v110.css';
  const performance='./styles/performance-polish-v100.css';
  assert.ok(html.includes(closeout));
  assert.ok(sw.includes(closeout));
  assert.ok(html.indexOf(closeout)<html.indexOf(performance));
  assert.ok(sw.indexOf(closeout)<sw.indexOf(performance));
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
  assert.match(sw,/v103 saved-item compatibility/);
});
