import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const owners=[
  'mobile-ux-functional-hardening-v363.css',
  'modal-viewport-reconciliation-v363.css',
  'mobile-ux-deep-audit-v363.css'
];

test('built app.bundle ships all v363 owners as real CSS before the final reliability bridge', async()=>{
  const bundle=await read('dist/styles/app.bundle.css');
  const bridgeMarker='/* --- tailadmin-reliability-bridge-v320.css --- */';
  const bridgeIndex=bundle.indexOf(bridgeMarker);
  assert.ok(bridgeIndex>=0,'built bundle is missing the final TailAdmin reliability bridge marker');
  for(const name of owners){
    const marker=`/* --- ${name} --- */`;
    const ownerIndex=bundle.indexOf(marker);
    assert.ok(ownerIndex>=0,`built bundle is missing ${name}`);
    assert.ok(ownerIndex<bridgeIndex,`${name} must be inlined before the final reliability bridge`);
    assert.doesNotMatch(bundle,new RegExp(`@import url\\(\\"\\./${name.replaceAll('.','\\.')}[^\\"]*\\"\\)`),`built bundle must not ship a late @import for ${name}`);
  }
  assert.match(bundle,/\.ta-product-editor\.is-open\{/,'built bundle lost v363 product editor geometry');
  assert.match(bundle,/\.ta-ops-split>\.ta-ops-editor\{/,'built bundle lost v363 operations editor geometry');
  assert.match(bundle,/background:var\(--ft-accent,#315da8\)!important/,'built bundle lost the final primary-action accent owner');
});
