import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v351 prunes historical stylesheet pushes before restoring active document owners',async()=>{
  const [pkg,prune,contract]=await Promise.all([
    read('package.json'),
    read('scripts/v351-sw-style-cache-prune.mjs'),
    read('scripts/v321-production-runtime-contract.mjs')
  ]);
  const scripts=JSON.parse(pkg).scripts.build;
  const pwaCache=scripts.indexOf('node scripts/pwa-cache-v205.mjs');
  const pruneStep=scripts.indexOf('node scripts/v351-sw-style-cache-prune.mjs');
  const v303=scripts.indexOf('node scripts/v303-visual-cache-refresh.mjs');
  assert.ok(pwaCache>=0&&pruneStep>pwaCache&&v303>pruneStep,'cache prune must run after legacy cache generation and before v303 restores active owners');
  assert.match(prune,/^const activeStylePush=/m);
  assert.match(prune,/historical standalone stylesheet precache pushes/);
  for(const asset of ['v333-critical-documents-visual-functional-closeout.css','v337-template-layout-balance.css','v331-draft-scroll-recovery.css','v332-critical-documents-deep-closeout.css'])assert.ok(contract.includes(asset));
  assert.match(contract,/historical stylesheet still precached outside app\.bundle\.css/);
});
