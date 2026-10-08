import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {parseAiProductGroupPriceIntent,prepareAiProductGroupPrice} from '../dist/src/lib/ai-product-group-price.js';
import {createAiToolRuntime,deterministicAiToolPlan,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {applyAiBulkProductUpdate} from '../dist/src/lib/ai-product-bulk-update.js';
const stamp='2026-09-01T00:00:00.000Z';
function product(id,name,sku,price='8.00',currency='USD',workspaceId='default',packing=''){
  return{id,workspaceId,createdAt:stamp,updatedAt:stamp,sku,descriptionEn:name,descriptionAr:'',
    hsCode:'',origin:'TR',packing,unit:'CTN',lastUnitPrice:price,lastCurrency:currency,
    lastUnitCost:'5.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',category:'Snacks',tags:[],archived:false};
}
function vault(){
  const v=emptyVault();
  v.savedItems=[
    product('s1','Snickers 50g','SN-50', '8.00'),
    product('s2','Snickers Peanut 50 g','SN-50-2','9.00'),
    product('s3','Snickers 150g','SN-150','11.00'),
    product('s4','SuperSnickers 50g','SS-50','13.00'),
    product('s5','Mars 50g','MARS-50','7.00'),
    product('outside','Snickers 50g','OUT','4.00','USD','other')
  ];
  return v;
}
function runtime(v){return createAiToolRuntime(v,{assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null}});}
test('B05: Arabic and English exact group price commands resolve locally and preserve currency',()=>{
  assert.deepEqual(parseAiProductGroupPriceIntent('Set Snickers 50g price to 12.50 USD'),{nameContains:'snickers',sizeGrams:'50',unitPrice:'12.50',currency:'USD'});
  assert.deepEqual(parseAiProductGroupPriceIntent('خلي سعر سنيكرز ٥٠ غرام ١٢ دولار'),{nameContains:'سنيكرز',sizeGrams:'50',unitPrice:'12',currency:'USD'});
  assert.equal(parseAiProductGroupPriceIntent('What is the price of Snickers 50g?'),null);
  assert.equal(parseAiProductGroupPriceIntent('Do not change Snickers 50g price to 12 USD'),null);
  assert.equal(parseAiProductGroupPriceIntent('Increase all product prices 5%'),null);
});
test('B05: only exact group and exact pack size are changed after one approved preview',()=>{
  const v=vault(),before=JSON.stringify(v);
  const intent=parseAiProductGroupPriceIntent('Set Snickers 50g price to 12.50 USD');
  const plan=deterministicAiToolPlan('Set Snickers 50g price to 12.50 USD',runtime(v));
  assert.equal(plan.calls[0].tool,'product.bulkUpdate');
  assert.deepEqual(plan.calls[0].args.groupPrice,intent);
  const result=executeAiToolPlan(runtime(v),plan);
  assert.equal(result.proposal.capability,'tool.execute');
  assert.equal(result.proposal.preview.length,2);
  assert.equal(result.proposal.preview[0].before.lastUnitPrice,'8.00');
  assert.equal(result.proposal.preview[0].after.lastUnitPrice,'12.50');
  assert.equal(JSON.stringify(v),before);
  const saved=applyAiBulkProductUpdate(v,result.proposal.args,'2026-10-08T12:00:00.000Z');
  assert.deepEqual(saved.savedItems.map(row=>row.lastUnitPrice),['12.50','12.50','11.00','13.00','7.00','4.00']);
  assert.equal(saved.savedItems[0].sku,'SN-50');
});
test('B05: size can come from packing, but product name must be explicit',()=>{
  const v=vault();
  v.savedItems.push(product('s6','Snickers Cream','SN-C','14.00','USD','default','50 gr'));
  const batch=prepareAiProductGroupPrice(v,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'16.00',currency:'USD'});
  assert.equal(batch.rows.length,3);
  assert.deepEqual(batch.rows.map(row=>row.itemId),['s1','s2','s6']);
});
test('B05: Arabic product names and recorded-currency fallback remain scoped',()=>{
  const v=vault();
  v.savedItems.push(product('ar1','سنيكرز 50 غرام','AR-1','10.00','SAR'));
  const batch=prepareAiProductGroupPrice(v,{nameContains:'سنيكرز',sizeGrams:'50',unitPrice:'12.50',currency:'SAR'});
  assert.equal(batch.rows.length,1);
  assert.equal(batch.rows[0].patch.lastCurrency,'SAR');
});
test('B05: mixed currencies without requested currency, unsupported price or absent group all fail closed',()=>{
  const v=vault();
  v.savedItems[1].lastCurrency='SAR';
  assert.throws(()=>prepareAiProductGroupPrice(v,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'12.50'}),/Mixed or missing/);
  assert.throws(()=>prepareAiProductGroupPrice(v,{nameContains:'Snickers',sizeGrams:'55',unitPrice:'12.50',currency:'USD'}),/No saved products/);
  assert.throws(()=>prepareAiProductGroupPrice(v,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'-10',currency:'USD'}),/valid selling price/);
  assert.throws(()=>prepareAiProductGroupPrice(v,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'10.123',currency:'USD'}),/valid selling price/);
  assert.throws(()=>prepareAiProductGroupPrice(v,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'10',currency:'USDT'}),/Invalid explicit/);
  assert.throws(()=>prepareAiProductGroupPrice(v,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'12.50',currency:'USD',stock:500}),/Unsupported/);
});
test('B05: stale approval, one no-op match or 121 rows aborts entire group without partial save',()=>{
  const v=vault();
  const batch=prepareAiProductGroupPrice(v,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'20',currency:'USD'});
  v.savedItems[0].updatedAt='2026-10-08';
  const before=JSON.stringify(v);
  assert.throws(()=>applyAiBulkProductUpdate(v,batch),/changed since preview/);
  assert.equal(JSON.stringify(v),before);
  const clean=vault();
  clean.savedItems[1].lastUnitPrice='20';
  assert.throws(()=>prepareAiProductGroupPrice(clean,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'20',currency:'USD'}),/already has/);
  const large=vault();
  for(let i=0;i<120;i++)large.savedItems.push(product('extra-'+i,'Snickers 50g Special '+i,'S-'+i));
  assert.throws(()=>prepareAiProductGroupPrice(large,{nameContains:'Snickers',sizeGrams:'50',unitPrice:'20',currency:'USD'}),/More than 120/);
});
test('B05: planner-origin group filter cannot bypass explicit local user instruction',async()=>{
  const client=await readFile('src/lib/ai-tool-client.ts','utf8');
  assert.match(client,/Object\.hasOwn\(call\.args,'groupPrice'\)/);
  const source=await readFile('src/lib/ai-tool-orchestrator.ts','utf8');
  assert.match(source,/parseAiProductGroupPriceIntent\(message\)/);
  assert.match(source,/prepareAiProductGroupPrice\(runtime\.vault,args\.groupPrice\)/);
});
