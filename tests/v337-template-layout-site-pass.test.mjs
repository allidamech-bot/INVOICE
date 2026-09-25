import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v337 is loaded by the runtime-promoted document owner after v333',async()=>{
  const owner=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(owner,/^@import url\("\.\/v333-critical-documents-visual-functional-closeout\.css\?v=333-1"\);\n@import url\("\.\/v337-template-layout-balance\.css\?v=337-3"\);/);
});

test('v337 keeps the complete commercial closing zone contiguous in normal flow instead of splitting or bottom-anchoring it',async()=>{
  const css=await read('src/styles/v337-template-layout-balance.css');
  assert.match(css,/\.invoice-page \.final-details\{[\s\S]*display:block!important[\s\S]*flex:0 0 auto!important[\s\S]*margin-top:6mm!important[\s\S]*padding-top:0!important/);
  assert.match(css,/\.invoice-page\.details-only \.final-details\{[\s\S]*margin-top:0!important[\s\S]*padding-top:0!important/);
  assert.match(css,/\.invoice-page \.bottom-grid\{[\s\S]*margin-top:4\.5mm!important[\s\S]*padding-top:0!important[\s\S]*align-items:start!important/);
  assert.doesNotMatch(css,/\.invoice-page \.bottom-grid\{[\s\S]{0,180}margin-top:auto!important/);
  assert.doesNotMatch(css,/\.invoice-page \.final-details\{[\s\S]{0,220}margin-top:auto!important/);
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

test('production entry restores the standalone v337 owner after CSS bundling and cache-busts the document runtime',async()=>{
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
  assert.ok(bundleStep>=0&&restoreStep>bundleStep&&finalStep>restoreStep,'v337 standalone owner must be restored after bundling and verified in the final build step');
});
