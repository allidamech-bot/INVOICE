import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

const retiredVisualPatterns=[
  /hostinger-(?:inspired|premium-closeout|system-contract|final-coherence|interaction-polish|blue-luxury|blue-precision)-v35[3-9]\.css/,
  /matte-black-dark-v360\.css/,
  /mobile-site-density-v361\.css/,
  /premium-ux-coherence-v362\.css/,
  /executive-(?:command-center|workspaces|editor|overlays-auth|coherence)-v480\.css/,
  /premium-(?:visual-system|workspaces|overlays|business|regression-fixes)-v481\.css/,
  /v482-(?:mobile-ux-repair|narrow-readability)\.css/,
  /v483-mobile-density\.css/,
  /v484-responsive-visual-hierarchy\.css/,
  /v485-visible-ui-corrections\.css/
];

const retiredBundlers=[
  'v480-bundle-executive-design.mjs',
  'v481-bundle-premium-visual.mjs',
  'v482-bundle-mobile-ux-repair.mjs',
  'v483-bundle-mobile-density.mjs',
  'v484-bundle-responsive-visual.mjs',
  'v485-bundle-visible-ui.mjs'
];

test('one stable visual foundation owns the active product cascade',async()=>{
  const [index,pkg,foundation,bridge,build,finalize]=await Promise.all([
    read('index.html'),
    read('package.json'),
    read('src/styles/lourex-visual-foundation.css'),
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('scripts/build.mjs'),
    read('scripts/visual-foundation-finalize.mjs')
  ]);

  assert.match(index,/styles\/lourex-visual-foundation\.css\?v=foundation-1/,'source HTML must load the stable visual owner');
  assert.match(pkg,/runtime-auth-transition-finalize\.mjs && node scripts\/visual-foundation-finalize\.mjs/,'build must end with runtime separation and the stable visual finalizer');
  assert.match(build,/const foundationOwner='lourex-visual-foundation\.css'/,'source build must declare the canonical visual owner');
  assert.match(build,/sourceStyleNames\.at\(-1\)!==foundationOwner/,'source build must enforce the canonical visual owner position');
  assert.match(build,/const reliabilityIndex=sourceStyleNames\.indexOf\(reliabilityOwner\);[\s\S]*reliabilityIndex>=foundationIndex/,'source build must enforce reliability before the final visual owner');
  assert.match(build,/standaloneRuntimeStyles=new Set\([\s\S]*foundationOwner[\s\S]*\)/,'canonical visual owner must remain standalone, not duplicated in the bundle');
  assert.match(finalize,/src\/styles\/lourex-visual-foundation\.css/,'production finalizer must read the stable source owner');
  assert.match(finalize,/dist\/styles\/lourex-visual-foundation\.css/,'production finalizer must emit one stable production owner');

  for(const bundler of retiredBundlers)assert.doesNotMatch(pkg,new RegExp(bundler.replaceAll('.','\\.')),
    `retired numbered visual bundler returned to the build: ${bundler}`);
  for(const pattern of retiredVisualPatterns){
    assert.doesNotMatch(index,pattern,`retired visual stylesheet returned to source HTML: ${pattern}`);
    assert.doesNotMatch(bridge,pattern,`retired visual stylesheet returned through the reliability bridge: ${pattern}`);
  }

  assert.doesNotMatch(bridge,/executive-.*v480/,'runtime reliability bridge must not own executive presentation');
  assert.match(bridge,/mobile-ux-functional-hardening-v363\.css/,'functional mobile hardening must remain available');
  assert.ok(foundation.includes('--app-canvas'),'foundation must expose semantic application tokens');
});

test('semantic tokens and one intentional responsive strategy define the visual system',async()=>{
  const css=await read('src/styles/lourex-visual-foundation.css');
  for(const token of [
    '--app-canvas','--app-surface','--app-surface-raised','--app-card','--app-card-hover','--app-input',
    '--app-border','--app-border-strong','--text-primary','--text-secondary','--text-muted',
    '--accent','--accent-hover','--accent-soft','--danger','--success','--warning',
    '--space-1:4px','--space-2:8px','--space-3:12px','--space-4:16px','--space-5:20px','--space-6:24px','--space-8:32px',
    '--radius-control:10px','--radius-card:16px','--radius-large:22px'
  ])assert.ok(css.includes(token),`visual foundation missing semantic token ${token}`);

  assert.match(css,/@media screen and \(max-width:719px\)/,'phone range must be explicit');
  assert.match(css,/@media screen and \(min-width:720px\) and \(max-width:1199px\)/,'tablet/iPad range must be explicit');
  assert.match(css,/@media screen and \(min-width:1200px\)/,'desktop range must be explicit');
  assert.match(css,/@media screen and \(min-width:720px\) and \(max-width:1199px\)[\s\S]*?\.ta-sidebar\{display:none!important;/,'tablet must not squeeze a desktop sidebar');
  assert.match(css,/@media screen and \(min-width:720px\) and \(max-width:1199px\)[\s\S]*?\.ta-mobile-nav\{[\s\S]*?display:grid!important;/,'tablet must receive the intentional five-action navigation');
  assert.doesNotMatch(css,/--lx48\d-/,'numbered v48x palette aliases must not be part of the final owner');
});

test('Documents and More encode the requested hierarchy rather than box stacking',async()=>{
  const css=await read('src/styles/lourex-visual-foundation.css');

  assert.match(css,/\.ta-documents-header\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important;[\s\S]*?gap:var\(--space-5\)!important;/,'Documents hero must use a single geometric column so actions can center against the whole hero');
  assert.match(css,/\.ta-documents-header-actions\{[\s\S]*?margin-inline:auto!important;[\s\S]*?justify-self:center!important;/,'Documents action group must be geometrically centered');
  assert.match(css,/\.ta-doc-register-card\{[\s\S]*?background:transparent!important;[\s\S]*?border:0!important;[\s\S]*?box-shadow:none!important;/,'document register wrapper must be visually quiet');
  assert.match(css,/\.ta-doc-type-tabs\{[\s\S]*?overflow:visible!important;[\s\S]*?-webkit-mask-image:none!important;/,'document filters must not hide half-visible controls');
  assert.match(css,/@media screen and \(max-width:719px\)[\s\S]*?\.ta-doc-type-tabs\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;/,'phone filter layout must be a non-scrolling grid');
  assert.match(css,/\.ta-mobile-sheet \.ta-sheet-group\{[\s\S]*?background:transparent!important;[\s\S]*?border-top:1px solid var\(--app-border\)!important;/,'More groups must be quiet structural grouping');
  assert.match(css,/\.ta-mobile-sheet \.ta-sheet-link\{[\s\S]*?background:transparent!important;[\s\S]*?border-radius:0!important;/,'More rows must not become nested dark tiles');
});

test('the v482 runtime behavior was separated from presentation safely',async()=>{
  const runtime=await read('scripts/runtime-auth-transition-finalize.mjs');
  assert.match(runtime,/lourex-account-transition-request/,'safe in-app account transition must remain');
  assert.match(runtime,/automaticReload:false/,'automatic reload must remain disabled');
  assert.doesNotMatch(runtime,/readFile\(`src\/styles\/v482/,'runtime finalizer must not own visual CSS');
});
