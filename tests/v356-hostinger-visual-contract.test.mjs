import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

const html=await read('index.html');
const coherence=await read('src/styles/hostinger-final-coherence-v356.css');
const interaction=await read('src/styles/hostinger-interaction-polish-v357.css');
const blue=await read('src/styles/hostinger-blue-luxury-v358.css');
const precision=await read('src/styles/hostinger-blue-precision-v359.css');
const palette=await read('src/styles/v346-template-color-visual-closeout.css');
const reliability=await read('src/styles/tailadmin-reliability-bridge-v320.css');

function stylesheetNames(source){
  return [...source.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"[^>]*\/>/g)].map(match=>match[1]);
}

test('Hostinger visual owners load once and v360 remains before reliability',()=>{
  const names=stylesheetNames(html);
  for(const name of [
    'hostinger-inspired-v353.css',
    'hostinger-premium-closeout-v354.css',
    'hostinger-system-contract-v355.css',
    'hostinger-final-coherence-v356.css',
    'hostinger-interaction-polish-v357.css',
    'hostinger-blue-luxury-v358.css',
    'hostinger-blue-precision-v359.css',
    'matte-black-dark-v360.css'
  ]){
    assert.equal(names.filter(value=>value===name).length,1,`${name} must load exactly once`);
  }
  assert.equal(names.at(-1),'tailadmin-reliability-bridge-v320.css','reliability bridge must remain the final linked stylesheet');
  assert.ok(names.indexOf('hostinger-final-coherence-v356.css')<names.indexOf('hostinger-interaction-polish-v357.css'));
  assert.ok(names.indexOf('hostinger-interaction-polish-v357.css')<names.indexOf('hostinger-blue-luxury-v358.css'));
  assert.ok(names.indexOf('hostinger-blue-luxury-v358.css')<names.indexOf('hostinger-blue-precision-v359.css'));
  assert.ok(names.indexOf('hostinger-blue-precision-v359.css')<names.indexOf('matte-black-dark-v360.css'));
  assert.ok(names.indexOf('hostinger-blue-precision-v359.css')<names.indexOf('tailadmin-reliability-bridge-v320.css'));
  assert.doesNotMatch(html,/hostinger-final-polish-v356\.css/,'deleted duplicate v356 layer must not return');
});

test('v356 keeps the loaded-app canvas, account grid and mobile settings contracts',()=>{
  assert.match(coherence,/--ft-canvas:var\(--ft-workspace\)!important/);
  assert.match(coherence,/\.ta-settings-shell\.is-account\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(coherence,/\.ta-settings-shell\.is-account>\.ta-settings-content\{[\s\S]*?grid-column:1!important/);
  assert.match(coherence,/@media screen and \(max-width:720px\)[\s\S]*?\.ta-settings-nav button\{[\s\S]*?min-width:120px!important[\s\S]*?min-height:54px!important/);
  assert.match(coherence,/\.modal\{[\s\S]*?border-width:1px!important[\s\S]*?outline:0!important/);
});

test('v357 keeps command menus neutral and inside the desktop sidebar',()=>{
  assert.match(interaction,/\.ta-create-menu\{[\s\S]*?border-radius:18px!important/);
  assert.match(interaction,/\.ta-sidebar-create \.ta-create-menu \.ta-create-menu-grid>button,[\s\S]*?background:color-mix\(in srgb,var\(--ft-surface\) 98%,transparent\)!important/);
  assert.match(interaction,/\.ta-sidebar-create \.ta-create-menu-desktop\{[\s\S]*?width:100%!important[\s\S]*?overflow-y:auto!important/);
  assert.match(interaction,/\.ta-sidebar-create \.ta-create-menu-desktop \.ta-create-menu-grid\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
  assert.doesNotMatch(interaction,/z-index\s*:/i,'interaction polish must not replace the reliability stacking contract');
});

test('canonical light/dark palette keeps layered surfaces and blue primary actions',()=>{
  assert.match(palette,/html\[data-ui-theme="light"\][\s\S]*?--ft-workspace:#F5F8F9!important[\s\S]*?--ft-surface:#FFFFFF!important[\s\S]*?--ft-surface-2:#EEF3F4!important[\s\S]*?--ft-accent:#315DA8!important/);
  assert.match(palette,/html\[data-ui-theme="dark"\][\s\S]*?--ft-workspace:#071113!important[\s\S]*?--ft-shell:#0D191C!important[\s\S]*?--ft-surface:#122126!important[\s\S]*?--ft-surface-3:#1C3035!important[\s\S]*?--ft-accent:#3A68B8!important/);
  assert.match(palette,/--ft-on-accent:#FFFFFF!important/,'primary actions must use white ink on canonical blue');
  assert.match(palette,/html\[data-ui-theme="dark"\] body \.ta-auth-page :where\(\.ta-auth-primary,\.btn-primary,button\.btn-primary\)\{[\s\S]*?background:var\(--ft-accent\)!important[\s\S]*?background-image:none!important[\s\S]*?color:var\(--ft-on-accent\)!important/,'dark auth primary must use the canonical blue action language');
  assert.match(blue,/--hx-purple:var\(--ft-accent\)/,'retired Hostinger violet aliases must resolve to the blue application token');
  assert.match(html,/--boot-visual-accent:#315DA8/);
  assert.match(html,/--boot-visual-accent:#82A9EC/);
});

test('v358 removes shell sync chrome without touching conflict recovery',()=>{
  assert.match(blue,/\.app-ui\s+:where\(\.ta-sidebar-sync,\.ta-topbar-sync,\.ta-sheet-sync\)\{display:none!important;\}/);
  assert.doesNotMatch(blue,/\.ta-conflict-banner\s*\{[^}]*display:none/i);
  assert.match(reliability,/--lourex-z-modal:1300/);
  assert.match(reliability,/--lourex-z-critical:1500/);
});

test('v358 mobile documents and overlays own reachable scroll geometry',()=>{
  assert.match(blue,/\.ta-documents-header-actions\{display:none!important;\}/);
  assert.match(blue,/\.ta-doc-type-tabs\{[\s\S]*?overflow-x:auto!important[\s\S]*?scroll-snap-type:x proximity!important/);
  assert.match(blue,/\.ta-doc-register-card\{order:2!important/);
  assert.match(blue,/\.ta-doc-summary-grid\{order:4!important/);
  assert.match(blue,/\.ta-mobile-sheet\{[\s\S]*?height:auto!important[\s\S]*?max-height:min\(85dvh,720px\)!important[\s\S]*?overflow-y:auto!important/);
  assert.match(blue,/\.ta-create-menu-mobile\{[\s\S]*?max-height:min\(72dvh,640px\)!important[\s\S]*?overflow-y:auto!important/);
});

test('v358 search and advisor reduce mobile visual competition',()=>{
  assert.match(blue,/\.lourex-advisor-starters>button:nth-child\(n\+3\)\{display:none!important;\}/);
  assert.match(blue,/\.global-search-input-wrap kbd\{display:none!important;\}/);
  assert.match(blue,/\.global-search-actions>button:nth-child\(n\+4\)\{display:none!important;\}/);
  assert.match(blue,/\.global-search-footer\{display:none!important;\}/);
});

test('v358 does not replace the canonical overlay ladder',()=>{
  assert.doesNotMatch(blue,/--lourex-z-/);
  assert.doesNotMatch(blue,/z-index\s*:/i);
  assert.match(reliability,/\.modal-backdrop\{z-index:var\(--lourex-z-modal\)!important\}/);
  assert.match(reliability,/\.app-ui\.ta-doc-mobile-action-portal\{z-index:var\(--lourex-z-critical\)!important\}/);
});

test('v359 neutralizes v358 decorative paint and keeps canonical blue identity',()=>{
  assert.match(precision,/--hx-purple:var\(--ft-accent\)/);
  assert.match(precision,/--hx2-violet:var\(--ft-accent\)/);
  assert.match(precision,/\.ta-sidebar-create>\.btn[\s\S]*?background:var\(--ft-accent\)!important[\s\S]*?background-image:none!important/);
  assert.match(precision,/\.lourex-ai-launcher\{[\s\S]*?background:var\(--ft-accent\)!important[\s\S]*?background-image:none!important/);
  assert.match(precision,/\.ta-auth-page \.ta-auth-aside\{[\s\S]*?background:var\(--ft-surface-2\)!important[\s\S]*?background-image:none!important/);
  assert.match(precision,/\.ta-auth-aside \.brand-words strong,[\s\S]*?color:var\(--ft-text-strong\)!important/,'auth wordmark must follow canonical surface contrast');
  assert.match(precision,/\.ta-auth-tabs button\.is-active\{[\s\S]*?background:var\(--ft-accent-soft\)!important[\s\S]*?color:var\(--ft-accent\)!important/);
  assert.match(precision,/\.ta-topbar\{[\s\S]*?backdrop-filter:none!important[\s\S]*?-webkit-backdrop-filter:none!important/,'topbar glass treatment must be retired');
  assert.doesNotMatch(precision,/radial-gradient|linear-gradient/,'v359 must not keep a competing decorative gradient theme');
});

test('v359 shell specificity removes routine cloud status but never conflict recovery',()=>{
  assert.match(precision,/html body \.app-ui \.ta-sidebar-sync,[\s\S]*?html body \.app-ui \.ta-topbar-sync,[\s\S]*?html body \.app-ui \.ta-sheet-sync\{display:none!important/);
  assert.doesNotMatch(precision,/\.ta-conflict-banner\s*\{[^}]*display:none/i);
});

test('v359 mobile global search sizes to content instead of reserving an empty lower half',()=>{
  assert.match(precision,/@media screen and \(max-width:900px\)[\s\S]*?\.global-search-panel\{[\s\S]*?bottom:auto!important[\s\S]*?height:max-content!important[\s\S]*?min-height:0!important[\s\S]*?max-height:min\(82dvh,680px\)!important/);
  assert.match(precision,/:is\(\.global-search-start,\.global-search-results\)\{[\s\S]*?flex:0 1 auto!important[\s\S]*?min-height:0!important[\s\S]*?overflow-y:auto!important/);
  assert.match(precision,/\.global-search-empty\{min-height:180px!important;\}/);
});

test('v359 leaves the canonical reliability ladder untouched',()=>{
  assert.doesNotMatch(precision,/--lourex-z-/);
  assert.doesNotMatch(precision,/z-index\s*:/i);
  assert.match(reliability,/\.global-search-panel\{z-index:calc\(var\(--lourex-z-search\) \+ 1\)!important\}/);
  assert.match(reliability,/\.app-ui\.ta-doc-mobile-action-portal\{z-index:var\(--lourex-z-critical\)!important\}/);
});
