import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

const [pkg,bundler,reliability,elite,closeout]=await Promise.all([
  read('package.json'),
  read('scripts/v475-bundle-mobile-design.mjs'),
  read('src/styles/tailadmin-reliability-bridge-v320.css'),
  read('src/styles/mobile-command-center-v475-elite.css'),
  read('src/styles/mobile-v475-qa-closeout.css')
]);

test('v475 production build explicitly inlines the complete mobile design stack',()=>{
  assert.match(pkg,/node scripts\/v363-bundle-visual-owners\.mjs && node scripts\/v475-bundle-mobile-design\.mjs/);
  for(const name of [
    'mobile-command-center-v475.css',
    'mobile-command-center-v475-elite.css',
    'mobile-workspaces-v475.css',
    'mobile-editor-v475.css',
    'mobile-overlays-v475.css',
    'mobile-auth-v475.css',
    'mobile-review-v475.css',
    'mobile-v475-qa-closeout.css'
  ])assert.ok(bundler.includes(`'${name}'`),`production bundler is missing ${name}`);
  assert.match(bundler,/bundle=`\$\{bundle\.slice\(0,insertion\)\}\$\{blocks\.join\('\\n'\)\}/);
  assert.match(bundler,/runtime v475 @import survived bundling/);
});

test('source/dev imports stay valid while production strips them before concatenation',()=>{
  assert.match(reliability,/@import url\("\.\/mobile-command-center-v475-elite\.css\?v=475-2"\);/);
  assert.match(reliability,/@import url\("\.\/mobile-review-v475\.css\?v=475-7"\);/);
  assert.match(elite,/^@import url\("\.\/mobile-command-center-v475\.css\?v=475-1"\);/);
  assert.match(bundler,/bundle=bundle\.replace\(runtimeImportPattern,''\)/);
  assert.match(bundler,/name==='mobile-command-center-v475-elite\.css'/);
  assert.match(bundler,/mobile-command-center-v475\\\.css\\\?v=475-1/);
});

test('v475 production QA closeout preserves premium design without regressing mobile contracts',()=>{
  assert.match(closeout,/font-family:"Noto Sans Arabic",Outfit,Inter/);
  assert.match(closeout,/\.ta-ops-stat/);
  assert.match(closeout,/background-color:/);
  assert.match(closeout,/\.ta-report-presets>button/);
  assert.match(closeout,/min-height:44px!important/);
  assert.match(closeout,/\.modal:has\(\.issue-review\)/);
  assert.doesNotMatch(closeout,/(?:localStorage|indexedDB|firebase|firestore|setState\(|vault\.)/);
});
