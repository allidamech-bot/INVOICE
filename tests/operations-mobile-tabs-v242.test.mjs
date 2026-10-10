import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Operations mobile tabs use the approved semantic palette and touch-safe sizing',async()=>{
 const [current,html]=await Promise.all([read('src/styles/tailadmin-operations-v320.css'),read('index.html')]);
 assert.ok(html.includes('tailadmin-operations-v320.css'),'active Operations owner must be linked');
 assert.equal(html.includes('operations-mobile-tabs-v242.css'),false,'retired light override is not loaded');
 for(const token of ['.ta-ops-tabs','var(--ft-surface','var(--ft-accent)','min-height:44px'])assert.ok(current.includes(token),token);
 assert.ok(current.includes('ta-ops-tabs'),'current mobile Operations tabs remain styled');
 assert.ok(!current.includes('.invoice-page'),'tabs must not affect document output');
});

test('v279 makes the mobile Operations tab palette a semantic real-browser regression gate',async()=>{
  const [workflow,runner]=await Promise.all([
    read('scripts/verify-local.mjs'),
    read('tests/visual/run-operations-mobile-tabs-v242.cjs')
  ]);
  assert.match(workflow,/tests\/visual\/run-operations-mobile-tabs-v242\.cjs/);
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
