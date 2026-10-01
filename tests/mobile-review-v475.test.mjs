import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [css,bridge]=await Promise.all([
  read('src/styles/mobile-review-v475.css'),
  read('src/styles/tailadmin-reliability-bridge-v320.css')
]);

test('v475.7 final review layer is loaded after the core mobile system',()=>{
  assert.match(bridge,/@import url\("\.\/mobile-review-v475\.css\?v=475-7"\);/);
  assert.ok(bridge.indexOf('mobile-auth-v475.css?v=475-6')<bridge.indexOf('mobile-review-v475.css?v=475-7'));
  assert.ok(bridge.indexOf('mobile-review-v475.css?v=475-7')<bridge.indexOf('/* LOUREX v351'));
});

test('v475.7 gives final review a real mobile decision hierarchy',()=>{
  assert.match(css,/\.modal:has\(\.issue-review\)/);
  assert.match(css,/\.issue-review-status/);
  assert.match(css,/\.issue-review-purpose/);
  assert.match(css,/\.issue-review-grid/);
  assert.match(css,/\.issue-asset-checks/);
  assert.match(css,/\.accounting-guardian-review/);
  assert.match(css,/\.issue-warning/);
  assert.match(css,/\.modal-footer-actions/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
  assert.match(css,/"Noto Sans Arabic",Inter/);
});

test('v475.7 final review remains presentation-only',()=>{
  for(const token of ['localStorage','indexedDB','firebase','firestore','calculateTotals(','setState(','onConfirm(','mutateVault','saveVault','vault.']){
    const pattern=new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    assert.doesNotMatch(css,pattern);
  }
});
