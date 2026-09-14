import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { displayUnitPreset } from '../dist/src/lib/unit-display.js';

const read=path=>readFile(path,'utf8');

test('v247 localizes known canonical units and preserves custom unit text',()=>{
  assert.equal(displayUnitPreset('PCS',false),'Piece');
  assert.equal(displayUnitPreset('PCS',true),'قطعة');
  assert.equal(displayUnitPreset('Carton',false),'Carton');
  assert.equal(displayUnitPreset('Carton',true),'كرتون');
  assert.equal(displayUnitPreset('Box',true),'علبة / صندوق');
  assert.equal(displayUnitPreset('Sleeve',false),'Sleeve');
  assert.equal(displayUnitPreset('Sleeve',true),'Sleeve');
  assert.equal(displayUnitPreset('',true),'');
});

test('v247 localizes Product Library read-only unit text without changing editor storage',async()=>{
  const source=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(source,/displayUnitPreset\(item\.unit,isArabic\(\)\)/,'catalog rows must localize known units');
  assert.match(source,/<Input value=\{edit\.unit\} onChange=\{\(e:any\)=>this\.set\('unit',e\.target\.value\)\}\/\>/,'unit editor must keep the raw stored value');
  assert.match(source,/unit:'PCS'/,'new saved products must keep the canonical default unit');
});
