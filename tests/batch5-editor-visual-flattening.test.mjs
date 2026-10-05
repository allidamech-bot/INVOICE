import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Batch 5 flattens nested editor controls inside the existing final v485 owner only',async()=>{
  const owner=await read('scripts/v485-bundle-visible-ui.mjs');
  const match=owner.match(/const editorFlatteningGuard=`([\s\S]*?)`;\n\nconst sourceCss=/);
  assert.ok(match,'Batch 5 editor flattening guard must stay inside the existing v485 build owner');
  const css=match[1];
  assert.match(css,/LOUREX Batch 5 — document editor visual flattening/);
  assert.match(css,/\.item-pricing-grid[\s\S]*?background:transparent!important/,'pricing fields must not render as a nested card');
  assert.match(css,/\.item-advanced-fields[\s\S]*?border:0!important[\s\S]*?border-radius:0!important/,'advanced item fields must remain content inside the item surface');
  assert.match(css,/\.appearance-system-grid[\s\S]*?background:transparent!important[\s\S]*?box-shadow:none!important/,'document design must not become a nested panel');
  assert.match(css,/\.watermark-editor-card[\s\S]*?background:transparent!important[\s\S]*?box-shadow:none!important/,'watermark must continue the document-design surface');
  assert.match(css,/min-height:44px!important/,'editor controls must stay touch safe');
  assert.match(css,/@media screen and \(max-width:900px\)[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/,'mobile item fields must collapse without horizontal overflow');
  assert.match(css,/text-align:start!important/,'RTL/LTR must use logical alignment');
  assert.doesNotMatch(css,/@media\s+print|\.invoice-page|\.template-|\.pdf-|\.mobile-editor-actionbar|\.draft-mobile-actionbar/,'Batch 5 must not change printable document output or the fixed editor dock');
});

test('Batch 5 flattening is emitted after the existing v485 visual rules in both production CSS artifacts',async()=>{
  const [bundle,standalone]=await Promise.all([read('dist/styles/app.bundle.css'),read('dist/styles/v482-mobile-ux-repair.css')]);
  const ownerMarker='/* --- v485-visible-ui-corrections.css --- */';
  const batch5Marker='LOUREX Batch 5 — document editor visual flattening';
  for(const [name,content] of [['bundle',bundle],['standalone',standalone]]){
    assert.ok(content.includes(batch5Marker),`${name} is missing Batch 5 editor flattening`);
    assert.ok(content.lastIndexOf(batch5Marker)>content.lastIndexOf(ownerMarker),`${name} must emit Batch 5 inside the final v485 owner`);
    const tail=content.slice(content.lastIndexOf(batch5Marker));
    assert.match(tail,/\.item-pricing-grid[\s\S]*?background:transparent!important/);
    assert.match(tail,/\.watermark-editor-card[\s\S]*?background:transparent!important/);
  }
});
