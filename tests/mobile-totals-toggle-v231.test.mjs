import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('v231 keeps totals switches visually compact inside a 44px touch target',async()=>{
  const css=await readFile('src/styles/obsidian-production-audit-v192.css','utf8');
  assert.match(css,/v231 — mobile accessibility may enlarge generic buttons to a 44px finger target/);
  assert.match(css,/\.app-ui \.adjustments-list \.toggle-row>\.toggle\{[\s\S]*?width:44px!important[\s\S]*?height:44px!important[\s\S]*?background:transparent!important/);
  assert.match(css,/\.app-ui \.adjustments-list \.toggle-row>\.toggle::before\{[\s\S]*?width:36px!important[\s\S]*?height:21px!important/);
  assert.match(css,/\.app-ui \.adjustments-list \.toggle-row>\.toggle>span\{[\s\S]*?width:17px!important[\s\S]*?height:17px!important/);
  assert.match(css,/\.app-ui \.adjustments-list \.toggle-row>\.toggle:focus-visible::before/);
});

test('v231 remains app-only and ships through the explicit PWA update path',async()=>{
  const [css,patch,distSw]=await Promise.all([
    readFile('src/styles/obsidian-production-audit-v192.css','utf8'),
    readFile('scripts/pwa-cache-v205.mjs','utf8'),
    readFile('dist/sw.js','utf8')
  ]);
  assert.match(css,/@media screen/);
  assert.doesNotMatch(css,/\.invoice-page|\.invoice-pages/);
  assert.match(patch,/lourex-invoice-v231: mobile totals switch geometry refresh/);
  assert.match(distSw,/lourex-invoice-v231: mobile totals switch geometry refresh/);
  assert.match(distSw,/lourex-invoice-v230: editor detail polish refresh/);
  assert.match(distSw,/const CACHE = 'lourex-invoice-v228'/);
});
