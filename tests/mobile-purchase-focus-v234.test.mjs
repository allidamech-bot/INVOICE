import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const has=(source,needle,message)=>assert.ok(source.includes(needle),message||`missing: ${needle}`);

test('v234 gives phone purchase editing a focused form-only workspace',async()=>{
  const css=await read('src/styles/obsidian-mobile-geometry-v193.css');
  const start=css.indexOf('/* v234 — mobile purchase focus.');
  assert.ok(start>=0,'v234 purchase focus block is missing');
  const v234=css.slice(start,css.indexOf('@media print',start));
  has(v234,'.app-ui:has(.operations-page .purchase-editor) .workspace-topbar');
  has(v234,'.app-ui:has(.operations-page .purchase-editor) .mobile-bottom-nav');
  has(v234,'display:none!important');
  has(v234,'grid-template-rows:minmax(0,1fr)!important');
  has(v234,'grid-row:1!important');
  has(v234,'padding-bottom:max(12px,env(safe-area-inset-bottom))!important');
  has(v234,'.operations-page:has(.purchase-editor)>.operations-hero');
  has(v234,'.operations-page:has(.purchase-editor)>.operations-summary');
  has(v234,'.operations-page:has(.purchase-editor)>.operations-tabs');
  assert.doesNotMatch(v234,/\.invoice-page|\.invoice-pages/);
});

test('v234 browser QA protects 320 and 390 purchase editing in both directions',async()=>{
  const runner=await read('tests/visual/run-obsidian-financial.cjs');
  has(runner,'{width:390,height:844}');
  has(runner,'{width:320,height:568}');
  has(runner,"for(const lang of ['en','ar'])");
  has(runner,'purchase shell topbar must leave focused phone editor');
  has(runner,'operations overview must leave focused purchase editor');
  has(runner,'operations summary must leave focused purchase editor');
  has(runner,'operations tabs must leave focused purchase editor');
  has(runner,'purchase action bar covers editable fields');
});

test('v234 refreshes installed clients without changing printable output',async()=>{
  const [pwa,css]=await Promise.all([
    read('scripts/pwa-cache-v205.mjs'),
    read('src/styles/obsidian-mobile-geometry-v193.css')
  ]);
  has(pwa,'lourex-invoice-v234: focused mobile purchase editing refresh');
  const start=css.indexOf('/* v234 — mobile purchase focus.');
  const v234=css.slice(start,css.indexOf('@media print',start));
  assert.doesNotMatch(v234,/\.invoice-page|\.invoice-pages/);
});
