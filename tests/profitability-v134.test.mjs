import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_SCHEMA_VERSION, emptyVault, defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument, emptyItem } from '../dist/src/lib/documents.js';
import { calculateProfitability } from '../dist/src/lib/profitability.js';
import { migrateVault } from '../dist/src/storage/vault.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

function sampleDocument(){
  const doc=createBlankDocument('invoice','INV-2026-9999',defaultCompany());
  const first={...emptyItem(),descriptionEn:'Product A',quantity:'2',unitPrice:'100',unitCost:'60'};
  const second={...emptyItem(),descriptionEn:'Product B',quantity:'1',unitPrice:'50',unitCost:'20'};
  doc.items=[first,second];
  doc.adjustments={
    discountEnabled:true,discountMode:'percent',discountValue:'10',
    shippingEnabled:true,shipping:'15',otherChargesEnabled:true,otherCharges:'10',
    taxEnabled:true,taxPercent:'20'
  };
  doc.internalCosts={shippingCost:'8',otherCost:'2'};
  doc.currency='USD';
  return doc;
}

test('v134 calculates tax-exclusive gross profit and margin from direct internal costs',()=>{
  const summary=calculateProfitability(sampleDocument());
  assert.equal(summary.netRevenue,'250.00');
  assert.equal(summary.itemCost,'140.00');
  assert.equal(summary.shippingCost,'8.00');
  assert.equal(summary.otherCost,'2.00');
  assert.equal(summary.totalCost,'150.00');
  assert.equal(summary.grossProfit,'100.00');
  assert.equal(summary.marginPercent,'40.00');
  assert.equal(summary.complete,true);
  assert.equal(summary.missingCostItems,0);
});

test('v134 refuses to present a complete margin when an item cost is missing',()=>{
  const doc=sampleDocument();
  doc.items[1].unitCost='';
  const summary=calculateProfitability(doc);
  assert.equal(summary.complete,false);
  assert.equal(summary.missingCostItems,1);
  assert.equal(summary.costedItems,1);
  assert.equal(summary.marginPercent,'');
  assert.equal(summary.totalCost,'130.00');
});

test('v134 credit notes reverse revenue, cost and gross profit without changing the economic margin ratio',()=>{
  const doc=sampleDocument();
  doc.role='credit-note';
  const summary=calculateProfitability(doc);
  assert.equal(summary.isReversal,true);
  assert.equal(summary.netRevenue,'-250.00');
  assert.equal(summary.totalCost,'-150.00');
  assert.equal(summary.grossProfit,'-100.00');
  assert.equal(summary.marginPercent,'40.00');
});

test('v134 migrates v8 vaults with safe blank item costs and zero internal overheads',()=>{
  const vault=emptyVault();
  vault.schemaVersion=8;
  const doc=createBlankDocument('invoice','INV-2026-0001',vault.company);
  delete doc.items[0].unitCost;
  delete doc.internalCosts;
  vault.documents=[doc];
  vault.savedItems=[{
    id:'legacy-product',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
    descriptionEn:'Legacy',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'10',lastCurrency:'USD',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z'
  }];
  const migrated=migrateVault(vault);
  assert.equal(APP_SCHEMA_VERSION,9);
  assert.equal(migrated.schemaVersion,9);
  assert.equal(migrated.documents[0].items[0].unitCost,'');
  assert.deepEqual(migrated.documents[0].internalCosts,{shippingCost:'0.00',otherCost:'0.00'});
  assert.equal(migrated.savedItems[0].lastUnitCost,'');
  assert.equal(migrated.savedItems[0].lastCostCurrency,'');
});

test('v134 keeps internal profitability outside all customer-facing document rendering',async()=>{
  const [renderer,css,panel]=await Promise.all([
    read('src/templates/TemplateRenderer.tsx'),
    read('src/styles/profitability-v134.css'),
    read('src/components/ProfitabilityPanel.tsx')
  ]);
  assert.doesNotMatch(renderer,/unitCost|internalCosts|ProfitabilityPanel|Gross profit|الربح الإجمالي/);
  assert.match(css,/@media print\{\.profitability-panel\{display:none!important\}\}/);
  assert.match(panel,/Internal only · never printed/);
  assert.match(panel,/not rendered in invoices, PDFs, print, or share output/);
});

test('v134 editor integration preserves newer internal costs against stale core autosaves',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/ProfitabilityPanel/);
  assert.match(editor,/withLatestInternalCosts/);
  assert.match(editor,/latestCosts=new Map/);
  assert.match(editor,/this\.props\.onSave\(this\.withLatestInternalCosts\(doc\),auto\)/);
  assert.match(editor,/<ProfitabilityPanel[^>]*onSave=\{props\.onSave\}/);
});

test('v134 PWA ships profitability offline while preserving legacy compatibility and final performance layer',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const profitability='./styles/profitability-v134.css';
  const performance='./styles/performance-polish-v100.css';
  assert.ok(index.includes(profitability));
  assert.ok(index.indexOf(profitability)<index.indexOf(performance));
  assert.equal([...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>match[1]).at(-1),performance);
  for(const asset of [profitability,'./src/components/ProfitabilityPanel.js','./src/lib/profitability.js'])assert.ok(sw.includes(asset),asset);
  assert.match(sw,/const CACHE = 'lourex-invoice-v134'/);
  assert.match(sw,/v103 saved-item compatibility/);
  assert.match(sw,/v116 workflow preset compatibility/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v133'/);
});
