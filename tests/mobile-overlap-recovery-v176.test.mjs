import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v176 remains the final modal recovery layer before later app-only layers and v141 remains final document stylesheet',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const recovery='mobile-overlap-recovery-v176.css';
  const later='mobile-controls-density-v177.css';
  const documentLayer='document-premium-redesign-v141.css';
  assert.match(html,new RegExp(recovery.replaceAll('.','\\.')));
  const recoveryIndex=html.indexOf(recovery);
  for(const older of ['settings-account-v163.css','design-system-v164.css','final-mobile-accessibility-v168.css']){
    assert.ok(html.indexOf(older)>=0,`${older} should remain loaded`);
    assert.ok(recoveryIndex>html.indexOf(older),`v176 must load after ${older}`);
  }
  assert.ok(html.indexOf(later)>recoveryIndex,'later app-only recovery layer should follow v176');
  assert.ok(html.indexOf(documentLayer)>html.indexOf(later),'v141 must remain after all application recovery layers');
  const styleNames=[...html.matchAll(/<link rel="stylesheet" href="\.\/styles\/([^\"]+\.css)" \/>/g)].map(match=>match[1]);
  assert.equal(styleNames.at(-1),documentLayer);
  assert.match(sw,/lourex-invoice-v176: preserved as a legacy marker/);
  assert.ok(sw.includes(`./styles/${recovery}`),'v176 recovery stylesheet must remain in the installed PWA cache');
});

test('v176 keeps destructive confirmation footer inside the dynamic mobile viewport',async()=>{
  const css=await read('src/styles/mobile-overlap-recovery-v176.css');
  assert.match(css,/\.app-ui \.modal-backdrop\{[\s\S]*z-index:7000!important/);
  assert.match(css,/@media \(max-width:720px\), \(max-height:520px\)\{/);
  assert.match(css,/\.app-ui \.modal-backdrop\{[\s\S]*height:100dvh!important[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.match(css,/\.app-ui \.modal\{[\s\S]*height:auto!important[\s\S]*max-height:calc\(100dvh/);
  assert.match(css,/\.app-ui \.modal-sm\{[\s\S]*height:auto!important/);
  assert.match(css,/\.app-ui \.modal-body\{[\s\S]*min-height:0!important[\s\S]*overflow-y:auto!important/);
  assert.match(css,/\.app-ui \.modal-footer\{[\s\S]*position:relative!important[\s\S]*flex:0 0 auto!important[\s\S]*visibility:visible!important/);
  assert.match(css,/\.app-ui \.modal-footer-actions[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important[\s\S]*align-items:stretch!important/);
  assert.match(css,/\.app-ui \.modal-footer-actions \.btn\{[\s\S]*min-height:44px!important[\s\S]*max-height:none!important[\s\S]*white-space:normal!important/);
  assert.match(css,/@media \(max-height:460px\)\{[\s\S]*\.app-ui \.modal-footer-actions \.btn\{[\s\S]*min-height:44px!important/);
});

test('v176 restores 44px touch targets to compact Settings and Product Library controls on coarse-pointer devices',async()=>{
  const css=await read('src/styles/mobile-overlap-recovery-v176.css');
  assert.match(css,/@media \(max-width:960px\) and \(pointer:coarse\)/);
  for(const selector of [
    '.shell-mobile-brand>button',
    '.shell-sync-status',
    '.settings-title>.btn',
    '.settings-tabs>button',
    '.settings-account-actions .btn',
    '.settings-section-heading .btn',
    '.product-library-commandbar .btn',
    '.product-library-star',
    '.product-library-row>.icon-btn',
    '.product-library-editor-actions .btn',
    '.cloud-account-actions .btn'
  ]) assert.ok(css.includes(selector),`missing touch-target override for ${selector}`);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/min-width:44px!important/);
});

test('v176 prevents mobile sheet and page overflow regressions without touching printable templates',async()=>{
  const css=await read('src/styles/mobile-overlap-recovery-v176.css');
  assert.match(css,/\.mobile-document-action-portal \.mobile-document-action-sheet[\s\S]*max-height:calc\(100dvh/);
  assert.match(css,/\.app-ui \.mobile-more-sheet[\s\S]*max-height:calc\(100dvh/);
  assert.match(css,/\.app-ui \.workspace-content\{[\s\S]*overflow-x:clip/);
  assert.match(css,/@media \(max-width:350px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/@media print\{[\s\S]*\.app-ui \.modal-backdrop[\s\S]*display:none!important/);
  assert.doesNotMatch(css,/\.template-(executive|minimal|trade|signature|obsidian|cobalt|editorial|split|prism|slate|horizon|mono|aurora|ledger|noir|midnight|blackivory|carbon)/);
});
