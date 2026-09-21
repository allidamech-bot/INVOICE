import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v242 overrides the legacy light Operations phone tab strip with semantic workspace surfaces',async()=>{
  const [legacy,late]=await Promise.all([
    read('src/styles/ux-recovery-v152.css'),
    read('src/styles/customer-language-purity-v233.css')
  ]);
  assert.match(legacy,/\.operations-tabs\{[^}]*background:#dfe7e9!important/s);
  assert.match(late,/v242 — mobile Operations tabs/);
  assert.match(late,/\.app-ui \.operations-tabs\{[^}]*background:var\(--ds-workspace\)!important/s);
  assert.match(late,/\.app-ui \.operations-tabs button\.active\{[^}]*background:var\(--ds-selected\)!important/s);
});

test('v279 makes the mobile Operations tab palette a semantic real-browser regression gate',async()=>{
  const [workflow,runner]=await Promise.all([
    read('.github/workflows/ci.yml'),
    read('tests/visual/run-operations-mobile-tabs-v242.cjs')
  ]);
  assert.match(workflow,/node tests\/visual\/run-operations-mobile-tabs-v242\.cjs/);
  assert.match(runner,/--ds-workspace/);
  assert.match(runner,/--ds-line/);
  assert.match(runner,/--ds-selected/);
  assert.match(runner,/active Operations tab is outside the active v279 selection surface/);
  assert.match(runner,/inactive Operations tab is not transparent/);
  assert.doesNotMatch(runner,/rgb\(14, 14, 14\)/);
  assert.doesNotMatch(runner,/rgb\(29, 29, 29\)/);
});

test('v242 refreshes installed PWA clients with the corrected Operations surface',async()=>{
  const [patch,distSw]=await Promise.all([
    read('scripts/pwa-cache-v205.mjs'),
    read('dist/sw.js')
  ]);
  assert.match(patch,/lourex-invoice-v242: mobile Operations matte tabs refresh/);
  assert.match(distSw,/lourex-invoice-v242: mobile Operations matte tabs refresh/);
});
