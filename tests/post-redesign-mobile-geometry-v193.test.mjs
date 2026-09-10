import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v193 mobile geometry layer loads after v192 and before printable document styling',async()=>{
  const index=await read('index.html');
  const previous='./styles/obsidian-production-audit-v192.css';
  const mobile='./styles/obsidian-mobile-geometry-v193.css';
  const print='./styles/document-premium-redesign-v141.css';
  assert.ok(index.includes(mobile));
  assert.ok(index.indexOf(previous)<index.indexOf(mobile));
  assert.ok(index.indexOf(mobile)<index.indexOf(print));
});

test('v193 keeps all six editor steps on narrow phones without touching printable pages',async()=>{
  const css=await read('src/styles/obsidian-mobile-geometry-v193.css');
  assert.match(css,/@media screen and \(max-width:420px\)/);
  assert.match(css,/\.app-ui \.editor-section-navigator\{[\s\S]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.editor-section-nav-button \.editor-nav-label\{display:none!important\}/);
  assert.match(css,/\.editor-section-nav-button\.active,[\s\S]*flex:none!important/);
  assert.doesNotMatch(css,/invoice-page|invoice-pages|template-renderer|document-page/);
});

test('v193 gives focused product and purchase editors exclusive phone navigation space',async()=>{
  const css=await read('src/styles/obsidian-mobile-geometry-v193.css');
  assert.match(css,/\.app-ui:has\(\.product-library-pro\.editor-open\) \.mobile-bottom-nav/);
  assert.match(css,/\.app-ui:has\(\.operations-page \.purchase-editor\) \.mobile-bottom-nav/);
  assert.match(css,/visibility:hidden!important/);
  assert.match(css,/pointer-events:none!important/);
  assert.match(css,/\.purchase-layout:has\(\.purchase-editor\) \.operations-list-panel\{display:none!important\}/);
});

test('v193 collapses purchase editing to one bounded column with reachable sticky actions',async()=>{
  const css=await read('src/styles/obsidian-mobile-geometry-v193.css');
  assert.match(css,/\.app-ui \.operations-split,[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/\.app-ui \.operations-page\{[\s\S]*overflow-x:clip!important/);
  assert.match(css,/\.app-ui \.operations-editor-actions\{[\s\S]*position:sticky!important[\s\S]*bottom:0!important/);
  assert.match(css,/@media screen and \(max-width:420px\)[\s\S]*\.operations-editor-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/\.operations-editor-actions \.btn-primary\{grid-column:1\/-1!important\}/);
});

test('v193 visual QA explicitly rejects hidden step six, editor nav overlap and purchase clipping',async()=>{
  const [editor,directory,financial]=await Promise.all([
    read('tests/visual/run-obsidian-editor.cjs'),
    read('tests/visual/run-obsidian-directory.cjs'),
    read('tests/visual/run-obsidian-financial.cjs')
  ]);
  assert.match(editor,/mobile editor must expose all six section steps/);
  assert.match(editor,/mobile editor section step clipped/);
  assert.match(directory,/mobile bottom nav covers focused product editor/);
  assert.match(directory,/product editor exceeds phone viewport/);
  assert.match(financial,/purchase editor clips outside phone viewport/);
  assert.match(financial,/purchase list should leave the phone viewport while editor is focused/);
  assert.match(financial,/action clipped or covered/);
});

test('v193 remains cached intact while later immutable PWA generations advance',async()=>{
  const sw=await read('public/sw.js');
  const current=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
  assert.ok(current&&Number(current[1])>=196,'current immutable PWA generation must not regress below v196');
  assert.match(sw,/lourex-invoice-v193: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v192: preserved as a legacy marker/);
  assert.ok(sw.includes("LOCAL_CORE.push('./styles/obsidian-mobile-geometry-v193.css')"));
});
