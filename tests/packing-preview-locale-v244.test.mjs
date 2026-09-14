import test from 'node:test';
import assert from 'node:assert/strict';
import { displayPackingPreset } from '../dist/src/lib/packing-display.js';
import { buildPackingPreset, parsePackingPreset } from '../dist/src/lib/product-presets.js';

test('v244 localizes known packing values for display without changing canonical storage',()=>{
  assert.equal(displayPackingPreset('Box',false),'Box');
  assert.equal(displayPackingPreset('Box',true),'علبة / صندوق');
  assert.equal(displayPackingPreset('12 PCS / Carton',false),'12 PCS / Carton');
  assert.equal(displayPackingPreset('12 PCS / Carton',true),'12 قطعة / كرتون');
  assert.equal(displayPackingPreset('12 × 330 ml / Carton',true),'12 × 330 ml / كرتون');

  assert.deepEqual(parsePackingPreset('Box'),{type:'Box',count:'',size:'',custom:false});
  assert.equal(buildPackingPreset('Box','',''),'Box');
  assert.equal(buildPackingPreset('Carton','12',''),'12 PCS / Carton');
});

test('v244 preserves custom packing copy exactly as entered',()=>{
  const custom='12 علبة × 24 قطعة';
  assert.equal(displayPackingPreset(custom,false),custom);
  assert.equal(displayPackingPreset(custom,true),custom);
});
