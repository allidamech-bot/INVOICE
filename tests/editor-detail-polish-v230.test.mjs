import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setUiLanguage} from '../dist/src/lib/i18n.js';
import {LATIN_FONT_OPTIONS,ARABIC_FONT_OPTIONS} from '../dist/src/lib/appearance.js';
import {unitChoices,packingTypeChoices,categoryChoices,countryChoices} from '../dist/src/lib/product-presets.js';
import {paymentTermChoices,deliveryTimeChoices} from '../dist/src/lib/workflow-presets.js';

test('v230 automatic font labels follow the application UI language',()=>{
  setUiLanguage('en');
  assert.equal(LATIN_FONT_OPTIONS[0].label,'Auto');
  assert.equal(ARABIC_FONT_OPTIONS[0].label,'Auto');
  setUiLanguage('ar');
  assert.equal(LATIN_FONT_OPTIONS[0].label,'تلقائي');
  assert.equal(ARABIC_FONT_OPTIONS[0].label,'تلقائي');
  setUiLanguage('en');
});

test('v230 product preset labels stay in the active UI language while stored values remain canonical',()=>{
  assert.deepEqual(unitChoices(false).find(choice=>choice.value==='Unit'),{value:'Unit',label:'Unit'});
  assert.deepEqual(unitChoices(true).find(choice=>choice.value==='Unit'),{value:'Unit',label:'وحدة'});
  assert.deepEqual(packingTypeChoices(true).find(choice=>choice.value==='Carton'),{value:'Carton',label:'كرتون'});
  assert.deepEqual(categoryChoices(true).find(choice=>choice.value==='Energy Drinks'),{value:'Energy Drinks',label:'مشروبات طاقة'});
  const englishCountries=countryChoices(false);
  const arabicCountries=countryChoices(true);
  const preferredCountry=englishCountries[0];
  assert.ok(preferredCountry);
  const localizedCountry=arabicCountries.find(choice=>choice.value===preferredCountry.value);
  assert.ok(localizedCountry);
  assert.ok(!localizedCountry.label.includes(` — ${preferredCountry.value}`),`Arabic country label must not append English: ${localizedCountry.label}`);
});

test('v230 workflow preset labels stay locale-pure while canonical stored values stay unchanged',()=>{
  assert.deepEqual(paymentTermChoices(false).find(choice=>choice.value==='Net 30 Days'),{value:'Net 30 Days',label:'Net 30 days'});
  assert.deepEqual(paymentTermChoices(true).find(choice=>choice.value==='Net 30 Days'),{value:'Net 30 Days',label:'أجل 30 يومًا'});
  assert.deepEqual(deliveryTimeChoices(false).find(choice=>choice.value==='Ready Stock'),{value:'Ready Stock',label:'Ready stock'});
  assert.deepEqual(deliveryTimeChoices(true).find(choice=>choice.value==='Ready Stock'),{value:'Ready Stock',label:'متوفر وجاهز'});
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
