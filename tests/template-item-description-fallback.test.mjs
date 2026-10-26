import test from 'node:test';
import assert from 'node:assert/strict';
import { displayItemDescription } from '../dist/src/lib/document-item-description.js';

const item=(descriptionEn,descriptionAr='')=>({descriptionEn,descriptionAr});

test('Arabic item descriptions use Arabic when present and an unchanged LTR English fallback otherwise',()=>{
  assert.deepEqual(displayItemDescription(item('Valve 1/2 inch'),'ar'),{text:'Valve 1/2 inch',language:'en'});
  assert.deepEqual(displayItemDescription(item('Valve 1/2 inch','صمام نصف بوصة'),'ar'),{text:'صمام نصف بوصة',language:'ar'});
  assert.deepEqual(displayItemDescription(item('','صمام نصف بوصة'),'ar'),{text:'صمام نصف بوصة',language:'ar'});
  assert.deepEqual(displayItemDescription(item('Valve 1/2 inch',''),'en'),{text:'Valve 1/2 inch',language:'en'});
  assert.deepEqual(displayItemDescription(item('Valve 1/2 inch','صمام نصف بوصة'),'bilingual'),{text:'Valve 1/2 inch',language:'en'});
  assert.equal(displayItemDescription(item('',''),'ar'),null);
});

test('long English-only description remains complete for Arabic rendering',()=>{
  const description='Valve 1/2 inch — manufacturer specification, corrosion resistant, suitable for industrial water systems. '.repeat(40);
  const source=item(description);
  const resolved=displayItemDescription(source,'ar');
  assert.equal(resolved?.language,'en');
  assert.equal(resolved?.text,description.trim());
  assert.deepEqual(source,{descriptionEn:description,descriptionAr:''});
});
