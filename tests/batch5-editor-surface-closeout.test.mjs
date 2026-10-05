import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Batch 5 editor surface owner runs after v485 and before PDF output finalizer',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts?.build||'');
  const v485=build.indexOf('node scripts/v485-bundle-visible-ui.mjs');
  const batch5=build.indexOf('node scripts/batch5-bundle-editor-surface-closeout.mjs');
  const pdf=build.indexOf('node scripts/v544-pdf-a4-output-emergency.mjs');
  assert.ok(v485>=0&&batch5>v485&&pdf>batch5,'Batch 5 must own editor surfaces after v485 without becoming a PDF owner');
});

test('Batch 5 flattens nested item pricing/trade surfaces without touching printable pages',async()=>{
  const css=await read('src/styles/batch5-editor-surface-closeout.css');
  assert.match(css,/LOUREX Batch 5/);
  assert.match(css,/\.screen-editor \.premium-item-card \.item-pricing-grid[\s\S]*?border:0!important;[\s\S]*?background:transparent!important;[\s\S]*?box-shadow:none!important;/);
  assert.match(css,/\.screen-editor \.premium-item-card \.item-advanced-fields[\s\S]*?border:0!important;[\s\S]*?background:transparent!important;[\s\S]*?box-shadow:none!important;/);
  assert.match(css,/html\[data-ui-theme="dark"\][\s\S]*?background:transparent!important/);
  assert.doesNotMatch(css,/@media print|\.invoice-page|\.document-page/,'Batch 5 editor presentation must not own PDF/print output');
});

test('Batch 5 preserves non-standard document pricing semantics',async()=>{
  const css=await read('src/styles/batch5-editor-surface-closeout.css');
  assert.match(css,/data-document-kind="rfq"[\s\S]*?data-document-kind="delivery-note"[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/data-document-kind="payment-receipt"[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
  assert.doesNotMatch(css,/item-pricing-grid\s*\{[\s\S]{0,180}?display:/,'final surface owner must not override v332 show/hide behavior');
});

test('Batch 5 is emitted once after v485 in both production style artifacts',async()=>{
  const [bundle,standalone]=await Promise.all([read('dist/styles/app.bundle.css'),read('dist/styles/v482-mobile-ux-repair.css')]);
  const marker='/* --- batch5-editor-surface-closeout.css --- */';
  const previous='/* --- v485-visible-ui-corrections.css --- */';
  for(const [name,css] of [['bundle',bundle],['standalone',standalone]]){
    assert.equal(css.split(marker).length-1,1,`${name} must contain exactly one Batch 5 owner`);
    assert.ok(css.lastIndexOf(marker)>css.lastIndexOf(previous),`${name} Batch 5 owner must follow v485`);
    assert.match(css,/batch5-editor-surface-closeout\.css[\s\S]*?item-pricing-grid[\s\S]*?background:transparent!important/);
  }
});
