import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('LOUREX has one non-versioned application-wide visual owner',async()=>{
  const [pkg,css,finalizer,runtime,doc]=await Promise.all([
    read('package.json'),
    read('src/styles/lourex-visual-foundation.css'),
    read('scripts/visual-foundation-finalize.mjs'),
    read('scripts/runtime-auth-transition-finalize.mjs'),
    read('docs/VISUAL_FOUNDATION.md')
  ]);

  for(const script of [
    'v480-bundle-executive-design.mjs','v481-bundle-premium-visual.mjs',
    'v482-bundle-mobile-ux-repair.mjs','v483-bundle-mobile-density.mjs',
    'v484-bundle-responsive-visual.mjs','v485-bundle-visible-ui.mjs'
  ])assert.doesNotMatch(pkg,new RegExp(script.replaceAll('.','\\.')),
    `versioned visual bundler must be retired: ${script}`);

  assert.match(pkg,/runtime-auth-transition-finalize\.mjs && node scripts\/visual-foundation-finalize\.mjs/);
  assert.match(css,/--app-canvas:/);
  assert.match(css,/--app-surface:/);
  assert.match(css,/--app-surface-raised:/);
  assert.match(css,/--app-card:/);
  assert.match(css,/--app-input:/);
  assert.match(css,/--app-border:/);
  assert.match(css,/--text-primary:/);
  assert.match(css,/--accent:/);
  assert.doesNotMatch(css,/--lx48\d-/,'versioned v48x token aliases must not own the canonical foundation');
  assert.doesNotMatch(css,/#000(?:000)?\b/i,'canonical dark hierarchy must not fall back to pure black');

  assert.match(finalizer,/hostinger-inspired-v353\.css/);
  assert.match(finalizer,/matte-black-dark-v360\.css/);
  assert.match(finalizer,/premium-ux-coherence-v362\.css/);
  assert.match(finalizer,/v485-visible-ui-corrections\.css/);
  assert.match(finalizer,/lourex-visual-foundation\.css\?v=foundation-1/);
  assert.match(finalizer,/expected exactly one canonical stylesheet link/);

  assert.doesNotMatch(runtime,/\.css\b/,'runtime auth hardening must not own CSS');
  assert.match(runtime,/automaticReload:false/);
  assert.match(doc,/only application-wide visual owner/i);
});

test('Documents hierarchy is centered, unclipped and wrapper-light',async()=>{
  const css=await read('src/styles/lourex-visual-foundation.css');
  assert.match(css,/\.ta-documents-header-actions\{[\s\S]*?margin-inline:auto!important;[\s\S]*?justify-self:center!important;/);
  assert.match(css,/\.ta-documents-header-actions>:last-child:nth-child\(odd\)[\s\S]*?justify-self:center;/);
  assert.match(css,/\.ta-doc-register-card\{[\s\S]*?background:transparent!important;[\s\S]*?border:0!important;[\s\S]*?box-shadow:none!important;/);
  assert.match(css,/\.ta-doc-type-tabs\{[\s\S]*?-webkit-mask-image:none!important;[\s\S]*?mask-image:none!important;/);
  assert.match(css,/@media screen and \(max-width:900px\)[\s\S]*?\.ta-doc-type-tabs\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;[\s\S]*?overflow:visible!important;/);
  assert.match(css,/\.ta-doc-commandbar\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(150px,220px\) auto!important;/);
});

test('More, navigation and tablet/desktop use the same semantic surface system',async()=>{
  const css=await read('src/styles/lourex-visual-foundation.css');
  assert.match(css,/\.ta-mobile-sheet\{[\s\S]*?background:var\(--app-surface\)!important;/);
  assert.match(css,/\.ta-mobile-sheet \.ta-sheet-group\{[\s\S]*?background:var\(--app-surface-raised\)!important;/);
  assert.match(css,/\.ta-mobile-sheet :is\(\.ta-sheet-link,\.ta-sheet-account\)\{[\s\S]*?background:transparent!important;/);
  assert.match(css,/@media screen and \(max-width:900px\)[\s\S]*?\.ta-mobile-nav\{[\s\S]*?env\(safe-area-inset-bottom,0px\)/);
  assert.match(css,/@media screen and \(max-width:719px\)/);
  assert.match(css,/@media screen and \(min-width:720px\) and \(max-width:1099px\)/);
  assert.match(css,/@media screen and \(min-width:901px\) and \(max-width:1099px\)/);
  assert.match(css,/@media screen and \(min-width:1100px\)/);
});

test('historical v480 source paths are compatibility stubs, not visual owners',async()=>{
  const [command,workspaces,editor,overlays]=await Promise.all([
    read('src/styles/executive-command-center-v480.css'),
    read('src/styles/executive-workspaces-v480.css'),
    read('src/styles/executive-editor-v480.css'),
    read('src/styles/executive-overlays-auth-v480.css')
  ]);
  for(const stub of [command,workspaces,editor]){
    assert.match(stub,/Compatibility stub/);
    assert.doesNotMatch(stub,/\{[^}]*:/,'retired v480 stubs must not contain CSS declarations');
  }
  assert.match(overlays,/Compatibility bridge/);
  assert.match(overlays,/@import url\("\.\/lourex-visual-foundation\.css"\);/);
  assert.equal((overlays.match(/@import/g)||[]).length,1);
});
