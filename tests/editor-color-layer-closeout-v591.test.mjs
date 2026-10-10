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
  const [css,bundle]=await Promise.all([
    read('src/styles/v485-visible-ui-corrections.css'),
    read('scripts/v485-bundle-visible-ui.mjs')
  ]);
  for(const source of [css,bundle]){
    assert.match(source,/\.invoice-page\.template-executive \.items-table thead th\{[\s\S]*background:#102d41!important;[\s\S]*color:#fff!important;[\s\S]*-webkit-text-fill-color:#fff!important/);
  }
});


test('v591 Trade table header keeps readable inverse text',async()=>{
  const [css,bundle]=await Promise.all([
    read('src/styles/v485-visible-ui-corrections.css'),
    read('scripts/v485-bundle-visible-ui.mjs')
  ]);
  for(const source of [css,bundle]){
    assert.match(source,/\.invoice-page\.template-trade \.items-table thead th\{[\s\S]*background:#16384d!important;[\s\S]*color:#fff!important/);
  }
});


test('v591 remaining template heading and totals surfaces keep explicit readable ink',async()=>{
  const [css,bundle]=await Promise.all([
    read('src/styles/v485-visible-ui-corrections.css'),
    read('scripts/v485-bundle-visible-ui.mjs')
  ]);
  for(const source of [css,bundle]){
    assert.match(source,/\.template-signature \.items-table thead th\{[\s\S]*background:#f4efe6!important[\s\S]*color:#28343c!important/);
    for(const [template,bg] of [['cobalt','#173f5e'],['split','#102a3c'],['slate','#304852'],['aurora','#24574f'],['ledger','#263b49']]){
      assert.ok(source.includes(`.invoice-page.template-${template} .items-table thead th{`),template);
      assert.ok(source.includes(`background:${bg}!important`),`${template} background`);
    }
    assert.match(source,/\.invoice-page\.template-horizon \.items-table thead th\{[\s\S]*background:#174d61!important[\s\S]*color:#fff!important[\s\S]*-webkit-text-fill-color:#fff!important/);
    assert.match(source,/\.invoice-page\.template-noir \.totals-block \.total-row :is\(span,strong\)\{[\s\S]*color:#f4efe6!important/);
    assert.match(source,/\.invoice-page\.template-blackivory \.totals-block \.total-row :is\(span,strong\)\{[\s\S]*color:#f5efe2!important/);
  }
});
