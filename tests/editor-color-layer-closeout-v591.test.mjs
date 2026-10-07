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

test('v591 template selector controls use app surfaces and accent states, not black badges',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/\.screen-editor \.template-card\{[\s\S]*background:var\(--ft-surface\)!important/);
  assert.match(css,/\.screen-editor \.template-card\.selected\{[\s\S]*border-color:var\(--lrx-editor-accent\)!important/);
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
