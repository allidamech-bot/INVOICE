import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('screen-time PDF source uses canonical A4 geometry before pagination',async()=>{
  const css=await read('src/styles/a4-mobile-print-v73.css');
  const screenAt=css.indexOf('@media screen {');
  const printAt=css.indexOf('\n@media print {');
  assert.ok(screenAt>=0,'screen-time print portal A4 contract missing');
  assert.ok(printAt>screenAt,'screen-time contract must exist before print-only rules');
  const screen=css.slice(screenAt,printAt);
  assert.match(screen,/#root \.print-portal \.invoice-pages/);
  assert.match(screen,/#root \.print-portal \.invoice-page/);
  assert.match(screen,/width:\s*210mm\s*!important/);
  assert.match(screen,/height:\s*297mm\s*!important/);
  assert.match(screen,/max-width:\s*none\s*!important/);
  assert.match(screen,/transform:\s*none\s*!important/);
});

test('iOS PDF bridge consumes only pagination-ready print portal pages',async()=>{
  const bridge=await read('public/ios-print-bridge.js');
  assert.match(bridge,/\.print-portal \[data-pagination-ready\]/);
  assert.match(bridge,/data-pagination-ready['"]\)===['"]true['"]/);
  assert.match(bridge,/querySelectorAll\(['"]\.print-portal \.invoice-page['"]\)/);
  assert.match(bridge,/const sourcePages = Array\.from/);
});

test('fixture renders the identical quotation snapshot into preview and PDF source with real logo watermark pressure',async()=>{
  const [fixture,html,runner]=await Promise.all([
    read('tests/visual/v542-pagination-parity.js'),
    read('tests/visual/v542-pagination-parity.html'),
    read('tests/visual/run-v542-pagination-parity.cjs')
  ]);
  assert.match(fixture,/mobile-preview-stage/);
  assert.match(fixture,/print-portal/);
  assert.match(fixture,/TemplateRenderer,\{document:documentData,scale:\.48/);
  assert.match(fixture,/TemplateRenderer,\{document:documentData,scale:1/);
  assert.match(fixture,/QUO-2026-0046/);
  assert.match(fixture,/Eti popkek 60 gr\*24/);
  assert.match(fixture,/logoDataUrl/);
  assert.match(fixture,/type:'logo'/);
  assert.match(fixture,/pattern:'repeat'/);
  assert.match(fixture,/Export cartons on pallets/);
  assert.match(html,/vendor\/html2canvas\.min\.js/);
  assert.match(html,/vendor\/jspdf\.umd\.min\.js/);
  assert.match(html,/ios-print-bridge\.js/);
  assert.match(runner,/__LOUREX_PREPARE_PDF__/);
  assert.match(runner,/pageObjects/);
  assert.match(runner,/downloaded PDF blob contains/);
});

test('v544 emergency owner runs after visual bundle owners and removes the pagination deadlock',async()=>{
  const [pkgRaw,owner]=await Promise.all([read('package.json'),read('scripts/v544-pdf-a4-output-emergency.mjs')]);
  const pkg=JSON.parse(pkgRaw);const build=String(pkg.scripts?.build||'');
  const visualOwner=build.indexOf('v485-bundle-visible-ui.mjs');
  const emergencyOwner=build.indexOf('v544-pdf-a4-output-emergency.mjs');
  const aiOwner=build.indexOf('ai-batch1-unified-assistant.mjs');
  assert.ok(visualOwner>=0&&emergencyOwner>visualOwner,'v544 must run after visual bundle owners');
  assert.ok(aiOwner<0||emergencyOwner<aiOwner,'v544 must finish document output before AI runtime patching');
  assert.match(owner,/oneRowDeadlock/);
  assert.match(owner,/items\.push\(moved\);continue/);
  assert.match(owner,/this\.moves=0/);
  assert.match(owner,/nth-child\(-n\+3\):last-child/);
  assert.match(owner,/LOUREX v544 PDF A4 emergency/);
});
