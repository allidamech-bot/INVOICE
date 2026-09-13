import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setUiLanguage} from '../dist/src/lib/i18n.js';
import {LATIN_FONT_OPTIONS,ARABIC_FONT_OPTIONS} from '../dist/src/lib/appearance.js';

test('v230 automatic font labels follow the application UI language',()=>{
  setUiLanguage('en');
  assert.equal(LATIN_FONT_OPTIONS[0].label,'Auto');
  assert.equal(ARABIC_FONT_OPTIONS[0].label,'Auto');
  setUiLanguage('ar');
  assert.equal(LATIN_FONT_OPTIONS[0].label,'تلقائي');
  assert.equal(ARABIC_FONT_OPTIONS[0].label,'تلقائي');
  setUiLanguage('en');
});

test('v230 keeps the automatic design label separated from its explanatory copy',async()=>{
  const css=await readFile('src/styles/obsidian-production-audit-v192.css','utf8');
  assert.match(css,/v230 — keep the automatic-design label visually separate/);
  assert.match(css,/\.app-ui \.appearance-auto-note strong\{[\s\S]*?margin-inline-end:7px!important[\s\S]*?white-space:nowrap!important/);
});

test('v230 refreshes installed PWA clients without invalidating existing cache compatibility',async()=>{
  const [patch,distSw]=await Promise.all([
    readFile('scripts/pwa-cache-v205.mjs','utf8'),
    readFile('dist/sw.js','utf8')
  ]);
  assert.match(patch,/lourex-invoice-v230: editor detail polish refresh/);
  assert.match(distSw,/lourex-invoice-v230: editor detail polish refresh/);
  assert.match(distSw,/const CACHE = 'lourex-invoice-v228'/);
  assert.match(distSw,/nested-surface-consistency-v229\.css/);
});
