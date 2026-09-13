import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v225 keeps launch and installed PWA chrome in the Luminous Noir palette',async()=>{
  const [html,manifestText,patch,launchCss]=await Promise.all([
    read('index.html'),
    read('public/manifest.webmanifest'),
    read('scripts/pwa-cache-v205.mjs'),
    read('src/styles/auth-entry.css')
  ]);
  const manifest=JSON.parse(manifestText);
  assert.match(html,/<meta name="theme-color" content="#07121A" \/>/);
  assert.match(html,/linear-gradient\(145deg,#050A11 0%,#09151F 52%,#0B1723 100%\)/);
  assert.match(html,/linear-gradient\(90deg,#6958EA,#9CACFF,#2F82C9\)/);
  assert.match(launchCss,/linear-gradient\(145deg,#050A11 0%,#09151F 52%,#0B1723 100%\)/);
  assert.match(launchCss,/linear-gradient\(90deg,#6958EA,#9CACFF,#2F82C9\)/);
  assert.equal(manifest.background_color,'#07121A');
  assert.equal(manifest.theme_color,'#07121A');
  assert.match(patch,/const CACHE = 'lourex-invoice-v225'/);
  assert.match(patch,/v225 extends Luminous Noir through launch, diagnostics, updates and iPhone output/);
});

test('v225 removes the remaining light diagnostics and iPhone output surfaces',async()=>{
  const [health,bridge]=await Promise.all([
    read('public/health.html'),
    read('public/ios-print-bridge.js')
  ]);
  assert.match(health,/color-scheme:dark/);
  assert.match(health,/background:#0F1B28/);
  assert.match(health,/linear-gradient\(135deg,#6958EA,#456EDD 50%,#2F82C9\)/);
  assert.doesNotMatch(health,/\.card\{background:#fff/);
  assert.doesNotMatch(health,/\.row\{[^}]*background:#fbfaf7/);
  assert.match(bridge,/\.lourex-ios-output-card\{[^}]*background:#0F1B28/);
  assert.match(bridge,/\.lourex-ios-output-primary\{[^}]*background:#5346D8!important/);
  assert.doesNotMatch(bridge,/\.lourex-ios-output-card\{[^}]*background:#fffdf9/);
});

test('v225 keeps transient refresh and update controls dark and touch safe',async()=>{
  const [pull,entry,recovery]=await Promise.all([
    read('src/styles/pull-to-refresh-v86.css'),
    read('src/app/index.tsx'),
    read('src/app/AppErrorBoundary.tsx')
  ]);
  assert.match(pull,/\.lourex-pull-refresh\{[^}]*background:rgba\(11,21,31,.96\)/);
  assert.match(pull,/\.lourex-pull-refresh\.is-ready \.lourex-pull-icon\{background:#5346D8/);
  assert.doesNotMatch(pull,/background:rgba\(255,253,249,.96\)/);
  assert.match(entry,/reload\.style\.minHeight='44px'/);
  assert.match(entry,/reload\.style\.background='linear-gradient\(135deg,#6958EA,#456EDD 50%,#2F82C9\)'/);
  assert.match(recovery,/background:'linear-gradient\(135deg,#6958EA,#456EDD 50%,#2F82C9\)'/);
});
