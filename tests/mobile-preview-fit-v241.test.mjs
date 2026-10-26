import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('iPhone preview scales independently while canonical commercial A4 remains 210 × 297 mm',async()=>{
 const [preview,canonical,renderer]=await Promise.all([read('src/styles/mobile-preview-v156.css'),read('src/styles/document-premium-redesign-v141.css'),read('src/templates/TemplateRenderer.tsx')]);
 for(const pair of [['390','.445'],['375','.43'],['360','.405'],['340','.38']])assert.ok(preview.includes('--preview-scale:'+pair[1]+'!important'),pair[0]+'px fitting still present');
 assert.ok(canonical.includes('width:210mm;height:297mm'),'commercial paper must remain full A4 size');
 assert.ok(renderer.includes('invoice-page'),'full document renderer stays mounted');
});

test('v241 makes preview-edge containment a required Browser Visual QA check',async()=>{
  const [workflow,runner]=await Promise.all([
    read('scripts/verify-local.mjs'),
    read('tests/visual/run-mobile-preview-fit-v241.cjs')
  ]);
  assert.match(workflow,/tests\/visual\/run-mobile-preview-fit-v241\.cjs/);
  assert.match(runner,/A4 preview clips the left edge/);
  assert.match(runner,/A4 preview clips the right edge/);
  assert.match(runner,/A4 preview is not width-fit/);
  assert.match(runner,/authoredWidth>790&&geometry\.authoredWidth<797/);
});

test('v241 refreshes installed PWA clients with the corrected preview geometry',async()=>{
  const [patch,distSw,sourceSw]=await Promise.all([
    read('scripts/pwa-cache-v205.mjs'),
    read('dist/sw.js'),
    read('public/sw.js')
  ]);
  assert.match(patch,/lourex-invoice-v241: narrow mobile A4 preview fit refresh/);
  const activeCache=[...distSw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)].at(-1);
  const sourceCache=[...sourceSw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)].at(-1);
  assert.ok(activeCache,'built service worker has an active cache generation');
  assert.ok(sourceCache,'source service worker has an active cache generation');
  assert.equal(activeCache[1],sourceCache[1],'build preserves the current service-worker generation');
  assert.ok(Number(activeCache[1])>241,'installed clients use a cache generation newer than the historical preview fix');
});
