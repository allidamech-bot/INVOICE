import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v337 is loaded by the runtime-promoted document owner after v333',async()=>{
  const owner=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(owner,/^@import url\("\.\/v333-critical-documents-visual-functional-closeout\.css\?v=333-1"\);\n@import url\("\.\/v337-template-layout-balance\.css\?v=337-3"\);/);
});

test('v350 retires commercial closing geometry from v337 and keeps it in canonical v141',async()=>{
  const [canonical,css]=await Promise.all([
    read('src/styles/document-premium-redesign-v141.css'),
    read('src/styles/v337-template-layout-balance.css')
  ]);
  assert.match(canonical,/\.final-details\{[^}]*margin-top:auto[^}]*padding-top:6mm/);
  assert.match(canonical,/\.details-only \.final-details\{margin-top:0;padding-top:0\}/);
  assert.match(canonical,/\.bottom-grid\{[^}]*margin-top:4\.5mm[^}]*align-items:start/);
  assert.match(canonical,/\.signature-media\{[^}]*min-height:21mm[^}]*padding-top:1mm/);
  assert.doesNotMatch(css,/\.invoice-page(?:\:not\([^)]*\))? \.final-details\s*\{/);
  assert.doesNotMatch(css,/\.invoice-page \.bottom-grid\s*\{/);
  assert.doesNotMatch(css,/\.invoice-page \.signature-media\s*\{/);
  assert.doesNotMatch(css,/\.invoice-page \.doc-footer\s*\{/);
});

test('canonical v141 owns signature stamp and footer geometry',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css,/\.signature-media\{[^}]*min-height:21mm[^}]*padding-top:1mm/);
  assert.match(css,/\.signature-media \.signature-image\{height:20mm\}/);
  assert.match(css,/\.signature-media \.stamp-image\{height:22mm\}/);
  assert.match(css,/\.doc-footer\{[^}]*height:10mm[^}]*margin:0 11mm/);
  assert.doesNotMatch(css,/firebase|indexedDB|localStorage|calculateTotals|saveVault|persist\(|onSave|onPrint/i);
});

