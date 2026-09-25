import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v339 build patches both heavy document editors before PWA precache',async()=>{
  const [pkg,script]=await Promise.all([read('package.json'),read('scripts/v339-ipados-desktop-stability.mjs')]);
  const build=JSON.parse(pkg).scripts.build;
  const patchAt=build.indexOf('node scripts/v339-ipados-desktop-stability.mjs');
  const precacheAt=build.indexOf('node scripts/pwa-auto-precache.mjs');
  assert.ok(patchAt>=0&&precacheAt>patchAt,'compiled editor hardening must run before PWA precache');
  assert.match(script,/EditorPageCore\.js/);
  assert.match(script,/DraftDocumentEditor\.js/);
  assert.match(script,/MacIntel/);
  assert.match(script,/maxTouchPoints/);
  assert.match(script,/initialPreviewMatches!==1/);
  assert.match(script,/previewEventMatches!==2/);
  assert.match(script,/__lourexAppleMobileWebKit/);
  assert.match(script,/event\.matches&&!__lourexAppleMobileWebKit\(\)/);
});

test('v339 keeps iPad landscape Draft on one scroll owner above the old 1180px cutoff',async()=>{
  const css=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(css,/@media screen and \(min-width:1181px\) and \(max-width:1366px\)/);
  assert.match(css,/html\[data-lourex-ios-webkit="true"\][\s\S]*\.draft-studio-preview\{[\s\S]*display:none!important/);
  assert.match(css,/html\[data-lourex-ios-webkit="true"\][\s\S]*\.ta-main\{[\s\S]*overflow-y:auto!important/);
  assert.match(css,/html\[data-lourex-ios-webkit="true"\][\s\S]*\.draft-studio-layout\{[\s\S]*display:block!important/);
});

test('v339 CI executes the real 1194x834 WebKit Draft gate',async()=>{
  const [workflow,runner]=await Promise.all([read('.github/workflows/ci.yml'),read('tests/visual/run-v339-ipad-landscape-draft.cjs')]);
  assert.match(workflow,/node tests\/visual\/run-v339-ipad-landscape-draft\.cjs/);
  assert.match(runner,/viewport:\{width:1194,height:834\}/);
  assert.match(runner,/platform[^\n]*MacIntel/);
  assert.match(runner,/maxTouchPoints/);
  assert.match(runner,/Draft editor disappeared after landscape scroll/);
  assert.match(runner,/URL changed during Draft landscape scroll/);
});
