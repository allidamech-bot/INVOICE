import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('legacy flat launch contract remains safe while v280 supplies theme-aware fintech chrome',async()=>{
  const [html,manifestText,patch,launchCss]=await Promise.all([
    read('index.html'),
    read('public/manifest.webmanifest'),
    read('scripts/pwa-cache-v205.mjs'),
    read('src/styles/auth-entry.css')
  ]);
  const manifest=JSON.parse(manifestText);
  assert.match(html,/<meta name="theme-color" content="#061820" \/>/);
  assert.match(html,/id="lourex-theme-bootstrap"/);
  assert.match(html,/resolved==='light'\?'#f2f7f8':'#061820'/);
  assert.match(html,/html\[data-ui-theme="dark"\]\{[^}]*--boot-bg:#061820[^}]*--boot-accent:#20d3db/);
  assert.match(html,/#lourex-boot\.loading-screen\{[^}]*background:var\(--boot-bg,#061820\)/);
  assert.match(html,/#lourex-boot \.loading-line:after\{[^}]*background:var\(--boot-accent,#24c7ba\)/);
  assert.equal(manifest.background_color,'#061820');
  assert.equal(manifest.theme_color,'#061820');
  assert.match(patch,/const CACHE = 'lourex-invoice-v228'/);
  assert.match(patch,/v228 replaces decorative Luminous Noir effects with a flat Matte Black accounting interface/);
  assert.match(launchCss,/\.loading-screen/);
});

test('v228 keeps diagnostics and iPhone output flat matte black',async()=>{
  const [health,bridge]=await Promise.all([
    read('public/health.html'),
    read('public/ios-print-bridge.js')
  ]);
  assert.match(health,/color-scheme:dark/);
  assert.match(health,/body\{[^}]*background:#080808/);
  assert.match(health,/\.card\{[^}]*background:#141414;box-shadow:none/);
  assert.doesNotMatch(health,/gradient\(/);
  assert.doesNotMatch(health,/\.card\{background:#fff/);
  assert.doesNotMatch(health,/\.row\{[^}]*background:#fbfaf7/);
  assert.match(bridge,/\.lourex-ios-output-card\{[^}]*background:#141414[^}]*box-shadow:none/);
  assert.match(bridge,/\.lourex-ios-output-primary\{[^}]*background:#B8A071!important[^}]*background-image:none!important/);
  assert.doesNotMatch(bridge,/\.lourex-ios-output-card\{[^}]*background:#fffdf9/);
});

test('v228 keeps transient controls flat, dark and touch safe',async()=>{
  const [pull,entry,recovery]=await Promise.all([
    read('src/styles/pull-to-refresh-v86.css'),
    read('src/app/index.tsx'),
    read('src/app/AppErrorBoundary.tsx')
  ]);
  assert.match(pull,/\.lourex-pull-refresh\{[^}]*background:#141414;box-shadow:none/);
  assert.match(pull,/\.lourex-pull-refresh\.is-ready \.lourex-pull-icon\{background:#B8A071/);
  assert.doesNotMatch(pull,/background:rgba\(255,253,249,.96\)/);
  assert.match(entry,/reload\.style\.minHeight='44px'/);
  assert.match(entry,/reload\.style\.background='#B8A071'/);
  assert.match(entry,/reload\.style\.boxShadow='none'/);
  assert.match(recovery,/background:'#080808'/);
  assert.match(recovery,/background:'#B8A071'/);
});