test('current DraftDocumentRenderer has an output-only A4 owner without reviving retired v308 UI',async()=>{
  const [renderer,css]=await Promise.all([
    read('src/components/DraftDocumentRenderer.tsx'),
    read('src/styles/v337-template-layout-balance.css')
  ]);
  for(const token of ['draft-letter-page','letterhead-header','letterhead-brand','letter-page-body','letter-meta','letter-blocks','letter-block','letter-bullet','letter-signing','letterhead-footer','document-custom-watermark']){
    assert.match(renderer,new RegExp(token.replaceAll('-','\\-')));
    assert.match(css,new RegExp(`\\.${token.replaceAll('-','\\-')}`));
  }
  for(const variant of ['header-minimal','header-classic','width-narrow','width-wide','page-ruled','page-grid','footer-minimal','footer-none'])assert.match(css,new RegExp(`\\.${variant}`));
  assert.match(css,/\.invoice-page \.document-custom-watermark\.is-repeat/);
  assert.match(css,/\.draft-letter-page\{[\s\S]*display:grid!important[\s\S]*grid-template-rows:auto minmax\(0,1fr\) auto!important/);
  assert.match(css,/@media print[\s\S]*\.draft-letter-page \.letterhead-header[\s\S]*break-inside:avoid!important/);
  const outputOnly=css.slice(css.indexOf('/* Current Company Draft A4 renderer.'));
  assert.ok(outputOnly.length>1000,'Draft A4 output contract is missing');
  assert.doesNotMatch(outputOnly,/\.app-ui|draft-studio|draft-mobile-actionbar/);
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

test('Draft mobile action bar geometry is owned by v337 instead of retired v308',async()=>{
  const recovery=await read('src/styles/v331-draft-scroll-recovery.css');
  const desktop=recovery.slice(recovery.indexOf('@media screen and (min-width:1181px)'),recovery.indexOf('/* Commercial document editors'));
  const draft=recovery.slice(recovery.indexOf('@media screen and (max-width:1180px)'),recovery.indexOf('@media screen and (max-width:720px)'));
  assert.match(desktop,/\.draft-mobile-actionbar\{[\s\S]*display:none!important/);
  assert.match(draft,/\.draft-mobile-actionbar\{[\s\S]*position:fixed!important[\s\S]*z-index:180!important[\s\S]*left:0!important[\s\S]*right:0!important[\s\S]*bottom:0!important/);
  assert.match(draft,/\.draft-mobile-actionbar\{[\s\S]*display:grid!important[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(draft,/\.draft-mobile-actionbar\{[\s\S]*env\(safe-area-inset-bottom,0px\)/);
  assert.match(draft,/\.draft-mobile-actionbar \.btn\{[\s\S]*min-width:0!important/);
});

test('Safari command sheets share one explicit vertical touch-scroll contract',async()=>{
  const recovery=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(recovery,/\.ta-mobile-sheet,\.ta-create-menu-mobile/);
  assert.match(recovery,/\.global-search-start,\.global-search-results/);
  assert.match(recovery,/\.mobile-document-action-portal,\.ta-doc-mobile-action-portal/);
  assert.match(recovery,/\.ta-doc-mobile-action-sheet,\.mobile-document-action-sheet/);
  const contract=recovery.slice(recovery.indexOf('/* v337 — the newer TailAdmin command sheets'),recovery.indexOf('@media screen and (max-width:720px)'));
  assert.match(contract,/overflow-y:auto!important/);
  assert.match(contract,/overscroll-behavior-y:contain!important/);
  assert.match(contract,/-webkit-overflow-scrolling:touch!important/);
  assert.match(contract,/touch-action:pan-y!important/);
  assert.doesNotMatch(contract,/overflow-y:hidden|touch-action:none/i);
});

test('later document-semantic owner cannot retake scroll or A4 closing geometry',async()=>{
  const semantics=await read('src/styles/v332-critical-documents-deep-closeout.css');
  assert.doesNotMatch(semantics,/\.ta-main/);
  assert.doesNotMatch(semantics,/draft-studio-scroll/);
  assert.doesNotMatch(semantics,/overflow-y\s*:\s*hidden/i);
  assert.doesNotMatch(semantics,/height\s*:\s*100dvh/i);
  assert.doesNotMatch(semantics,/\.final-details|\.bottom-grid|\.signature-media|\.doc-footer/);
  assert.doesNotMatch(semantics,/margin-top\s*:\s*auto|flex\s*:\s*1\s+1\s+auto/i);
});

test('production entry restores the standalone v337 Draft owner after CSS bundling and cache-busts the document runtime',async()=>{
  const [html,cacheRefresh,finalContract,build,pkg]=await Promise.all([
    read('index.html'),
    read('scripts/v303-visual-cache-refresh.mjs'),
    read('scripts/v321-production-runtime-contract.mjs'),
    read('scripts/build.mjs'),
    read('package.json')
  ]);
  assert.match(html,/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.doesNotMatch(html,/v331-draft-scroll-recovery\.css\?v=(?:331-1|336-1|337-2)/);
  assert.match(html,/document-entry-v302\.js\?v=337-3/);
  assert.match(build,/app\.bundle\.css/);
  assert.match(build,/html=html\.replace\(localStylePattern/);
  assert.match(cacheRefresh,/RELEASE_GENERATION=337/);
  assert.match(cacheRefresh,/const bundleTag='<link rel="stylesheet" href="\.\/styles\/app\.bundle\.css" \/>'/);
  assert.match(cacheRefresh,/runtimeTag=`<link rel="stylesheet" href="\$\{draftScrollRuntime\}" data-lourex-v331-draft-recovery="true" \/>`/);
  assert.match(cacheRefresh,/html=html\.replace\(bundleTag,`\$\{bundleTag\}\\n  \$\{runtimeTag\}`\)/);
  assert.match(cacheRefresh,/data-lourex-v331-draft-recovery=\"true\"/);
  for(const asset of [
    'v333-critical-documents-visual-functional-closeout.css\\?v=333-1',
    'v337-template-layout-balance.css\\?v=337-3',
    'v331-draft-scroll-recovery.css\\?v=337-3',
    'v332-critical-documents-deep-closeout.css\\?v=332-1',
    'document-entry-v302.js\\?v=337-3'
  ])assert.match(cacheRefresh,new RegExp(asset));
  assert.match(cacheRefresh,/const entryPath='dist\/document-entry-v302\.js'/);
  assert.match(cacheRefresh,/Stale pre-337-3 document scroll fallback survived production build/);
  assert.match(finalContract,/data-lourex-v331-draft-recovery=\"true\"/);
  assert.match(finalContract,/bundleIndex=html\.indexOf\('\.\/styles\/app\.bundle\.css'\)/);
  assert.match(finalContract,/readFile\('dist\/styles\/v331-draft-scroll-recovery\.css','utf8'\)/);
  assert.match(finalContract,/draftOwner\.startsWith/);
  assert.match(finalContract,/dist\/styles\/v337-template-layout-balance\.css/);
  assert.match(finalContract,/v337-template-layout-balance\.css\?v=337-3/);
  assert.match(finalContract,/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.match(finalContract,/document-entry-v302\.js\?v=337-3/);

  const buildCommand=JSON.parse(pkg).scripts.build;
  const bundleStep=buildCommand.indexOf('node scripts/build.mjs');
  const restoreStep=buildCommand.indexOf('node scripts/v303-visual-cache-refresh.mjs');
  const finalStep=buildCommand.indexOf('node scripts/v321-production-runtime-contract.mjs');
  assert.ok(bundleStep>=0&&restoreStep>bundleStep&&finalStep>restoreStep,'v337 standalone Draft owner must be restored after bundling and verified in the final build step');
});
