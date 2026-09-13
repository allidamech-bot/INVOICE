import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v241 width-fits narrow-phone A4 preview without shrinking printable document geometry',async()=>{
  const [previewCss,documentCss]=await Promise.all([
    read('src/styles/mobile-preview-v156.css'),
    read('src/styles/document.css')
  ]);
  assert.match(previewCss,/@media screen and \(max-width:390px\)[\s\S]*--preview-scale:\.445!important/);
  assert.match(previewCss,/@media screen and \(max-width:375px\)[\s\S]*--preview-scale:\.43!important/);
  assert.match(previewCss,/@media screen and \(max-width:360px\)[\s\S]*--preview-scale:\.405!important/);
  assert.match(previewCss,/@media screen and \(max-width:340px\)[\s\S]*--preview-scale:\.38!important/);
  assert.match(documentCss,/\.invoice-page\{width:210mm;height:297mm/);
  assert.match(documentCss,/transform:scale\(var\(--preview-scale\)\)/);
});

test('v241 makes preview-edge containment a required Browser Visual QA check',async()=>{
  const [workflow,runner]=await Promise.all([
    read('.github/workflows/ci.yml'),
    read('tests/visual/run-mobile-preview-fit-v241.cjs')
  ]);
  assert.match(workflow,/node tests\/visual\/run-mobile-preview-fit-v241\.cjs/);
  assert.match(runner,/A4 preview clips the left edge/);
  assert.match(runner,/A4 preview clips the right edge/);
  assert.match(runner,/A4 preview is not width-fit/);
  assert.match(runner,/authoredWidth>790&&geometry\.authoredWidth<797/);
});

test('v241 refreshes installed PWA clients with the corrected preview geometry',async()=>{
  const [patch,distSw]=await Promise.all([
    read('scripts/pwa-cache-v205.mjs'),
    read('dist/sw.js')
  ]);
  assert.match(patch,/lourex-invoice-v241: narrow mobile A4 preview fit refresh/);
  assert.match(distSw,/lourex-invoice-v241: narrow mobile A4 preview fit refresh/);
});
