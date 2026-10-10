import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v228 establishes a flat matte-black accounting palette',async()=>{
  const css=await read('src/styles/matte-black-v228.css');
  assert.match(css,/--ds-canvas:#080808/);
  assert.match(css,/--ds-surface:#141414/);
  assert.match(css,/--ds-accent:#B8A071/);
  assert.match(css,/\.app-ui \.dashboard-hero::before,\.app-ui \.dashboard-hero::after\{display:none!important/);
  assert.match(css,/\.app-ui \.mobile-create-button\{[\s\S]*margin-top:0!important/);
  assert.match(css,/\.app-ui :is\(\.btn\.btn-primary,\.shell-create-button\.btn-primary,\.mobile-create-button\)\{[\s\S]*box-shadow:none!important/);
  assert.match(css,/\.auth-account-page\{background-color:#080808!important;background-image:none!important/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient/);
  assert.doesNotMatch(css,/\.invoice-page|\.invoice-pages|@media print/);
});

test('approved dark-only matte visual owner loads in current cascade and offline bundle',async()=>{
 const [html,sw,dist,dark]=await Promise.all([read('index.html'),read('dist/sw.js'),read('dist/styles/app.bundle.css'),read('src/styles/matte-black-dark-v360.css')]);
 assert.ok(html.includes('matte-black-dark-v360.css'));
 assert.ok(html.includes('tailadmin-reliability-bridge-v320.css'));
 assert.equal(html.includes('matte-black-v228.css'),false,'retired all-theme matte CSS cannot overwrite approved light UI');
 assert.ok(dist.includes('matte-black-dark-v360.css'));
 assert.ok(sw.includes('styles/app.bundle.css'));
 assert.ok(dark.includes('html[data-ui-theme="dark"]'));
 assert.ok(dark.includes('background-image:none!important'));
 assert.ok(!dark.includes('.invoice-page'),'dark workspace cannot override document paper');
});

test('current dark workspace contrast remains flat while diagnostics and fallback UI stay readable',async()=>{
 const [dark,health,bridge,entry,recovery]=await Promise.all([read('src/styles/matte-black-dark-v360.css'),read('public/health.html'),read('public/ios-print-bridge.js'),read('src/app/index.tsx'),read('src/app/AppErrorBoundary.tsx')]);
 assert.ok(dark.includes('box-shadow:none!important'),'dark cards must avoid extraneous elevation');
 assert.ok(dark.includes('background-image:none!important'));
 assert.ok(health.includes('System health')&&health.includes('Unified Diagnostics'),'health diagnostics remain visible');
 assert.ok(bridge.includes('.lourex-ios-output-primary'),'iPhone output action remains available');
 assert.ok(entry.includes('showUpdateNotice'),'startup update path remains available');
 assert.ok(recovery.includes('health.html'),'recovery continues to diagnostics');
});

