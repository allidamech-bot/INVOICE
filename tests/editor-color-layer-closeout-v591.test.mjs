import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v591 native editor controls cannot retain black or foreign button surfaces',async()=>{
  const [css,bundle]=await Promise.all([
    read('src/styles/v485-visible-ui-corrections.css'),
    read('scripts/v485-bundle-visible-ui.mjs')
  ]);
  for(const source of [css,bundle]){
    assert.match(source,/\.customer-dropdown button,\.recent-customer-row button/);
    assert.match(source,/\.item-suggestion-box button,\.pricing-suggestion-chip/);
    assert.match(source,/\.product-metadata-suggestions button,\.commercial-preset-chips button/);
    assert.match(source,/\.watermark-preset-row button,\.attachment-open-button/);
    assert.match(source,/background:var\(--ft-surface\)!important/);
    assert.match(source,/border:1px solid var\(--ft-line\)!important/);
  }
});

test('v591 final editor controls stay readable and cannot fall back to browser-native buttons',async()=>{
  const [css,bundle]=await Promise.all([
    read('src/styles/v485-visible-ui-corrections.css'),
    read('scripts/v485-bundle-visible-ui.mjs')
  ]);
  for(const source of [css,bundle]){
    assert.match(source,/--lrx-editor-accent:var\(--lx-ui-action,#315fad\)/);
    assert.match(source,/:is\(\.screen-editor,\.editor-screen\) \.btn\.btn-ghost\{[\s\S]*background:var\(--lx485-surface-3,#1d3651\)!important/);
    assert.match(source,/:is\(\.screen-editor,\.editor-screen\) \.icon-btn\{[\s\S]*background:transparent!important/);
    assert.match(source,/:is\(\.screen-editor,\.editor-screen\) \.advanced-master-toggle\{[\s\S]*appearance:none!important/);
    assert.match(source,/\.item-advanced-control>button[\s\S]*appearance:none!important[\s\S]*--lx485-line-strong/);
  }
});

test('v591 template selector controls use app surfaces and accent states, not black badges',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/:is\(\.screen-editor,\.editor-screen\) \.template-card\{[\s\S]*background:var\(--ft-surface\)!important/);
  assert.match(css,/:is\(\.screen-editor,\.editor-screen\) \.template-card\.selected\{[\s\S]*border-color:var\(--lrx-editor-accent\)!important/);
  assert.match(css,/\.template-favorite-button\.active\{[\s\S]*background:var\(--ft-accent-faint\)!important/);
  assert.match(css,/\.template-default-badge\{[\s\S]*background:var\(--ft-accent-faint\)!important/);
});

test('v591 Design section is one surface with separators instead of nested cards',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/\.template-preference-bar\{[\s\S]*background:transparent!important[\s\S]*border-radius:0!important/);
  assert.match(css,/:is\(\.appearance-toggles,\.appearance-table-columns\)\{[\s\S]*background:transparent!important[\s\S]*border:0!important/);
  assert.match(css,/:is\(\.appearance-toggles,\.appearance-table-columns\) \.toggle-row\{[\s\S]*background:transparent!important[\s\S]*border-radius:0!important/);
});

test('v591 final build owner contains the same native-control and layer contract',async()=>{
  const bundle=await read('scripts/v485-bundle-visible-ui.mjs');
  const flatten=bundle.indexOf('editorFlatteningGuard.trim()');
  const final=bundle.indexOf('documentStudioFinalGuard.trim()');
  assert.ok(flatten>=0&&final>flatten);
  assert.match(bundle,/\.template-default-badge/);
  assert.match(bundle,/\.appearance-table-columns\) \.toggle-row/);
  assert.match(bundle,/\.attachment-open-button/);
});


test('v591 Executive table header cannot inherit low-contrast accent foreground',async()=>{
const css=await read('src/styles/document-premium-redesign-v141.css');
 assert.match(css,/\.invoice-page\.template-executive\{--table-head:#202445/);
 assert.match(css,/\.items-table th\{[^}]*background:var\(--table-head\);color:var\(--table-ink\)/);
 assert.match(css,/--table-ink:#fff/);
 assert.doesNotMatch(css,/\.template-executive \.items-table th\{[^}]*color:var\(--accent\)/);
});


test('v591 Trade table header keeps readable inverse text',async()=>{
const css=await read('src/styles/document-premium-redesign-v141.css');
 assert.match(css,/\.invoice-page\.template-trade\{--table-head:#1374ae/);
 assert.match(css,/\.items-table th\{[^}]*background:var\(--table-head\);color:var\(--table-ink\)/);
 assert.match(css,/--table-ink:#fff/);
});


test('v591 remaining template heading and totals surfaces keep explicit readable ink',async()=>{
const css=await read('src/styles/document-premium-redesign-v141.css');
 for(const name of ['signature','cobalt','split','slate','aurora','ledger','horizon','noir','blackivory'])assert.ok(css.includes('.invoice-page.template-'+name),name);
 assert.match(css,/\.invoice-page\.template-signature\{[^}]*--table-head:#39543d/);
 assert.match(css,/\.invoice-page\.template-horizon \.items-table th\{background:transparent;color:#15374b/);
 assert.match(css,/\.invoice-page\.template-blackivory\{[^}]*--table-ink:#201c18/);
 assert.match(css,/\.grand-total\{[^}]*background:var\(--accent\);color:var\(--accent-ink\)/);
});
