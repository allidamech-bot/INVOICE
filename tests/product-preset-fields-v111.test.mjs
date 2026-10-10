import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPackingPreset,
  countryChoices,
  currencyChoices,
  parsePackingPreset,
  unitChoices
} from '../dist/src/lib/product-presets.js';

const read=path=>readFile(path,'utf8');

test('v111 gives product entry a broad preset vocabulary instead of repeated typing',()=>{
  const units=unitChoices(false).map(choice=>choice.value);
  for(const value of ['PCS','Carton','Box','Pack','Bag','Bottle','Can','Pallet','KG','G','L','ML'])assert.ok(units.includes(value),`missing unit ${value}`);
  assert.ok(units.length>=25);

  const currencies=currencyChoices(false).map(choice=>choice.value);
  for(const value of ['USD','EUR','SAR','TRY','AED','GBP','SYP','CNY','QAR','KWD'])assert.ok(currencies.includes(value),`missing currency ${value}`);
  assert.ok(currencies.length>=40);

  const origins=countryChoices(false).map(choice=>choice.value);
  for(const value of ['Türkiye','Saudi Arabia','Syria','Poland','Germany','Egypt','China'])assert.ok(origins.includes(value),`missing origin ${value}`);
  assert.ok(origins.length>=200);
});

test('v111 packing builder creates reusable commercial packing text and preserves custom values',()=>{
  assert.equal(buildPackingPreset('Carton','24','250 ml'),'24 × 250 ml / Carton');
  assert.equal(buildPackingPreset('Box','12',''),'12 PCS / Box');
  assert.equal(buildPackingPreset('Pallet','',''),'Pallet');

  assert.deepEqual(parsePackingPreset('24 × 250 ml / Carton'),{type:'Carton',count:'24',size:'250 ml',custom:false});
  assert.deepEqual(parsePackingPreset('12 PCS / Box'),{type:'Box',count:'12',size:'',custom:false});
  assert.equal(parsePackingPreset('12 inner boxes × 24 pcs').custom,true);
});

test('v111 applies the same smart controls to saved items and invoice item fields',async()=>{
  const ui=await read('src/components/UI.tsx');
  const saved=await read('src/components/SavedItemsModal.tsx');
  const editor=await read('src/components/EditorPageCore.tsx');

  assert.match(ui,/SmartProductFieldKind='unit'\|'currency'\|'origin'\|'packing'/);
  assert.match(ui,/label===t\('Unit','الوحدة'\)/);
  assert.match(ui,/label===t\('Currency','العملة'\)/);
  assert.match(ui,/label===t\('Origin','المنشأ'\)/);
  assert.match(ui,/label===t\('Packing','التعبئة'\)/);
  assert.match(ui,/Country of Origin/);
  assert.match(ui,/Other \/ Custom/);

  for(const source of [saved,editor]){
    assert.match(source,/label=\{t\('Unit','الوحدة'\)\}/);
    assert.match(source,/label=\{t\('Packing','التعبئة'\)\}/);
  }
  assert.match(saved,/label=\{t\('Origin','المنشأ'\)\}/);
  assert.match(saved,/label=\{t\('Currency','العملة'\)\}/);
});

test('product unit, currency, packing and origin controls remain isolated and available offline',async()=>{
 const [css,html,sw,bundle]=await Promise.all([read('src/styles/product-preset-fields-v111.css'),read('index.html'),read('dist/sw.js'),read('dist/styles/app.bundle.css')]);
 for(const t of ['.app-ui .smart-product-field','packing-preset-details','@media (max-width:720px)'])assert.ok(css.includes(t),t);
 assert.ok(!css.includes('.invoice-page')&&!css.includes('.items-table'));
 assert.ok(html.includes('product-preset-fields-v111.css'));
 assert.ok(bundle.includes('product-preset-fields-v111.css'));
 assert.ok(sw.includes('./src/lib/product-presets.js'));
 assert.ok(sw.includes('styles/app.bundle.css'));
});

