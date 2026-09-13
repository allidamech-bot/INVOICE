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

test('v228 loads last for app chrome and ships in the installed PWA',async()=>{
  const [html,sw,patch,dist]=await Promise.all([read('index.html'),read('public/sw.js'),read('scripts/pwa-cache-v205.mjs'),read('dist/styles/app.bundle.css')]);
  const matte=html.indexOf('./styles/matte-black-v228.css');
  assert.ok(matte>html.indexOf('./styles/luminous-noir-v224.css'));
  assert.ok(matte<html.indexOf('./styles/document-premium-redesign-v141.css'));
  assert.match(sw,/LOCAL_CORE\.push\('\.\/styles\/matte-black-v228\.css'\)/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v228'/);
  assert.match(dist,/LOUREX Matte Black/);
});

test('v228 removes 3D treatments from public and emergency surfaces',async()=>{
  const [html,health,bridge,entry,recovery]=await Promise.all([
    read('index.html'),read('public/health.html'),read('public/ios-print-bridge.js'),read('src/app/index.tsx'),read('src/app/AppErrorBoundary.tsx')
  ]);
  assert.doesNotMatch(html.slice(html.indexOf('<style id="lourex-boot-style">'),html.indexOf('</style>')),/gradient\(|box-shadow/);
  assert.doesNotMatch(health,/gradient\(|backdrop-filter/);
  assert.match(bridge,/\.lourex-ios-output-primary\{[^}]*background-image:none!important/);
  assert.match(entry,/reload\.style\.boxShadow='none'/);
  assert.match(recovery,/boxShadow:'none'/);
});
